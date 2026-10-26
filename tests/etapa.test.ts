import { expect, test } from 'claude-code/testing'

import {
  decidirEtapa,
  diaUso,
  formatEtapa,
  parseArgsEtapa,
  parseEtapa,
  rutaEtapa,
  rutaProhibida,
  siguienteEtapa,
  textoEstado,
  textoT3,
  textoT4,
  textoT5,
  textoT8,
  transicion,
  ultimoSegmento,
  vistaEtapa,
} from '../src/etapa.ts'
import { ARCHIVO_ESTADO } from '../src/contexto.ts'
import { etapaSvg, TONE_COLOR } from '../src/svg.ts'

const ARCH =
  '{ "v": 1, "proyecto": "mi-barra-flujo", "etapa": "plan", "desde": "2026-10-25T23:00:00Z", "inicio": "2026-10-25T21:39:52Z", "historial": [{ "etapa": "spec", "desde": "2026-10-25T21:39:52Z" }, { "etapa": "plan", "desde": "2026-10-25T23:00:00Z" }] }'

test('parse: válido, BOM, CRLF y campos extra', () => {
  expect(parseEtapa(ARCH).file?.etapa).toBe('plan')
  expect(parseEtapa('\uFEFF' + ARCH.replace(/ /g, '\r\n')).file?.proyecto).toBe('mi-barra-flujo') // Review Focus 2
  expect(parseEtapa(ARCH.replace('"v": 1', '"v": 1, "nota": "x"')).file).not.toBe(null)
})

test('parse: inválido = sin etapa con motivo', () => {
  for (const mal of ['no json', 'null', ARCH.replace('"v": 1', '"v": 2'), ARCH.replace('"etapa": "plan"', '"etapa": "pruebas"'), '{"v":1,"etapa":"plan"}']) {
    const r = parseEtapa(mal)
    expect(r.file).toBe(null)
    expect(r.problema).toMatch(/etapa\.json/)
  }
})

test('parse: el historial con una entrada mala o una fecha ilegible invalida el archivo', () => {
  expect(parseEtapa(ARCH.replace('{ "etapa": "spec"', '{ "etapa": "raro"')).file).toBe(null)
  expect(parseEtapa(ARCH.replace('"desde": "2026-10-25T23:00:00Z", "inicio"', '"desde": "ayer", "inicio"')).file).toBe(null)
})

test('guarda de rutas (Windows)', () => {
  const home = 'C:\\Users\\usuario'
  for (const p of [
    'C:\\Users\\usuario',
    'c:/users/usuario/',
    'C:\\',
    'E:',
    'C:/Users/usuario/.claude',
    'C:\\Users\\usuario\\.claude\\projects',
    'C:\\Users\\usuario\\AppData\\Local\\Claude-Data\\x\\scratch-workspaces\\y',
    'C:\\Users\\usuario\\AppData\\Local\\Claude-Data\\claude_x\\side-session-notes\\x',
    'C:\\Users\\usuario\\AppData\\Local\\claude-data\\claude_x\\local-agent-mode-sessions\\y',
    'C:/Users/usuario/AppData/Local/CLAUDE-DATA/claude_x/claude-code-sessions/z/',
  ]) expect(rutaProhibida(p, home)).toBe(true)
  for (const p of ['C:\\Users\\usuario\\claude-workspace', 'E:\\Datos\\Proyectos\\demo']) expect(rutaProhibida(p, home)).toBe(false)
  expect(rutaProhibida('C:\\proy\\MyClaude-Datasets', home)).toBe(false)
  expect(rutaProhibida('C:\\proy\\Claude-Data2\\x', home)).toBe(false)
  expect(rutaProhibida('C:\\Users\\usuario\\.claudeX', home)).toBe(false)
  expect(rutaProhibida('C:\\Users\\usuario2', home)).toBe(false)
  expect(rutaProhibida('C:\\proyectos\\demo', null)).toBe(false)
  expect(rutaProhibida('/', null)).toBe(true)
  expect(ultimoSegmento('E:\\Datos\\Proyectos\\demo')).toBe('demo')
  expect(ultimoSegmento('C:/Users/usuario/claude-workspace/')).toBe('claude-workspace')
})

