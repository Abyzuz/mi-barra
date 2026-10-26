// mi-barra: la barra sobre el prompt. Este archivo solo engancha eventos y
// dibuja; la lógica vive en ../src (pura, con tests).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Escalada, EtapaFile, EtapaId, EtapaLeida, SyncStatus, Usage } from '../types'
import { ARCHIVO_ESTADO, filaContexto, leerUmbrales, pasoToast, siguienteEscalon, textoT1, textoT2, type Umbrales } from '../src/contexto.ts'
import {
  decidirEtapa,
  diaUso,
  DIAS_USO,
  etapaGauge,
  formatEtapa,
  mensajeCambio,
  parseArgsEtapa,
  parseEtapa,
  rotuloEtapa,
  rutaEtapa,
  rutaProhibida,
  textoEstado,
  textoT5,
  textoT8,
  ultimoSegmento,
  vistaEtapa,
} from '../src/etapa.ts'
import {
  etapaEsperada,
  filaEscalada,
  skillDeLlamada,
  textoT7,
  toastEscalada,
  varianteEscalada,
  type BotonEscalada,
} from '../src/escalada.ts'
import { EMPTY_USAGE, gauges, pickLimit, rotuloCorto, valorCorto, type Gauge } from '../src/gauges.ts'
import { INITIAL_MOOD, MOOD_GLYPH, MOOD_LABEL, nextMood, type MoodEvent } from '../src/mood.ts'
import { planRelleno } from '../src/relleno.ts'
import { etapaSvg, mascotSvg, ringSvg } from '../src/svg.ts'
import { parseStatus, syncGauge } from '../src/sync.ts'

/** Duración supuesta del caché. La API no la informa: cámbiala aquí (5 min = 5 * 60 * 1000). */
const CACHE_TTL_MS = 60 * 60 * 1000
/** Cuánto dura "terminado" antes de pasar a "inactivo". */
const DONE_TO_IDLE_MS = 2 * 60 * 1000
/** Cada cuánto se redibujan los tiempos (caché, reinicios). */
const TICK_MS = 15 * 1000
/** Cuánto espera el primer prompt a que termine la lectura de la etapa antes de salir sin T5. */
const TOPE_LECTURA_T5_MS = 2000

const moodAtom = atom({ plugin: 'mi-barra', key: 'mood' } as const, INITIAL_MOOD)
const usageAtom = atom({ plugin: 'mi-barra', key: 'usage' } as const, EMPTY_USAGE)
const cacheAtAtom = atom({ plugin: 'mi-barra', key: 'cacheAt' } as const, null)
const nowAtom = atom({ plugin: 'mi-barra', key: 'now' } as const, 0)
const syncAtom = atom({ plugin: 'mi-barra', key: 'sync' } as const, null as SyncStatus | null)
const plegadoHastaAtom = atom({ plugin: 'mi-barra', key: 'plegadoHasta' } as const, null as number | null)
const toastArmadoAtom = atom({ plugin: 'mi-barra', key: 'toastArmado' } as const, true)
const copiaPendienteAtom = atom({ plugin: 'mi-barra', key: 'copiaPendiente' } as const, null as string | null)
const etapaAtom = atom({ plugin: 'mi-barra', key: 'etapa' } as const, null as EtapaLeida | null)
type T5 = { texto: string; adjuntado: boolean }
const t5Atom = atom({ plugin: 'mi-barra', key: 't5' } as const, null as T5 | null)
const arranqueAtom = atom({ plugin: 'mi-barra', key: 'arranque' } as const, 0)
const dosSemanasIgnoradoAtom = atom({ plugin: 'mi-barra', key: 'dosSemanasIgnorado' } as const, false)
const escaladaAtom = atom({ plugin: 'mi-barra', key: 'escalada' } as const, null as Escalada | null)

type UsageLike = {
  context: { percent?: number; tokens?: number; window: number }
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
}

