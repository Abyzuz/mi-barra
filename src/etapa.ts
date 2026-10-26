// Etapa del proyecto: raíz y guarda de rutas, lectura de `.claude/etapa.json`,
// etiquetas, día de uso real y el texto T8. Puro: sin `$`, se prueba con strings.
import type { EtapaFile, EtapaId, EtapaLeida } from '../types'
import { ARCHIVO_ESTADO } from './contexto.ts'
import type { Gauge } from './gauges.ts'

export const ETAPAS: readonly EtapaId[] = ['spec', 'plan', 'ejecucion', 'final', 'uso']

export const ETIQUETA: Record<EtapaId, string> = {
  spec: 'Spec',
  plan: 'Plan',
  ejecucion: 'Ejecución',
  final: 'Revisión final',
  uso: 'Uso real',
}

const DIA_MS = 24 * 60 * 60 * 1000
/** Los días de uso real tras los que se pide anotar los errores graves. */
export const DIAS_USO = 14

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const esFecha = (v: unknown): v is string => esTexto(v) && !Number.isNaN(Date.parse(v))
const esEtapa = (v: unknown): v is EtapaId => typeof v === 'string' && (ETAPAS as readonly string[]).includes(v)

/**
 * Entiende el texto de `etapa.json`: quita el BOM, tolera CRLF y conserva los campos de más.
 * Si no es válido devuelve `file: null` y el motivo (la línea del debug log).
 */
export function parseEtapa(texto: string): { file: EtapaFile | null; problema: string | null } {
  const malo = (motivo: string) => ({ file: null, problema: `mi-barra: etapa.json ignorado: ${motivo}` })
  let datos: unknown
  try {
    datos = JSON.parse(texto.replace(/^\uFEFF/, ''))
  } catch {
    return malo('no es JSON')
  }
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return malo('no es un objeto')
  const d = datos as Record<string, unknown>
  if (d.v !== 1) return malo(`versión desconocida (${JSON.stringify(d.v)})`)
  if (!esTexto(d.proyecto)) return malo('falta el proyecto')
  if (!esEtapa(d.etapa)) return malo(`etapa desconocida (${JSON.stringify(d.etapa)})`)
  if (!esFecha(d.desde)) return malo('"desde" no es una fecha')
  if (!esFecha(d.inicio)) return malo('"inicio" no es una fecha')
  if (!Array.isArray(d.historial)) return malo('falta el historial')
  const historial: EtapaFile['historial'] = []
  for (const h of d.historial as unknown[]) {
    const e = (typeof h === 'object' && h !== null ? h : {}) as Record<string, unknown>
    if (!esEtapa(e.etapa) || !esFecha(e.desde)) return malo('una entrada del historial no es válida')
    // Los campos de más (de la entrada y del archivo) se conservan: /etapa reescribe el archivo del usuario.
    historial.push({ ...e, etapa: e.etapa, desde: e.desde })
  }
  return { file: { ...d, v: 1, proyecto: d.proyecto, etapa: d.etapa, desde: d.desde, inicio: d.inicio, historial }, problema: null }
}

/** Lo que se escribe en disco: dos espacios y un salto final. */
export function formatEtapa(f: EtapaFile): string {
  return JSON.stringify(f, null, 2) + '\n'
}

const normalizar = (ruta: string): string => ruta.replace(/\\/g, '/').replace(/\/+$/, '')

/** Último tramo de la ruta, con `\` o `/` y con o sin barra final. */
export function ultimoSegmento(ruta: string): string {
  const n = normalizar(ruta)
  return n.slice(n.lastIndexOf('/') + 1)
}

const DATOS_APP = /\/claude-data\//

/**
 * Carpetas donde el mod no escribe ni lee etapa: el HOME, la raíz de una unidad,
 * `~/.claude` y lo que cuelga de él, y todo lo que cuelga de una carpeta `Claude-Data` (datos de la app: scratch, notas, sesiones). Compara
 * normalizando `\` a `/`, sin `/` final y sin distinguir mayúsculas.
 */