test('la ruta del archivo no duplica la barra', () => {
  expect(rutaEtapa('C:/p/demo')).toBe('C:/p/demo/.claude/etapa.json')
  expect(rutaEtapa('C:/p/demo/')).toBe('C:/p/demo/.claude/etapa.json')
  expect(rutaEtapa('C:\\p\\demo\\')).toBe('C:\\p\\demo/.claude/etapa.json')
})

test('vista del anillo y día de uso real', () => {
  const f = parseEtapa(ARCH).file!
  expect(vistaEtapa({ raiz: 'C:/p/demo', carpeta: 'demo', prohibida: false, file: f }, 0)).toEqual({ valor: 'Plan', pista: 'mi-barra-flujo', indice: 1 })
  expect(vistaEtapa({ raiz: 'C:/p/demo', carpeta: 'demo', prohibida: false, file: null }, 0)).toEqual({ valor: 'sin etapa', pista: 'demo', indice: null })
  expect(vistaEtapa(null, 0)).toEqual({ valor: 'sin etapa', pista: '', indice: null })
  const uso = { ...f, etapa: 'uso' as const, desde: '2026-11-01T00:00:00Z' }
  expect(diaUso(uso, Date.parse('2026-11-01T10:00:00Z'))).toBe(1)
  expect(diaUso(uso, Date.parse('2026-11-14T10:00:00Z'))).toBe(14)
  expect(diaUso(f, Date.parse('2026-11-14T10:00:00Z'))).toBe(null)
  expect(vistaEtapa({ raiz: 'C:/p/demo', carpeta: 'demo', prohibida: false, file: uso }, Date.parse('2026-11-05T00:00:00Z')).pista).toBe('mi-barra-flujo · día 5 de 14')
})

test('T8 nombra el proyecto y el archivo de estado', () => {
  const t = textoT8('mi-barra-flujo')
  expect(t).toContain('Pasaron dos semanas de uso real de mi-barra-flujo')
  expect(t).toContain(`anota en ${ARCHIVO_ESTADO}, bajo ## Medición`)
})

test('etapaSvg: cinco segmentos, el actual lleno, los anteriores a 35 %, los siguientes en la pista', () => {
  const tres = etapaSvg(2)
  expect(tres.match(/<path/g)?.length).toBe(5)
  expect(tres.match(new RegExp(`stroke="${TONE_COLOR.ok}"`, 'g'))?.length).toBe(3) // el actual y los dos anteriores, todos verdes
  expect(tres.match(/stroke-opacity="0\.35"/g)?.length).toBe(2)
  expect(tres.match(/stroke="rgba\(138,143,152,0\.30\)"/g)?.length).toBe(2)
  const primero = etapaSvg(0)
  expect(primero.match(/stroke-opacity="0\.35"/g)).toBe(null)
  expect(primero.match(new RegExp(`stroke="${TONE_COLOR.ok}"`, 'g'))?.length).toBe(1)
  const nada = etapaSvg(null)
  expect(nada.match(/<path/g)?.length).toBe(5)
  expect(nada.match(/stroke-dasharray/g)?.length).toBe(5)
  expect(nada).not.toContain(TONE_COLOR.ok)
  expect(nada).not.toMatch(/<script|\son[a-z]+=/i)
})

test('argumentos de /etapa', () => {
  expect(parseArgsEtapa('')).toEqual({ etapa: null, nombre: null, error: null })
  expect(parseArgsEtapa('  Ejecución   mi proyecto ')).toEqual({ etapa: 'ejecucion', nombre: 'mi-proyecto', error: null })
  expect(parseArgsEtapa('PLAN').etapa).toBe('plan')
  expect(parseArgsEtapa('plan').nombre).toBe(null)
  expect(parseArgsEtapa('pruebas').error).toMatch(/spec\|plan\|ejecucion\|final\|uso/)
  expect(parseArgsEtapa('pruebas').etapa).toBe(null)
})