function toUsage(u: UsageLike): Usage {
  return {
    context: u.context.percent ?? null,
    contextTokens: u.context.tokens ?? null,
    contextWindow: u.context.window,
    fiveHour: pickLimit(u.rateLimits, 'five_hour'),
    week: pickLimit(u.rateLimits, 'seven_day'),
  }
}

/** La raíz del proyecto: la del árbol principal aunque la sesión corra en un worktree. */
async function proyectoRaiz($: EngineInterface): Promise<string> {
  return (await $.session.repo())?.root ?? (await $.session.root())
}

/** El HOME del usuario según el entorno; null si no se sabe. Nunca lanza. */
async function homeDe($: EngineInterface): Promise<string | null> {
  try {
    return (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || null
  } catch {
    return null
  }
}

/**
 * Lee y entiende `<raíz>/.claude/etapa.json` sin tocar átomos. Sin archivo
 * (ENOENT) no hay problema que contar; otro error de lectura sí.
 */
async function leerArchivoEtapa($: EngineInterface, raiz: string): Promise<{ file: EtapaFile | null; problema: string | null }> {
  let texto: string
  try {
    texto = await $.fs.read(rutaEtapa(raiz))
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err)
    // "No existe" es lo único que cuenta como ausencia (el motor dice `…failed: ENOENT`, medido en 302 y 308):
    // /etapa no escribe sobre un archivo que existe y no se lee, así que no se amplía el patrón.
    if (/ENOENT/.test(motivo)) return { file: null, problema: null }
    return { file: null, problema: `mi-barra: no se pudo leer etapa.json: ${motivo}` }
  }
  return parseEtapa(texto)
}

/**
 * Lee la etapa del proyecto y deja el resultado en el átomo, solo si cambió. En una
 * raíz prohibida (HOME, unidad, ~/.claude, scratch) no lee nada. Nunca lanza; el
 * problema, si lo hay, va una vez al debug log.
 */
async function leerEtapa($: EngineInterface): Promise<T5 | null> {
  let problema: string | null = null
  let congelado: T5 | null = null
  try {
    const raiz = await proyectoRaiz($)
    const prohibida = rutaProhibida(raiz, await homeDe($))
    const leido = prohibida ? { file: null, problema: null } : await leerArchivoEtapa($, raiz)
    problema = leido.problema
    const nueva: EtapaLeida = { raiz, carpeta: ultimoSegmento(raiz), prohibida, file: leido.file }
    // T5 se congela la primera vez que la lectura termina bien en la sesión (D10): el texto de ese momento, no el del archivo de después.
    // Con un error de lectura no se congela (quedaría "sin etapa" toda la sesión): se reintenta en el próximo tick.
    if (leido.problema === null) {
      const texto = !prohibida && leido.file !== null ? textoT5(leido.file, nueva.carpeta) : ''
      congelado = await update($, t5Atom, prev => prev ?? { texto, adjuntado: false })
    }
    const anterior = await read($, etapaAtom)
    if (JSON.stringify(anterior) === JSON.stringify(nueva)) return congelado
    await update($, etapaAtom, () => nueva)
    await limpiarEscalada($)
  } catch (err) {
    problema = `mi-barra: no se pudo leer la etapa: ${err instanceof Error ? err.message : String(err)}`
  }
  if (problema === null) return congelado
  try {
    $.ui.log(problema, { to: 'debug' })
  } catch {
    // Sin log: la barra sigue sin etapa.
  }
  return congelado
}

/** Dónde deja el motor wsync su estado: `~/.claude/workspace/status.json`; null sin home. */
async function statusPath($: EngineInterface): Promise<string | null> {
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  return home ? `${home}/.claude/workspace/status.json` : null
}

/** Lee status.json; si falta o no se entiende, el indicador se oculta. Nunca lanza. */
async function readSync($: EngineInterface, path: string | null): Promise<void> {
  let status: SyncStatus | null = null
  if (path !== null) {
    try {
      status = parseStatus(await $.fs.read(path))
    } catch {
      // Sin archivo: equipo sin espacio de trabajo.
    }
  }
  try {
    await update($, syncAtom, prev => (JSON.stringify(prev) === JSON.stringify(status) ? prev : status))
  } catch {
    // Sin escritura: el indicador queda como estaba y la barra sigue.
  }
}