export function rutaProhibida(raiz: string, home: string | null): boolean {
  const r = normalizar(raiz).toLowerCase()
  if (r === '' || /^[a-z]:$/.test(r)) return true
  if (DATOS_APP.test(r + '/')) return true
  if (home === null || normalizar(home) === '') return false
  const h = normalizar(home).toLowerCase()
  return r === h || r === `${h}/.claude` || r.startsWith(`${h}/.claude/`)
}

/** `<raíz>/.claude/etapa.json`, sin barra doble si la raíz termina en separador. */
export function rutaEtapa(raiz: string): string {
  return `${raiz.replace(/[\\/]+$/, '')}/.claude/etapa.json`
}

/** Día de uso real, contado desde 1: `floor((ahora − desde) / 1 día) + 1`. `null` si la etapa no es `uso`. */
export function diaUso(f: EtapaFile, ahora: number): number | null {
  if (f.etapa !== 'uso') return null
  const desde = Date.parse(f.desde)
  if (Number.isNaN(desde)) return null
  return Math.max(1, Math.floor((ahora - desde) / DIA_MS) + 1)
}

export type VistaEtapa = { valor: string; pista: string; indice: number | null }

/** Lo que dibuja el anillo Etapa: valor, pista bajo él y el segmento (0 a 4; null = sin etapa). */
export function vistaEtapa(l: EtapaLeida | null, ahora: number): VistaEtapa {
  if (l === null) return { valor: 'sin etapa', pista: '', indice: null }
  if (l.file === null) return { valor: 'sin etapa', pista: l.carpeta, indice: null }
  const dia = diaUso(l.file, ahora)
  return {
    valor: ETIQUETA[l.file.etapa],
    pista: dia === null ? l.file.proyecto : `${l.file.proyecto} · día ${dia} de ${DIAS_USO}`,
    indice: ETAPAS.indexOf(l.file.etapa),
  }
}

const ROTULO_MAX = 12

/** La etiqueta bajo el anillo Etapa: el proyecto (hasta 12 caracteres con `…`), con `N/14` en uso real; "Etapa" sin etapa. */
export function rotuloEtapa(l: EtapaLeida | null, ahora: number): string {
  if (l === null || l.file === null) return 'Etapa'
  const p = l.file.proyecto
  const proyecto = p.length <= ROTULO_MAX ? p : `${p.slice(0, ROTULO_MAX - 1)}…`
  const dia = diaUso(l.file, ahora)
  return dia === null ? proyecto : `${proyecto} ${dia}/${DIAS_USO}`
}

/** T8: lo que la fila de las dos semanas deja en el prompt. */
export function textoT8(proyecto: string): string {
  return (
    `Pasaron dos semanas de uso real de ${proyecto}: anota en ${ARCHIVO_ESTADO}, bajo ## Medición, ` +
    'los errores graves aparecidos en uso real (meta 0) y cierra la tabla.'
  )
}

/** El anillo Etapa como indicador: sin llenado (el dibujo son segmentos), verde si hay etapa. */
export function etapaGauge(v: VistaEtapa): Gauge {
  return { key: 'etapa', label: 'Etapa', fill: null, value: v.valor, hint: v.pista, tone: v.indice === null ? 'off' : 'ok' }
}

/** El siguiente paso del flujo (`spec` → `plan` → … → `uso`); `null` tras `uso`. Un solo lugar (P-M10). */
export function siguienteEtapa(e: EtapaId): EtapaId | null {
  return ETAPAS[ETAPAS.indexOf(e) + 1] ?? null
}

const sinTildes = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '')

const VALORES = ETAPAS.join('|')

/** Para comparar nombres de proyecto como la etapa: sin mayúsculas ni tildes. */
const comparable = (t: string): string => sinTildes(t).toLowerCase()