test('transiciones: historial, inicio y tipo', () => {
  const ahora = '2026-10-26T10:00:00Z', ses = '2026-10-26T09:00:00Z'
  const nuevo = transicion(null, 'spec', null, ahora, ses, 'demo')
  expect(nuevo).toMatchObject({ tipo: 'sin-previa', reinicio: false, file: { proyecto: 'demo', inicio: ses, desde: ahora, historial: [{ etapa: 'spec', desde: ahora }] } })
  const f = nuevo.file!
  expect(transicion(f, 'spec', null, ahora, ses, 'demo')).toEqual({ tipo: 'igual', file: null, reinicio: false })
  const plan = transicion(f, 'plan', null, '2026-10-27T00:00:00Z', 'X', 'demo')
  expect(plan).toMatchObject({ tipo: 'spec-plan', reinicio: false, file: { inicio: ses } })
  expect(plan.file!.historial).toHaveLength(2)
  expect(transicion(f, 'ejecucion', null, ahora, ses, 'demo').tipo).toBe('plan-ejecucion') // D5
  expect(transicion({ ...f, etapa: 'plan' }, 'final', null, ahora, ses, 'demo').tipo).toBe('ejecucion-final')
  expect(transicion({ ...f, etapa: 'ejecucion' }, 'final', null, ahora, ses, 'demo').tipo).toBe('ejecucion-final')
  expect(transicion({ ...f, etapa: 'ejecucion' }, 'plan', null, ahora, ses, 'demo').tipo).toBe('atras')
  expect(transicion({ ...f, etapa: 'final' }, 'uso', null, ahora, ses, 'demo').tipo).toBe('a-uso')
  expect(transicion({ ...f, etapa: 'uso' }, 'plan', null, ahora, ses, 'demo').tipo).toBe('atras') // D5: desde uso, solo spec es proyecto nuevo
  const otro = transicion({ ...f, etapa: 'uso' }, 'spec', null, ahora, 'S2', 'demo')
  expect(otro).toMatchObject({ tipo: 'uso-spec', reinicio: true, file: { inicio: 'S2', historial: [{ etapa: 'spec', desde: ahora }] } })
  expect(transicion(f, 'spec', 'otro', ahora, 'S3', 'demo')).toMatchObject({ tipo: 'nuevo-nombre', reinicio: true, file: { proyecto: 'otro', inicio: 'S3' } })
  expect(transicion(f, 'plan', 'otro', ahora, 'S3', 'demo').tipo).toBe('nuevo-nombre')
})

test('P-M04: a-uso gana a sin-previa y a nuevo-nombre; reinicio solo si cambia el proyecto', () => {
  const ahora = '2026-10-26T10:00:00Z', ses = '2026-10-26T09:00:00Z'
  expect(transicion(null, 'uso', null, ahora, ses, 'demo')).toMatchObject({ tipo: 'a-uso', reinicio: false, file: { etapa: 'uso', historial: [{ etapa: 'uso', desde: ahora }] } })
  const f = transicion(null, 'final', 'demo', ahora, ses, 'demo').file!
  expect(transicion(f, 'uso', 'otro', ahora, 'S3', 'demo')).toMatchObject({ tipo: 'a-uso', reinicio: true, file: { proyecto: 'otro', inicio: 'S3' } })
  expect(transicion({ ...f, etapa: 'uso' }, 'uso', 'otro', ahora, 'S3', 'demo').tipo).toBe('a-uso')
  expect(transicion({ ...f, etapa: 'uso' }, 'uso', null, ahora, 'S3', 'demo').tipo).toBe('igual')
  expect(transicion({ ...f, etapa: 'uso' }, 'uso', 'demo', ahora, 'S3', 'demo').tipo).toBe('igual') // mismo nombre
})