/**
 * Deja `texto` en el cuadro del prompt: vacío -> reemplaza; con borrador -> añade
 * debajo. Nunca envía. Si el cuadro no lo toma (sin cuadro, un diálogo, un fallo),
 * plan B: guarda el texto para el botón «Copiar», avisa con un toast y devuelve false.
 */
async function dejarEnPrompt($: EngineInterface, texto: string): Promise<boolean> {
  let lleno = false
  try {
    const { text: borrador } = await $.prompt.read()
    const plan = planRelleno(borrador, texto)
    lleno = (await $.prompt.fill({ text: plan.text, mode: plan.mode })).isFilled
  } catch {
    lleno = false
  }
  await update($, copiaPendienteAtom, () => (lleno ? null : texto))
  if (!lleno) {
    try {
      $.ui.toast('No pude escribir en el prompt: cópialo con el botón')
    } catch {
      // Sin toast: la fila de copia ya muestra el texto.
    }
  }
  return lleno
}

/**
 * Cambia la etapa del proyecto (la decisión vive en `decidirEtapa`; aquí solo los `$`):
 * relee el archivo del disco (D9), escribe `<raíz>/.claude/etapa.json`, y solo si la
 * escritura salió bien actualiza el átomo y, con `dejarTexto`, deja el traspaso en el
 * prompt. La Task 6 la reutiliza desde los botones de la fila de escalada.
 */