/**
 * Los argumentos de `/etapa [etapa] [nombre]` (D6): la etapa sin mayúsculas ni tildes;
 * el nombre es el resto, recortado y con los espacios internos pasados a `-`.
 */
export function parseArgsEtapa(args: string): { etapa: EtapaId | null; nombre: string | null; error: string | null } {
  const partes = args.trim().split(/\s+/).filter(p => p !== '')
  if (partes.length === 0) return { etapa: null, nombre: null, error: null }
  const primera = sinTildes(partes[0]!).toLowerCase()
  if (!esEtapa(primera)) {
    return { etapa: null, nombre: null, error: `Etapa desconocida «${partes[0]}». Los valores son ${VALORES}. Uso: /etapa [${VALORES}] [nombre].` }
  }
  return { etapa: primera, nombre: partes.length > 1 ? partes.slice(1).join('-') : null, error: null }
}

export type TipoTransicion =
  | 'igual'
  | 'sin-previa'
  | 'spec-plan'
  | 'plan-ejecucion'
  | 'ejecucion-final'
  | 'a-uso'
  | 'uso-spec'
  | 'atras'
  | 'nuevo-nombre'

/** Lo que entra en la etapa `nueva` yendo hacia delante (D5: un salto deja el T3 de la transición que entra). */
const TIPO_ADELANTE: Partial<Record<EtapaId, TipoTransicion>> = { plan: 'spec-plan', ejecucion: 'plan-ejecucion', final: 'ejecucion-final' }

/**
 * Qué pasa al pasar de `actual` (el archivo leído; null = no hay) a `nueva`. Sin reinicio
 * conserva el archivo (`inicio`, `proyecto` y los campos de más) y suma al historial; con
 * reinicio (proyecto nuevo) empieza de cero con `inicioSesionIso`. `file` es null solo en `'igual'`.
 */
export function transicion(
  actual: EtapaFile | null,
  nueva: EtapaId,
  nombre: string | null,
  ahoraIso: string,
  inicioSesionIso: string,
  carpeta: string,
): { tipo: TipoTransicion; file: EtapaFile | null; reinicio: boolean } {
  const entrada = { etapa: nueva, desde: ahoraIso }
  const archivoNuevo = (proyecto: string): EtapaFile => ({ v: 1, proyecto, etapa: nueva, desde: ahoraIso, inicio: inicioSesionIso, historial: [entrada] })
  if (actual === null) {
    return { tipo: nueva === 'uso' ? 'a-uso' : 'sin-previa', file: archivoNuevo(nombre ?? carpeta), reinicio: false }
  }
  const otroNombre = nombre !== null && comparable(nombre) !== comparable(actual.proyecto)
  if (actual.etapa === nueva && !otroNombre) return { tipo: 'igual', file: null, reinicio: false }
  const usoSpec = actual.etapa === 'uso' && nueva === 'spec'
  if (usoSpec || otroNombre) {
    const tipo = nueva === 'uso' ? 'a-uso' : usoSpec ? 'uso-spec' : 'nuevo-nombre'
    return { tipo, file: archivoNuevo(nombre ?? carpeta), reinicio: true }
  }
  const adelante = ETAPAS.indexOf(nueva) > ETAPAS.indexOf(actual.etapa)
  const tipo: TipoTransicion = nueva === 'uso' ? 'a-uso' : adelante ? (TIPO_ADELANTE[nueva] ?? 'atras') : 'atras'
  return { tipo, file: { ...actual, etapa: nueva, desde: ahoraIso, historial: [...actual.historial, entrada] }, reinicio: false }
}

const ARCHIVOS_NUEVA: Record<EtapaId, string> = {
  spec: 'la spec en docs/superpowers/specs',
  plan: 'el plan en docs/superpowers/plans y context.md',
  ejecucion: ARCHIVO_ESTADO,
  final: ARCHIVO_ESTADO,
  uso: ARCHIVO_ESTADO,
}