test('transiciones conservan los campos extra del archivo y de cada entrada del historial', () => {
  const crudo = parseEtapa(
    '{ "v": 1, "proyecto": "p", "etapa": "spec", "desde": "2026-10-25T10:00:00Z", "inicio": "2026-10-25T09:00:00Z", "nota": "mía", ' +
      '"historial": [{ "etapa": "spec", "desde": "2026-10-25T10:00:00Z", "commit": "abc1234" }] }',
  ).file!
  const sig = transicion(crudo, 'plan', null, '2026-10-26T10:00:00Z', 'S', 'p').file!
  expect(JSON.parse(formatEtapa(sig))).toMatchObject({
    nota: 'mía',
    historial: [{ etapa: 'spec', commit: 'abc1234' }, { etapa: 'plan', desde: '2026-10-26T10:00:00Z' }],
  })
})

test('siguienteEtapa viene de ETAPAS (P-M10)', () => {
  expect(siguienteEtapa('spec')).toBe('plan')
  expect(siguienteEtapa('final')).toBe('uso')
  expect(siguienteEtapa('uso')).toBe(null)
})

test('textos T3, T4 y T5', () => {
  expect(textoT3('spec-plan', { actual: 'spec', nueva: 'plan', proyecto: 'p', carpeta: 'demo' })).toMatch(/^Cierra la etapa Spec: confirma que la spec está aprobada/)
  expect(textoT3('atras', { actual: 'ejecucion', nueva: 'plan', proyecto: 'p', carpeta: 'demo' })).toBe(
    `Vuelves de Ejecución a Plan: anota en ${ARCHIVO_ESTADO} por qué y qué se rehace, y propón una sesión nueva de Plan que parta de ese archivo.`,
  )
  expect(textoT3('sin-previa', { actual: null, nueva: 'plan', proyecto: 'p', carpeta: 'demo' })).toContain('(el plan en docs/superpowers/plans y context.md)')
  expect(textoT4(Date.parse('2026-11-01T12:00:00Z'))).toContain('se revisa el 2026-11-15')
  expect(textoT5(parseEtapa(ARCH).file!, 'claude-workspace')).toMatch(
    /^Etapa del proyecto \(mi-barra, marcada por el usuario con \/etapa\): mi-barra-flujo en claude-workspace está en Plan desde 2026-10-25\. Si eres un subagente, sigue tu brief e ignora esta sección\. Aquí se escribe el plan/,
  )
})