async function aplicarEtapa(
  $: EngineInterface,
  nueva: EtapaId,
  nombre: string | null,
  o: { dejarTexto: boolean; soloAdelante?: boolean },
): Promise<{ ok: boolean; mensaje: string }> {
  const d = await decidirEtapa(
    { raiz: await proyectoRaiz($), home: await homeDe($), nueva, nombre, ahora: await $.clock.now(), arranque: await read($, arranqueAtom), soloAdelante: o.soloAdelante },
    raiz => leerArchivoEtapa($, raiz),
  )
  if (d.accion === 'rechazar') return { ok: false, mensaje: d.mensaje }
  if (d.accion === 'igual') return { ok: true, mensaje: d.mensaje }
  try {
    await $.fs.write(d.ruta, formatEtapa(d.file))
  } catch (err) {
    return { ok: false, mensaje: `No pude escribir ${d.ruta}: ${err instanceof Error ? err.message : String(err)}` }
  }
  // El archivo ya cambió: si el átomo falla, el comando lo dice con verdad (la barra se pone al día en el próximo tick).
  let barraAlDia = true
  try {
    await update($, etapaAtom, () => d.leida)
    await limpiarEscalada($)
  } catch (err) {
    barraAlDia = false
    try {
      $.ui.log(`mi-barra: etapa.json escrito, pero no pude actualizar la barra: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    } catch {
      // Sin log: el texto del comando ya lo dice.
    }
  }
  let traspaso: 'prompt' | 'copiar' | 'ninguno' = 'ninguno'
  if (o.dejarTexto && d.texto !== '') {
    let lleno = false
    try {
      lleno = await dejarEnPrompt($, d.texto)
    } catch {
      // El archivo ya está escrito: el traspaso cae al plan B.
    }
    traspaso = lleno ? 'prompt' : 'copiar'
  }
  return { ok: true, mensaje: mensajeCambio({ nueva, anterior: d.anterior, reinicio: d.reinicio, proyecto: d.file.proyecto, traspaso, texto: d.texto, barraAlDia }) }
}

/**
 * Espera `promesa` hasta `ms` milisegundos del reloj del motor y devuelve su valor, o null si se acabó el tope.
 * Nunca lanza y no deja el temporizador vivo.
 */
async function esperar<T>($: EngineInterface, promesa: Promise<T | null>, ms: number): Promise<T | null> {
  const corte = new AbortController()
  try {
    return await Promise.race([promesa, $.clock.sleep(ms, { signal: corte.signal }).then(() => null, () => null)])
  } catch {
    return null
  } finally {
    corte.abort()
  }
}

/** Quita el aviso de escalada si la etapa de ahora ya es la esperada (la fila no se dibuja; aquí se suelta el átomo). Nunca lanza. */
async function limpiarEscalada($: EngineInterface): Promise<void> {
  try {
    const esc = await read($, escaladaAtom)
    const leida = await read($, etapaAtom)
    if (esc !== null && leida !== null && varianteEscalada(leida.file?.etapa ?? null, esc.esperada) === null) await update($, escaladaAtom, () => null)
  } catch {
    // Sin átomo: la fila ya no se dibuja si coincide.
  }
}

/**
 * Una skill que pide su propia sesión arrancó (por `tool.call` de Skill o por un comando tecleado, con o sin
 * prefijo `<plugin>:`): si su etapa no es la del proyecto, deja el aviso en el átomo y, para plan y ejecución, un toast. No avisa con la
 * lectura de la etapa pendiente (P-M21). Nunca toca la llamada.
 */
async function señalarSkill($: EngineInterface, nombre: string): Promise<void> {
  const esperada = etapaEsperada(nombre)
  if (esperada === null) return
  const leida = await read($, etapaAtom)
  if (leida === null) return
  const actual = leida.file?.etapa ?? null
  const variante = varianteEscalada(actual, esperada)
  if (variante === null) return
  await update($, escaladaAtom, () => ({ skill: nombre, esperada }))
  if (!toastEscalada(esperada)) return
  try {
    $.ui.toast('⚠ ' + filaEscalada(variante, esperada, actual, leida.carpeta, leida.prohibida).texto)
  } catch {
    // Sin toast: la fila de escalada sigue ahí.
  }
}

/** El aviso de escalada no pudo guardarse: una línea al debug log; la llamada o el comando siguen. Nunca lanza. */
function anotarFalloEscalada($: EngineInterface, err: unknown): void {
  try {
    $.ui.log(`mi-barra: no pude avisar de la escalada: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  } catch {
    // Sin log: la llamada sigue igual.
  }
}

/** Un botón de la fila de escalada. Los de acción cierran la fila; si el cambio de etapa falla, avisa y la deja. */
async function pulsarEscalada($: EngineInterface, key: BotonEscalada['key'], esc: Escalada, carpeta: string): Promise<void> {
  try {
    if (key === 'esc-marcar' || key === 'esc-pasar') {
      const r = await aplicarEtapa($, esc.esperada, null, { dejarTexto: key === 'esc-pasar', soloAdelante: true })
      if (!r.ok) {
        $.ui.toast(r.mensaje)
        return
      }
    } else if (key === 'esc-pedir') {
      await dejarEnPrompt($, textoT7(carpeta))
    }
    await update($, escaladaAtom, () => null)
  } catch (err) {
    try {
      $.ui.toast(`No pude hacerlo: ${err instanceof Error ? err.message : String(err)}`)
    } catch {
      // Sin toast: la fila queda para intentarlo de nuevo.
    }
  }
}

async function feed($: EngineInterface, event: MoodEvent): Promise<void> {
  await update($, moodAtom, mood => nextMood(mood, event))
}

/** Barrita de texto para el terminal: "██░░░" (caracteres que traen casi todas las fuentes). */
function bar(fill: number | null): string {
  if (fill === null) return '·····'
  const n = Math.round(fill * 5)
  return '█'.repeat(n) + '░'.repeat(5 - n)
}

function terminalLine(g: Gauge): string {
  if (g.key === 'sync') return `${g.label} ${g.value}`
  // Sin anillo (la Etapa), la pista se queda con el valor: es la única forma de ver el proyecto y el día de uso en el terminal.
  if (g.fill === null) return g.hint ? `${g.label} ${g.value} (${g.hint})` : `${g.label} ${g.value}`
  return `${g.label} ${bar(g.fill)} ${g.value}${g.hint ? ` (${g.hint})` : ''}`
}

/** Guarda la medición y aplica lo que depende de ella: plegado y toast de rojo. */
async function aplicarMedicion($: EngineInterface, usage: Usage, umbrales: Umbrales): Promise<void> {
  await update($, usageAtom, () => usage)
  const tokens = usage.contextTokens
  // Sin dato o por debajo de ámbar (p. ej. tras compactar): el aviso vuelve a sonar.
  if (tokens === null || tokens < umbrales.ambar) await update($, plegadoHastaAtom, () => null)
  const armado = await read($, toastArmadoAtom)
  const paso = pasoToast(armado, tokens, umbrales.rojo)
  if (paso.armado !== armado) await update($, toastArmadoAtom, () => paso.armado)
  if (paso.mostrar && tokens !== null) {
    try {
      $.ui.toast(textoT2(tokens))
    } catch {
      // Sin toast: la fila de aviso sigue ahí.
    }
  }
}

export const register: Register = (on, options) => {
  const { umbrales, aviso } = leerUmbrales(options)
  let finishedAt: number | null = null
  let lastChunkKind: string | null = null
  let syncPath: string | null = null
  // Una sola lectura de etapa.json a la vez (P-F04: vive en este cierre, no en el módulo).
  let leyendo = false
  // La lectura en curso (o la última): el primer prompt la espera, con tope, si T5 aún no se congeló.
  let lectura: Promise<T5 | null> | null = null
  const seguirLectura = (en: Promise<T5 | null>): void => {
    leyendo = true
    lectura = en.finally(() => {
      leyendo = false
    })
  }
  // Respaldo si el átomo t5 no se deja escribir tras adjuntar: sin esto el texto se repetiría en cada prompt.
  let adjuntadoSinAtomo = false
  // Un envío adjuntando a la vez: dos prompts seguidos no llevan el texto dos veces.
  let adjuntando = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      if (aviso !== null) $.ui.log(aviso, { to: 'debug' })
    } catch {
      // Sin log: la barra se inicializa igual.
    }
    const now = await $.clock.now()
    await update($, nowAtom, () => now)
    await update($, arranqueAtom, prev => prev || now)
    // Sin await: una lectura que no termina no frena el arranque.
    seguirLectura(leerEtapa($))
    try {
      await aplicarMedicion($, toUsage(await $.session.usage()), umbrales)
    } catch {
      // Sin lectura: los indicadores quedan "no disponible".
    }
    try {
      await $.command.register({ name: 'tanda', description: 'Deja en el prompt el pedido de cerrar la tanda (regla 3)' })
    } catch {
      // Sin comando: el botón de la banda sigue sirviendo.
    }
    try {
      await $.command.register({
        name: 'etapa',
        description: 'Muestra o cambia la etapa del proyecto (y deja el traspaso en el prompt)',
        argumentHint: '[spec|plan|ejecucion|final|uso] [nombre]',
      })
    } catch {
      // Sin comando: la etapa se marca a mano en el archivo.
    }
    try {
      syncPath = await statusPath($)
      await readSync($, syncPath)
    } catch {
      // Sin home ni lectura: el indicador de sync no aparece.
    }
    $.clock.every(TICK_MS, () => {
      void (async () => {
        const tick = await $.clock.now()
        await update($, nowAtom, () => tick)
        if (!leyendo) seguirLectura(leerEtapa($))
        await readSync($, syncPath)
        const mood = await read($, moodAtom)
        if (mood === 'terminado' && (finishedAt === null || tick - finishedAt >= DONE_TO_IDLE_MS)) {
          await feed($, { type: 'idle' })
        }
      })()
    })
    return result
  })

  // Contexto y límites: el motor los empuja después de cada turno.
  on('session.measure', async ($, e, next) => {
    try {
      await aplicarMedicion($, toUsage(e), umbrales)
    } catch (err) {
      try {
        $.ui.log('mi-barra: no se pudo guardar la medición: ' + (err instanceof Error ? err.message : String(err)), { to: 'debug' })
      } catch {
        // Sin log: la medición se pierde, la cadena sigue.
      }
    }
    return next(e)
  })

  // /tanda: lo mismo que «Cerrar tanda», para el terminal y el teclado. Responde
  // solo (P-F06): nunca lanza, un fallo vuelve como texto.
  on('command.run', { command: 'tanda' }, async $ => {
    try {
      const tokens = (await read($, usageAtom)).contextTokens
      if (tokens === null) return { text: 'Contexto no disponible todavía: espera la primera respuesta.' }
      const texto = textoT1(tokens, (await read($, etapaAtom))?.file?.etapa ?? null)
      if (await dejarEnPrompt($, texto)) return { text: 'Dejé el pedido de cierre en el prompt.' }
      return { text: 'No pude escribir en el prompt. Cópialo de aquí:\n' + texto }
    } catch (err) {
      return { text: 'No pude preparar el cierre: ' + (err instanceof Error ? err.message : String(err)) }
    }
  })

  // /etapa: sin argumento muestra la etapa; con argumento la cambia y deja el traspaso en
  // el prompt. Responde solo (P-F06): nunca lanza, un fallo vuelve como texto.
  on('command.run', { command: 'etapa' }, async ($, e) => {
    try {
      const { etapa, nombre, error } = parseArgsEtapa(e.args)
      if (error !== null) return { text: error }
      if (etapa === null) {
        const leida = await read($, etapaAtom)
        return { text: leida === null ? 'Todavía leyendo la etapa: prueba de nuevo en unos segundos.' : textoEstado(leida, await read($, t5Atom)) }
      }
      return { text: (await aplicarEtapa($, etapa, nombre, { dejarTexto: true })).mensaje }
    } catch (err) {
      return { text: 'No pude cambiar la etapa: ' + (err instanceof Error ? err.message : String(err)) }
    }
  })

  // Escalada (spec §4.3, vía R22): una skill que pide su propia sesión arranca, ya sea por la herramienta Skill
  // del modelo (solo el hilo principal) o por un comando tecleado (`/brainstorming` o `/superpowers:brainstorming`).
  // Ambos hooks solo miran: la llamada y el comando siguen intactos, y `next(e)` siempre, aunque falle lo suyo.
  // El de `command.run` no tiene matcher de nombre y nunca responde: `señalarSkill` filtra por el mapa de skills,
  // así que lo que no está en él (/etapa, /tanda, los del motor) pasa de largo.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        const skill = skillDeLlamada(e)
        if (skill !== null) await señalarSkill($, skill)
      } catch (err) {
        anotarFalloEscalada($, err)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', async ($, e, next) => {
    try {
      // Con o sin prefijo `<plugin>:`: `señalarSkill` filtra por el mapa, así que `etapa`, `tanda` y los del motor no avisan.
      await señalarSkill($, e.command)
    } catch (err) {
      anotarFalloEscalada($, err)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // T5 (spec §4.2, vía R22): el texto de la etapa viaja una sola vez por sesión, como contexto del primer
  // prompt del usuario. Ni los meta ni los comandos lo reciben ni gastan el turno; los subagentes no pasan
  // por aquí (S6b). Solo lee el átomo t5: nunca el disco. Marca `adjuntado` solo si el envío no se descartó.
  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta || e.command !== undefined || adjuntando || adjuntadoSinAtomo) return next(e)
    // La bandera se levanta antes de la primera espera: el segundo prompt que llega mientras tanto no repite el texto.
    adjuntando = true
    try {
      let t5 = await read($, t5Atom)
      if (t5 === null && lectura !== null) {
        // La sesión nació con su primer prompt (app, -p): se espera la lectura que ya corre, nunca se lee el disco aquí.
        t5 = await esperar($, lectura, TOPE_LECTURA_T5_MS)
      }
      if (t5 === null || t5.texto === '' || t5.adjuntado) return await next(e)
      const resultado = await next({ ...e, context: [...(e.context ?? []), t5.texto] })
      // Valor, no clave: `drop: undefined` es un envío que entró.
      if (resultado.drop === undefined) {
        try {
          await update($, t5Atom, prev => (prev === null ? prev : { ...prev, adjuntado: true }))
        } catch (err) {
          adjuntadoSinAtomo = true
          try {
            $.ui.log(`mi-barra: T5 adjuntado, pero no pude marcarlo: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
          } catch {
            // Sin log: el respaldo ya evita repetirlo.
          }
        }
      }
      return resultado
    } finally {
      adjuntando = false
    }
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      lastChunkKind = null
      await feed($, { type: 'turn-start' })
    }
    return next(e)
  })

  // Pensando / escribiendo: según el tipo de fragmento que llega del modelo.
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    if (e.agentId !== undefined) return yield* stream
    for (;;) {
      const step = await stream.next()
      if (step.done) return step.value
      const chunk = step.value
      if ((chunk.kind === 'thinking' || chunk.kind === 'text' || chunk.kind === 'tool') && chunk.kind !== lastChunkKind) {
        lastChunkKind = chunk.kind
        await feed($, { type: 'chunk', kind: chunk.kind })
      }
      yield chunk
    }
  })

  // Esperando permiso: solo si el motor dispara PermissionRequest. Si no lo
  // dispara (p. ej. la app maneja el diálogo), la mascota nunca entra aquí.
  on('classic.PermissionRequest', async ($, e, next) => {
    await feed($, { type: 'permission-asked' })
    return next(e)
  }).catch(($, e, next) => next(e))

  // La llamada se resolvió (aprobada, rechazada o fallida): sale del permiso.
  on('tool.call', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      lastChunkKind = null
      await feed($, { type: 'tool-settled' })
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      finishedAt = now
      await feed($, { type: 'turn-end' })
      const usage = e.usage
      if (usage && usage.cache_read_input_tokens + usage.cache_creation_input_tokens > 0) {
        await update($, cacheAtAtom, () => now)
        await update($, nowAtom, () => now)
      }
      await readSync($, syncPath)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const mood = await read($, moodAtom)
    const usage = await read($, usageAtom)
    const cacheAt = await read($, cacheAtAtom)
    const now = await read($, nowAtom)
    const sync = syncGauge(await read($, syncAtom), now)
    const etapa = await read($, etapaAtom)
    const vista = vistaEtapa(etapa, now)
    const etapaId = etapa?.file?.etapa ?? null
    const todos = [etapaGauge(vista), ...gauges(usage, cacheAt, now, CACHE_TTL_MS, umbrales)].concat(sync ? [sync] : [])
    const tokens = usage.contextTokens
    const fila = filaContexto(tokens, umbrales, await read($, plegadoHastaAtom))
    const enRojo = tokens !== null && tokens >= umbrales.rojo
    const esc = await read($, escaladaAtom)
    const varEsc = esc !== null && etapa !== null ? varianteEscalada(etapaId, esc.esperada) : null
    const filaEsc = esc !== null && etapa !== null && varEsc !== null ? filaEscalada(varEsc, esc.esperada, etapaId, etapa.carpeta, etapa.prohibida) : null

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const linea = `${MOOD_GLYPH[mood]} ${MOOD_LABEL[mood]} │ ${todos.map(terminalLine).join(' │ ')}`
      // Los avisos, la escalada primero.
      const avisos = [filaEsc, fila].filter(a => a !== null).map(a => `⚠ ${a.texto}`)
      if (avisos.length === 0) return <Text wrap="truncate-end">{linea}</Text>
      // D12: con filas de sobra, cada aviso va en su propia línea encima; con una sola, todo en una línea con los avisos delante.
      if (e.props.maxRows < 2) return <Text wrap="truncate-end">{`${avisos.join(' │ ')} │ ${linea}`}</Text>
      return (
        <Box flexDirection="column">
          {e.props.maxRows - 1 >= avisos.length ? (
            avisos.map(a => <Text key={a} wrap="truncate-end">{a}</Text>)
          ) : (
            <Text wrap="truncate-end">{avisos.join(' │ ')}</Text>
          )}
          <Text wrap="truncate-end">{linea}</Text>
        </Box>
      )
    }

    const copia = await read($, copiaPendienteAtom)
    const dia = etapa?.file ? diaUso(etapa.file, now) : null
    const dosSemanas = etapa?.file && dia !== null && dia >= DIAS_USO && !(await read($, dosSemanasIgnoradoAtom)) ? etapa.file : null
    const { Box, Button, Svg, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" gap={1}>
        {/* En la app no se oculta ningún indicador: cada uno es un anillo con su valor dentro y la etiqueta debajo; en una fila a ancho normal, y si no caben la Box envuelve y los últimos bajan a una segunda. */}
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={1}>
          <Svg key="pet" source={mascotSvg(mood, enRojo)} alt={`Mascota: ${MOOD_LABEL[mood]}`} width={32} height={32} isInteractive />
          {todos.map(g => (
            <Box key={g.key} flexDirection="column" alignItems="center">
              <Svg
                source={g.key === 'etapa' ? etapaSvg(vista.indice, valorCorto(g)) : ringSvg(g.fill, g.tone, valorCorto(g))}
                alt={`${g.label}: ${g.value}${g.hint ? ` · ${g.hint}` : ''}`}
                width={34}
                height={34}
              />
              <Text dimColor wrap="truncate-end">{g.key === 'etapa' ? rotuloEtapa(etapa, now) : rotuloCorto(g)}</Text>
            </Box>
          ))}
        </Box>
        {filaEsc === null || esc === null || etapa === null ? null : (
          <Box key="fila-escalada" flexDirection="row" alignItems="center" gap={2}>
            <Text>{filaEsc.texto}</Text>
            {filaEsc.botones.map(b => (
              <Button
                key={b.key}
                variant={b.key === 'esc-marcar' || b.key === 'esc-pasar' ? 'primary' : 'secondary'}
                onPress={async () => {
                  await pulsarEscalada($, b.key, esc, etapa.carpeta)
                }}
              >
                {b.label}
              </Button>
            ))}
          </Box>
        )}
        {fila === null || tokens === null ? null : (
          <Box key="fila-contexto" flexDirection="row" alignItems="center" gap={2}>
            <Text>{fila.texto}</Text>
            <Button
              key="tanda-cerrar"
              variant={fila.nivel === 'rojo' ? 'primary' : 'secondary'}
              onPress={async () => {
                await dejarEnPrompt($, textoT1(tokens, etapaId))
              }}
            >
              Cerrar tanda
            </Button>
            <Button
              key="tanda-seguir"
              onPress={async () => {
                await update($, plegadoHastaAtom, () => siguienteEscalon(tokens, umbrales.rojo))
              }}
            >
              Seguir aquí
            </Button>
          </Box>
        )}
        {dosSemanas === null ? null : (
          <Box key="fila-uso" flexDirection="row" alignItems="center" gap={2}>
            <Text>Dos semanas de uso real: anota los errores graves en ## Medición de {ARCHIVO_ESTADO}</Text>
            <Button
              key="uso-anotar"
              onPress={async () => {
                await dejarEnPrompt($, textoT8(dosSemanas.proyecto))
              }}
            >
              Anotar
            </Button>
            <Button
              key="uso-ignorar"
              onPress={async () => {
                await update($, dosSemanasIgnoradoAtom, () => true)
              }}
            >
              Ignorar
            </Button>
          </Box>
        )}
        {copia === null ? null : (
          <Box key="fila-copia" flexDirection="row" alignItems="center" gap={2}>
            <Text>{copia}</Text>
            <Button
              key="tanda-copiar"
              onPress={async () => {
                const r = await $.ui.copy({ text: copia, surface: e.surface })
                if (r.isCopied) await update($, copiaPendienteAtom, () => null)
              }}
            >
              Copiar
            </Button>
          </Box>
        )}
      </Box>
    )
  })
}