/** T3, el traspaso que `/etapa` deja en el prompt (spec §5). `''` para `igual` y `a-uso` (este deja T4). */
export function textoT3(tipo: TipoTransicion, c: { actual: EtapaId | null; nueva: EtapaId; proyecto: string; carpeta: string }): string {
  switch (tipo) {
    case 'spec-plan':
      return 'Cierra la etapa Spec: confirma que la spec está aprobada y, si hay tareas B o C, que tiene sus dos revisiones adversarias (hechos y decisiones) con los hallazgos en el registro. Si falta algo, dímelo y paramos aquí. Si está todo, propón una sesión nueva de Plan en esta carpeta que parta de la spec.'
    case 'plan-ejecucion':
      return 'Cierra la etapa Plan: el plan queda en docs/superpowers/plans con nivel A/B/C por tarea y, si hay tareas B o C, context.md con los datos del entorno (carpetas compartidas, equipos, shell, comando de la suite completa). Si falta algo, dímelo. Si está todo, propón una sesión nueva de Ejecución que parta del plan y de context.md.'
    case 'ejecucion-final':
      return `Cierra la etapa Ejecución: ${ARCHIVO_ESTADO} al día (commits, hallazgos, menores diferidos, y «(plan-mandated)» en cada defecto que vino de la spec o del plan) y la suite completa corrida una vez al final. Propón una sesión nueva de Revisión final: revisor Opus con checklist de las zonas que tuvieron hallazgos graves dos veces, y triage de cada menor diferido.`
    case 'atras':
      return `Vuelves de ${c.actual === null ? 'sin etapa' : ETIQUETA[c.actual]} a ${ETIQUETA[c.nueva]}: anota en ${ARCHIVO_ESTADO} por qué y qué se rehace, y propón una sesión nueva de ${ETIQUETA[c.nueva]} que parta de ese archivo.`
    case 'sin-previa':
    case 'nuevo-nombre':
      return `Marca el arranque de la etapa ${ETIQUETA[c.nueva]} de ${c.proyecto}: deja el estado en archivos (${ARCHIVOS_NUEVA[c.nueva]}) antes de seguir. El archivo .claude/etapa.json se versiona: inclúyelo en el próximo commit.`
    case 'uso-spec':
      return `Proyecto nuevo en ${c.carpeta}: el anterior queda cerrado con su medición en ${ARCHIVO_ESTADO}. Esta sesión arranca la spec del nuevo.`
    default:
      return ''
  }
}

/** T4, lo que se deja en el prompt al marcar `uso`; la fecha de revisión es `ahora` + 14 días (UTC, P-M23). */
export function textoT4(ahora: number): string {
  const revision = new Date(ahora + DIAS_USO * DIA_MS).toISOString().slice(0, 10)
  return (
    `Cierra la etapa Revisión final en ${ARCHIVO_ESTADO}: lo que quedó pendiente y el triage de cada menor diferido (arreglar / deuda / descartar). ` +
    `Anota que la fila de errores graves en uso real se revisa el ${revision}. Después correré /workspace:medir para la tabla.`
  )
}

const REGLA: Record<EtapaId, string> = {
  spec: 'Aquí se hacen brainstorm y spec: leer, explorar y spikes desechables aprobados, sí; código del producto, no. Cuando la spec quede aprobada, no invoques writing-plans en esta sesión: pide al usuario /etapa plan.',
  plan: 'Aquí se escribe el plan desde la spec aprobada, con nivel A/B/C por tarea. Al terminarlo, no ofrezcas ejecutarlo en esta sesión: pide /etapa ejecucion.',
  ejecucion: 'Aquí se ejecuta el plan: el orquestador despacha, juzga y anota; solo implementa nivel A con menos de 150k de contexto (regla 2).',
  final: 'Aquí van la revisión final de rama (Opus), sus arreglos por subagentes, el triage de cada menor diferido y el merge.',
  uso: `El proyecto está en uso real: anota cada error grave en ${ARCHIVO_ESTADO} bajo «## Uso real» con su fecha; un cambio de más de una tarea es un proyecto nuevo.`,
}