test('T3 literales de la spec §5, uno por tipo', () => {
  type E = 'spec' | 'plan' | 'ejecucion' | 'final' | 'uso'
  const c = (actual: E | null, nueva: E) => ({ actual, nueva, proyecto: 'p', carpeta: 'demo' })
  expect(textoT3('spec-plan', c('spec', 'plan'))).toBe(
    'Cierra la etapa Spec: confirma que la spec está aprobada y, si hay tareas B o C, que tiene sus dos revisiones adversarias (hechos y decisiones) con los hallazgos en el registro. Si falta algo, dímelo y paramos aquí. Si está todo, propón una sesión nueva de Plan en esta carpeta que parta de la spec.',
  )
  expect(textoT3('plan-ejecucion', c('plan', 'ejecucion'))).toBe(
    'Cierra la etapa Plan: el plan queda en docs/superpowers/plans con nivel A/B/C por tarea y, si hay tareas B o C, context.md con los datos del entorno (carpetas compartidas, equipos, shell, comando de la suite completa). Si falta algo, dímelo. Si está todo, propón una sesión nueva de Ejecución que parta del plan y de context.md.',
  )
  expect(textoT3('ejecucion-final', c('ejecucion', 'final'))).toBe(
    `Cierra la etapa Ejecución: ${ARCHIVO_ESTADO} al día (commits, hallazgos, menores diferidos, y «(plan-mandated)» en cada defecto que vino de la spec o del plan) y la suite completa corrida una vez al final. Propón una sesión nueva de Revisión final: revisor Opus con checklist de las zonas que tuvieron hallazgos graves dos veces, y triage de cada menor diferido.`,
  )
  expect(textoT3('uso-spec', c('uso', 'spec'))).toBe(
    `Proyecto nuevo en demo: el anterior queda cerrado con su medición en ${ARCHIVO_ESTADO}. Esta sesión arranca la spec del nuevo.`,
  )
  const etiqueta: Record<E, string> = { spec: 'Spec', plan: 'Plan', ejecucion: 'Ejecución', final: 'Revisión final', uso: 'Uso real' }
  const previa = (nueva: E, archivos: string) =>
    `Marca el arranque de la etapa ${etiqueta[nueva]} de p: deja el estado en archivos (${archivos}) antes de seguir. El archivo .claude/etapa.json se versiona: inclúyelo en el próximo commit.`
  expect(textoT3('sin-previa', c(null, 'spec'))).toBe(previa('spec', 'la spec en docs/superpowers/specs'))
  expect(textoT3('sin-previa', c(null, 'plan'))).toBe(previa('plan', 'el plan en docs/superpowers/plans y context.md'))
  expect(textoT3('sin-previa', c(null, 'ejecucion'))).toBe(previa('ejecucion', ARCHIVO_ESTADO))
  expect(textoT3('sin-previa', c(null, 'final'))).toBe(previa('final', ARCHIVO_ESTADO))
  expect(textoT3('nuevo-nombre', c('plan', 'plan'))).toBe(previa('plan', 'el plan en docs/superpowers/plans y context.md'))
  expect(textoT3('igual', c('plan', 'plan'))).toBe('') // P-M04
  expect(textoT3('a-uso', c('final', 'uso'))).toBe('')
  expect(textoT4(Date.parse('2026-11-01T12:00:00Z'))).toBe(
    `Cierra la etapa Revisión final en ${ARCHIVO_ESTADO}: lo que quedó pendiente y el triage de cada menor diferido (arreglar / deuda / descartar). Anota que la fila de errores graves en uso real se revisa el 2026-11-15. Después correré /workspace:medir para la tabla.`,
  )
})

test('T5: la regla de cada etapa, literal de la spec §5', () => {
  const regla = (etapa: 'spec' | 'plan' | 'ejecucion' | 'final' | 'uso') => {
    const t = textoT5({ ...parseEtapa(ARCH).file!, etapa }, 'c')
    const ini = 'Si eres un subagente, sigue tu brief e ignora esta sección. '
    const fin = ' Si te piden trabajo de otra etapa o un proyecto nuevo, dilo en una línea y propón la sesión que corresponde; no cambies tú la etapa ni edites .claude/etapa.json.'
    expect(t.endsWith(fin)).toBe(true)
    return t.slice(t.indexOf(ini) + ini.length, t.length - fin.length)
  }
  expect(regla('spec')).toBe('Aquí se hacen brainstorm y spec: leer, explorar y spikes desechables aprobados, sí; código del producto, no. Cuando la spec quede aprobada, no invoques writing-plans en esta sesión: pide al usuario /etapa plan.')
  expect(regla('plan')).toBe('Aquí se escribe el plan desde la spec aprobada, con nivel A/B/C por tarea. Al terminarlo, no ofrezcas ejecutarlo en esta sesión: pide /etapa ejecucion.')
  expect(regla('ejecucion')).toBe('Aquí se ejecuta el plan: el orquestador despacha, juzga y anota; solo implementa nivel A con menos de 150k de contexto (regla 2).')
  expect(regla('final')).toBe('Aquí van la revisión final de rama (Opus), sus arreglos por subagentes, el triage de cada menor diferido y el merge.')
  expect(regla('uso')).toBe(`El proyecto está en uso real: anota cada error grave en ${ARCHIVO_ESTADO} bajo «## Uso real» con su fecha; un cambio de más de una tarea es un proyecto nuevo.`)
  expect(textoT5(parseEtapa(ARCH).file!, 'c')).toContain('mi-barra-flujo en c está en Plan desde 2026-10-25.')
})

test('textoEstado: con archivo, sin archivo y en una raíz prohibida', () => {
  const file = parseEtapa(ARCH).file!
  const con = textoEstado({ raiz: 'C:/p/demo', carpeta: 'demo', prohibida: false, file })
  expect(con).toContain('Etapa: Plan desde 2026-10-25; proyecto mi-barra-flujo desde 2026-10-25; archivo C:/p/demo/.claude/etapa.json.')
  expect(con).toContain(`Claude lee al iniciar cada sesión: «${textoT5(file, 'demo')}».`)
  expect(textoEstado({ raiz: 'C:/p/demo', carpeta: 'demo', prohibida: false, file: null })).toBe('Sin etapa en demo. Usa /etapa spec|plan|ejecucion|final|uso [nombre].')
  expect(textoEstado({ raiz: 'C:/Users/x', carpeta: 'x', prohibida: true, file: null })).toBe('Abre la sesión en la carpeta del proyecto')
})

test('parse conserva los campos extra de cada entrada del historial', () => {
  const r = parseEtapa(ARCH.replace('{ "etapa": "spec", "desde": "2026-10-25T21:39:52Z" }', '{ "etapa": "spec", "desde": "2026-10-25T21:39:52Z", "commit": "abc" }'))
  expect(r.file?.historial[0]).toMatchObject({ etapa: 'spec', commit: 'abc' })
})

test('decidirEtapa: guarda, ilegible, igual y escribir', async () => {
  const base = { raiz: 'C:/p/demo', home: 'C:/Users/x', nueva: 'plan' as const, nombre: null, ahora: Date.parse('2026-10-26T10:00:00Z'), arranque: Date.parse('2026-10-26T09:00:00Z') }
  let lecturas = 0
  const leer = (r: { file: ReturnType<typeof parseEtapa>['file']; problema: string | null }) => async () => {
    lecturas++
    return r
  }
  // La guarda corta antes de leer.
  const guarda = await decidirEtapa({ ...base, raiz: 'C:/Users/x' }, leer({ file: null, problema: null }))
  expect(guarda).toEqual({ accion: 'rechazar', mensaje: 'Abre la sesión en la carpeta del proyecto' })
  expect(lecturas).toBe(0)
  // Existe pero es ilegible: no se escribe, y el mensaje lo dice.
  const mala = await decidirEtapa(base, leer({ file: null, problema: 'mi-barra: etapa.json ignorado: una entrada del historial no es válida' }))
  expect(mala.accion).toBe('rechazar')
  const msg = (mala as { mensaje: string }).mensaje
  expect(msg).toMatch(/existe pero no lo puedo leer/)
  expect(msg).toContain('C:/p/demo/.claude/etapa.json')
  expect(msg).toContain('una entrada del historial no es válida')
  // No existe: se crea.
  const nuevo = await decidirEtapa(base, leer({ file: null, problema: null }))
  expect(nuevo).toMatchObject({ accion: 'escribir', tipo: 'sin-previa', ruta: 'C:/p/demo/.claude/etapa.json', file: { proyecto: 'demo', inicio: '2026-10-26T09:00:00.000Z', desde: '2026-10-26T10:00:00.000Z' } })
  // Igual: no escribe y dice que ya estaba.
  const igual = await decidirEtapa(base, leer({ file: parseEtapa(ARCH).file, problema: null }))
  expect(igual).toEqual({ accion: 'igual', mensaje: 'La etapa ya era Plan (proyecto mi-barra-flujo): no cambié nada.' })
  // Sin arranque conocido, `inicio` cae al momento del comando.
  const sinArranque = await decidirEtapa({ ...base, arranque: 0 }, leer({ file: null, problema: null }))
  expect(sinArranque).toMatchObject({ file: { inicio: '2026-10-26T10:00:00.000Z' } })
})

test('decidirEtapa: sin HOME conocido no escribe (la guarda falla cerrada)', async () => {
  const base = { raiz: 'C:/Users/x', nueva: 'spec' as const, nombre: null, ahora: Date.parse('2026-10-26T10:00:00Z'), arranque: 0 }
  let lecturas = 0
  const leer = async () => {
    lecturas++
    return { file: null, problema: null }
  }
  for (const home of [null, '', '  ']) {
    const d = await decidirEtapa({ ...base, home }, leer)
    expect(d.accion).toBe('rechazar')
    expect((d as { mensaje: string }).mensaje).toMatch(/HOME/)
  }
  expect(lecturas).toBe(0)
  expect((await decidirEtapa({ ...base, home: 'C:/Users/otro' }, leer)).accion).toBe('escribir') // con HOME sí
})