/** T5, la sección de la etapa para Claude (spec §5); la misma que `/etapa` muestra al usuario. */
export function textoT5(f: EtapaFile, carpeta: string): string {
  return (
    `Etapa del proyecto (mi-barra, marcada por el usuario con /etapa): ${f.proyecto} en ${carpeta} está en ${ETIQUETA[f.etapa]} desde ${f.desde.slice(0, 10)}. ` +
    `Si eres un subagente, sigue tu brief e ignora esta sección. ${REGLA[f.etapa]} ` +
    'Si te piden trabajo de otra etapa o un proyecto nuevo, dilo en una línea y propón la sesión que corresponde; no cambies tú la etapa ni edites .claude/etapa.json.'
  )
}

export const MENSAJE_RAIZ_PROHIBIDA = 'Abre la sesión en la carpeta del proyecto'

/**
 * `/etapa` sin argumento (spec §4.2): lo que hay en el archivo y lo que Claude leyó en esta
 * sesión. `t5` es el texto congelado al arrancar (P-F02): se muestra tal cual viajó; si difiere
 * del archivo de ahora o quedó vacío, se añade lo que Claude recibirá en la próxima sesión. Sin
 * `t5` (aún sin congelar) se muestra lo que diría el archivo.
 */
export function textoEstado(l: EtapaLeida, t5: { texto: string } | null = null): string {
  if (l.prohibida) return MENSAJE_RAIZ_PROHIBIDA
  const delArchivo = l.file === null ? '' : textoT5(l.file, l.carpeta)
  const congelado = t5 === null ? delArchivo : t5.texto
  const proxima = delArchivo !== congelado ? ` En la próxima sesión Claude recibirá: «${delArchivo === '' ? 'nada: sin etapa' : delArchivo}».` : ''
  if (l.file === null) {
    const sin = `Sin etapa en ${l.carpeta}. Usa /etapa ${VALORES} [nombre].`
    return congelado === '' ? sin : `${sin} En esta sesión Claude recibió: «${congelado}».${proxima}`
  }
  const f = l.file
  const cabeza = `Etapa: ${ETIQUETA[f.etapa]} desde ${f.desde.slice(0, 10)}; proyecto ${f.proyecto} desde ${f.inicio.slice(0, 10)}; archivo ${rutaEtapa(l.raiz)}. `
  const lee = congelado === '' ? 'En esta sesión Claude no recibió la etapa.' : `Claude lee al iniciar cada sesión: «${congelado}».`
  return cabeza + lee + proxima
}

export type DecisionEtapa =
  | { accion: 'rechazar'; mensaje: string }
  | { accion: 'igual'; mensaje: string }
  | { accion: 'escribir'; ruta: string; file: EtapaFile; tipo: TipoTransicion; reinicio: boolean; anterior: EtapaId | null; leida: EtapaLeida; texto: string }

/**
 * La decisión de `/etapa <etapa> [nombre]`, sin tocar `$`: guarda de rutas, relectura del
 * disco (D9, por `leer`, que solo se llama pasada la guarda), qué escribir y qué dejar en el
 * prompt. Un archivo que existe pero no se entiende NO es "no existe": no se escribe nada
 * (reiniciar `inicio` e `historial` borraría datos del usuario).
 */