test('el nombre del proyecto se compara sin mayúsculas ni tildes (no reinicia por eso)', () => {
  const f = parseEtapa(ARCH).file! // proyecto "mi-barra-flujo"
  const ahora = '2026-10-26T10:00:00Z'
  expect(transicion(f, 'plan', 'Mi-Barra-Flujo', ahora, 'S', 'c').tipo).toBe('igual')
  expect(transicion(f, 'ejecucion', 'MI-BARRA-FLUJO', ahora, 'S', 'c')).toMatchObject({ tipo: 'plan-ejecucion', reinicio: false, file: { proyecto: 'mi-barra-flujo', inicio: f.inicio } })
  const tilde = { ...f, proyecto: 'diseño-ñandú' }
  expect(transicion(tilde, 'plan', 'Diseno-Nandu', ahora, 'S', 'c').tipo).toBe('igual')
  expect(transicion(f, 'plan', 'otro', ahora, 'S', 'c').reinicio).toBe(true)
})

test('decidirEtapa con soloAdelante (botones de la banda): no escribe hacia atrás ni reinicia', async () => {
  const base = { raiz: 'C:/p/demo', home: 'C:/Users/x', nombre: null, ahora: Date.parse('2026-10-26T10:00:00Z'), arranque: Date.parse('2026-10-26T09:00:00Z') }
  const arch = (etapa: string, h: string[]) =>
    parseEtapa(
      JSON.stringify({ v: 1, proyecto: 'demo', etapa, desde: '2026-10-25T21:00:00Z', inicio: '2026-10-25T21:00:00Z', historial: h.map(x => ({ etapa: x, desde: '2026-10-25T21:00:00Z' })) }),
    ).file
  const leer = (file: ReturnType<typeof parseEtapa>['file']) => async () => ({ file, problema: null })
  const plan = arch('plan', ['spec', 'plan'])
  const uso = arch('uso', ['ejecucion', 'final', 'uso'])
  // Hacia atrás (el archivo ya pasó de la etapa que mostraba el botón): sin la opción escribe, con ella no.
  expect(await decidirEtapa({ ...base, nueva: 'spec' }, leer(plan))).toMatchObject({ accion: 'escribir', tipo: 'atras' })
  const atras = await decidirEtapa({ ...base, nueva: 'spec', soloAdelante: true }, leer(plan))
  expect(atras.accion).toBe('rechazar')
  expect((atras as { mensaje: string }).mensaje).toContain('ya es Plan')
  expect((atras as { mensaje: string }).mensaje).toContain('volver atrás')
  // Reinicio de uso a spec: sin la opción reinicia, con ella no.
  expect(await decidirEtapa({ ...base, nueva: 'spec' }, leer(uso))).toMatchObject({ accion: 'escribir', tipo: 'uso-spec', reinicio: true })
  expect((await decidirEtapa({ ...base, nueva: 'spec', soloAdelante: true }, leer(uso))).accion).toBe('rechazar')
  expect((await decidirEtapa({ ...base, nueva: 'plan', soloAdelante: true }, leer(uso))).accion).toBe('rechazar')
  // Hacia delante, sin archivo e igual siguen como siempre.
  expect(await decidirEtapa({ ...base, nueva: 'ejecucion', soloAdelante: true }, leer(plan))).toMatchObject({ accion: 'escribir', tipo: 'plan-ejecucion' })
  expect(await decidirEtapa({ ...base, nueva: 'spec', soloAdelante: true }, leer(null))).toMatchObject({ accion: 'escribir', tipo: 'sin-previa' })
  expect((await decidirEtapa({ ...base, nueva: 'plan', soloAdelante: true }, leer(plan))).accion).toBe('igual')
})