export async function decidirEtapa(
  c: {
    raiz: string
    home: string | null
    nueva: EtapaId
    nombre: string | null
    ahora: number
    arranque: number
    /**
     * Para los botones de la banda: lo que se relee del disco no puede ser una vuelta atrás ni un reinicio de proyecto
     * (el archivo pudo cambiar por fuera desde que se dibujó el botón). `/etapa` tecleado no lo pone.
     */
    soloAdelante?: boolean
  },
  leer: (raiz: string) => Promise<{ file: EtapaFile | null; problema: string | null }>,
): Promise<DecisionEtapa> {
  if (rutaProhibida(c.raiz, c.home)) return { accion: 'rechazar', mensaje: MENSAJE_RAIZ_PROHIBIDA }
  // Sin HOME la guarda no puede reconocer ~ ni ~/.claude: para escribir falla cerrada (leer sí puede seguir).
  if (c.home === null || c.home.trim() === '') {
    return { accion: 'rechazar', mensaje: 'No sé cuál es tu carpeta HOME (USERPROFILE/HOME no responden): por seguridad no escribo .claude/etapa.json. Reinicia la sesión e inténtalo de nuevo.' }
  }
  const ruta = rutaEtapa(c.raiz)
  const carpeta = ultimoSegmento(c.raiz)
  const { file: actual, problema } = await leer(c.raiz)
  if (actual === null && problema !== null) {
    return {
      accion: 'rechazar',
      mensaje: `El archivo ${ruta} existe pero no lo puedo leer (${problema.replace(/^mi-barra: /, '')}). No lo toqué: arréglalo o bórralo y vuelve a correr /etapa.`,
    }
  }
  const ahoraIso = new Date(c.ahora).toISOString()
  const inicioIso = new Date(c.arranque > 0 ? c.arranque : c.ahora).toISOString()
  const t = transicion(actual, c.nueva, c.nombre, ahoraIso, inicioIso, carpeta)
  if (t.file === null) {
    return { accion: 'igual', mensaje: `La etapa ya era ${ETIQUETA[c.nueva]} (proyecto ${actual?.proyecto ?? carpeta}): no cambié nada.` }
  }
  if (c.soloAdelante === true && (t.tipo === 'atras' || t.reinicio)) {
    return {
      accion: 'rechazar',
      mensaje: `La etapa en el archivo ya es ${actual === null ? 'otra' : ETIQUETA[actual.etapa]}: ir a ${ETIQUETA[c.nueva]} sería volver atrás y la barra no lo hace sola. No escribí nada; si de verdad quieres cambiarla, usa /etapa.`,
    }
  }
  const texto = t.tipo === 'a-uso' ? textoT4(c.ahora) : textoT3(t.tipo, { actual: actual?.etapa ?? null, nueva: c.nueva, proyecto: t.file.proyecto, carpeta })
  return {
    accion: 'escribir',
    ruta,
    file: t.file,
    tipo: t.tipo,
    reinicio: t.reinicio,
    anterior: actual?.etapa ?? null,
    leida: { raiz: c.raiz, carpeta, prohibida: false, file: t.file },
    texto,
  }
}

/** La respuesta del comando tras escribir (spec §4.2 y brief): la etapa, el traspaso y el reinicio. */
export function mensajeCambio(c: {
  nueva: EtapaId
  anterior: EtapaId | null
  reinicio: boolean
  proyecto: string
  traspaso: 'prompt' | 'copiar' | 'ninguno'
  texto: string
  /** false si el archivo se escribió pero el átomo de la barra no se pudo actualizar. */
  barraAlDia?: boolean
}): string {
  let m = `Etapa: ${ETIQUETA[c.nueva]} (antes ${c.anterior === null ? 'sin etapa' : ETIQUETA[c.anterior]}).`
  if (c.traspaso === 'prompt') m += ' Dejé el traspaso en el prompt.'
  if (c.reinicio) m += ` Reinicié inicio e historial: proyecto nuevo ${c.proyecto}.`
  if (c.barraAlDia === false) m += ' La etapa quedó escrita en el archivo; solo la barra tardará en reflejarla.'
  if (c.traspaso === 'copiar') m += `\nNo pude escribir en el prompt. Cópialo de aquí:\n${c.texto}`
  return m
}
