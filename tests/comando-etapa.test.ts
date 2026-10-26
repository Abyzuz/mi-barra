import { expect, test } from 'claude-code/testing'

import { ARCHIVO_ESTADO } from '../src/contexto.ts'
import { anillo, dentroDe } from './anillos.ts'
import { fondos } from './fondos.ts'

const RUTA = 'C:/p/demo/.claude/etapa.json'
const T0 = Date.parse('2026-10-26T09:00:00Z')
const HORA = 60 * 60 * 1000
const START = { cwd: '.', surface: 'desktop', isInteractive: true } as const

const archivo = (etapa: string, historial: { etapa: string; desde: string; [k: string]: unknown }[], extra: Record<string, unknown> = {}) =>
  JSON.stringify(
    { v: 1, proyecto: 'mi-barra-flujo', etapa, desde: historial.at(-1)!.desde, inicio: '2026-10-25T21:39:52Z', historial, ...extra },
    null,
    2,
  ) + '\n'
const SPEC = archivo('spec', [{ etapa: 'spec', desde: '2026-10-25T21:39:52Z' }])
const PLAN = archivo('plan', [
  { etapa: 'spec', desde: '2026-10-25T21:39:52Z' },
  { etapa: 'plan', desde: '2026-10-25T23:00:00Z' },
])
const FINAL = archivo('final', [{ etapa: 'final', desde: '2026-10-25T23:00:00Z' }])
const USO = archivo('uso', [
  { etapa: 'ejecucion', desde: '2026-10-25T22:00:00Z' },
  { etapa: 'final', desde: '2026-10-25T23:00:00Z' },
  { etapa: 'uso', desde: '2026-10-26T00:00:00Z' },
])

const base = (archivos: Record<string, string> = {}, mas: Record<string, unknown> = {}) => ({ root: 'C:/p/demo', now: T0, archivos, ...mas })
const escrito = (f: { escritos: Map<string, string> }) => JSON.parse(f.escritos.get(RUTA)!)

const banda = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 140, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

test('registra /etapa', async ($, on) => {
  const f = fondos(on, base())
  expect(f.comandos).not.toContain('etapa')
  await $.session.start(START)
  expect(f.comandos).toContain('etapa')
  expect(f.comandos).toContain('tanda')
})

test('sin argumento muestra estado, ruta y T5', async ($, on) => {
  fondos(on, base({ [RUTA]: PLAN }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: '' })
  expect(r.text).toContain('C:/p/demo/.claude/etapa.json')
  expect(r.text).toContain('«Etapa del proyecto (mi-barra')
  expect(r.text).toContain('Etapa: Plan desde 2026-10-25')
})

test('sin argumento y sin archivo: dice que no hay etapa', async ($, on) => {
  const f = fondos(on, base())
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: '' })
  expect(r.text).toBe('Sin etapa en demo. Usa /etapa spec|plan|ejecucion|final|uso [nombre].')
  expect(f.escritos.size).toBe(0)
})

test('primera etapa: escribe el archivo con inicio = arranque de la sesión y deja T3', async ($, on) => {
  const f = fondos(on, base())
  await $.session.start(START)
  await f.clock.advance(HORA)
  const r = await $.command.run({ command: 'etapa', args: 'spec demo' })
  const w = escrito(f)
  expect(w).toMatchObject({
    v: 1,
    proyecto: 'demo',
    etapa: 'spec',
    inicio: '2026-10-26T09:00:00.000Z', // D8: el arranque de la sesión, no el momento del comando
    desde: '2026-10-26T10:00:00.000Z',
    historial: [{ etapa: 'spec', desde: '2026-10-26T10:00:00.000Z' }],
  })
  expect(f.escritos.get(RUTA)!.endsWith('\n')).toBe(true)
  expect(f.rellenos).toHaveLength(1)
  expect(f.rellenos[0]!.text.startsWith('Marca el arranque de la etapa Spec de demo')).toBe(true)
  expect(r.text).toContain('Etapa: Spec (antes sin etapa). Dejé el traspaso en el prompt.')
  expect(r.text).not.toContain('Reinicié')
  // La banda lo muestra sin esperar el tick de 15 s.
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda })
  expect(dentroDe(await anillo(ui, 'Etapa'))).toBe('Spec')
  await ui.unmount()
  expect(f.enviados).toBe(0)
})

test('sin nombre, el proyecto es la carpeta', async ($, on) => {
  const f = fondos(on, base())
  await $.session.start(START)
  await $.command.run({ command: 'etapa', args: 'Ejecución' })
  expect(escrito(f)).toMatchObject({ proyecto: 'demo', etapa: 'ejecucion' })
})

test('igual: dice que ya estaba y no escribe', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: PLAN }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'plan' })
  expect(r.text).toMatch(/ya era Plan/)
  expect(f.escritos.size).toBe(0)
  expect(f.rellenos).toHaveLength(0)
  expect(f.enviados).toBe(0)
})

test('cada transición adelante deja su T3 y conserva inicio y proyecto', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: SPEC }))
  await $.session.start(START)
  await f.clock.advance(HORA)
  const r = await $.command.run({ command: 'etapa', args: 'plan' })
  expect(escrito(f)).toMatchObject({ proyecto: 'mi-barra-flujo', inicio: '2026-10-25T21:39:52Z', etapa: 'plan' })
  expect(escrito(f).historial).toHaveLength(2)
  expect(f.rellenos[0]!.text).toMatch(/^Cierra la etapa Spec: confirma que la spec está aprobada/)
  expect(r.text).toContain('Etapa: Plan (antes Spec).')
  await $.command.run({ command: 'etapa', args: 'ejecucion' })
  expect(escrito(f).historial).toHaveLength(3)
  expect(f.rellenos[1]!.text).toMatch(/^Cierra la etapa Plan:/)
  await $.command.run({ command: 'etapa', args: 'final' })
  expect(f.rellenos[2]!.text).toMatch(/^Cierra la etapa Ejecución:/)
  await $.command.run({ command: 'etapa', args: 'plan' })
  expect(f.rellenos[3]!.text).toBe(
    `Vuelves de Revisión final a Plan: anota en ${ARCHIVO_ESTADO} por qué y qué se rehace, y propón una sesión nueva de Plan que parta de ese archivo.`,
  )
  expect(escrito(f).historial).toHaveLength(5)
  expect(f.enviados).toBe(0)
})

test('pasar a uso deja T4', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: FINAL }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'uso' })
  expect(escrito(f)).toMatchObject({ etapa: 'uso', desde: '2026-10-26T09:00:00.000Z' })
  expect(f.rellenos[0]!.text).toMatch(/^Cierra la etapa Revisión final en /)
  expect(f.rellenos[0]!.text).toContain('se revisa el 2026-11-09') // T0 + 14 días
  expect(f.rellenos[0]!.text).toContain('/workspace:medir')
  expect(r.text).toContain('Etapa: Uso real (antes Revisión final).')
  expect(f.enviados).toBe(0)
})

test('uso → spec reinicia y lo dice', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: USO }))
  await $.session.start(START)
  await f.clock.advance(HORA)
  const r = await $.command.run({ command: 'etapa', args: 'spec' })
  expect(r.text).toContain('Reinicié inicio e historial: proyecto nuevo demo.')
  const w = escrito(f)
  expect(w.historial).toEqual([{ etapa: 'spec', desde: '2026-10-26T10:00:00.000Z' }])
  expect(w).toMatchObject({ proyecto: 'demo', inicio: '2026-10-26T09:00:00.000Z' })
  expect(f.rellenos[0]!.text).toBe(
    `Proyecto nuevo en demo: el anterior queda cerrado con su medición en ${ARCHIVO_ESTADO}. Esta sesión arranca la spec del nuevo.`,
  )
})

test('un nombre distinto reinicia aunque la etapa sea la misma (D7)', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: PLAN }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'plan otro proyecto' })
  expect(r.text).toContain('Reinicié inicio e historial: proyecto nuevo otro-proyecto.')
  expect(escrito(f)).toMatchObject({ proyecto: 'otro-proyecto', etapa: 'plan', inicio: '2026-10-26T09:00:00.000Z', historial: [{ etapa: 'plan' }] })
  expect(escrito(f).historial).toHaveLength(1)
  expect(f.rellenos[0]!.text).toMatch(/^Marca el arranque de la etapa Plan de otro-proyecto/)
})

test('relee el disco antes de escribir (Review Focus 3)', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: SPEC }))
  await $.session.start(START) // el átomo lee `spec`
  f.archivos.set(RUTA, PLAN) // otra sesión o el otro PC lo avanzó; el reloj no se mueve, así que el tick no lo vio
  const r = await $.command.run({ command: 'etapa', args: 'ejecucion' })
  expect(escrito(f).historial).toHaveLength(3) // el del disco (2) + el nuevo, no el del átomo (1) + el nuevo
  expect(escrito(f).historial.map((h: { etapa: string }) => h.etapa)).toEqual(['spec', 'plan', 'ejecucion'])
  expect(f.rellenos[0]!.text).toMatch(/^Cierra la etapa Plan:/) // plan-ejecucion, no spec-plan
  expect(r.text).toContain('Etapa: Ejecución (antes Plan).')
})

test('el archivo ya no está cuando se escribe: lo crea con lo que hay en el disco', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: PLAN }))
  await $.session.start(START) // el átomo lee `plan`
  f.archivos.delete(RUTA) // alguien lo borró entre ticks
  await $.command.run({ command: 'etapa', args: 'ejecucion' })
  expect(escrito(f).historial).toHaveLength(1) // sin previa: no resucita el historial del átomo
  expect(f.rellenos[0]!.text).toMatch(/^Marca el arranque de la etapa Ejecución de demo/)
})

test('un archivo que existe pero no se lee NO se trata como "no existe": no escribe y lo dice', async ($, on) => {
  const malo = PLAN.replace('"etapa": "spec"', '"etapa": "raro"') // una entrada del historial ilegible
  const f = fondos(on, base({ [RUTA]: malo }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'ejecucion' })
  expect(f.escritos.size).toBe(0)
  expect(f.archivos.get(RUTA)).toBe(malo) // el archivo del usuario queda intacto
  expect(r.text).toMatch(/existe pero no lo puedo leer/)
  expect(r.text).toContain('C:/p/demo/.claude/etapa.json')
  expect(r.text).toContain('una entrada del historial no es válida')
  expect(f.rellenos).toHaveLength(0)
  expect(f.enviados).toBe(0)
})

test('JSON roto o error de lectura que no es ENOENT: tampoco escribe', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: '{ esto no es json' }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'spec' })
  expect(f.escritos.size).toBe(0)
  expect(r.text).toMatch(/existe pero no lo puedo leer/)
})

test('error de lectura que no es ENOENT: no escribe', async ($, on) => {
  const f = fondos(on, base({}, { leerFalla: { ruta: /etapa\.json$/, motivo: 'EACCES: permiso denegado' } }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'spec' })
  expect(f.escritos.size).toBe(0)
  expect(r.text).toMatch(/existe pero no lo puedo leer/)
  expect(r.text).toContain('EACCES')
})

test('conserva los campos extra del archivo y de cada entrada del historial', async ($, on) => {
  const conExtras = archivo('spec', [{ etapa: 'spec', desde: '2026-10-25T21:39:52Z', commit: 'abc1234' }], { nota: 'mía' })
  const f = fondos(on, base({ [RUTA]: conExtras }))
  await $.session.start(START)
  await $.command.run({ command: 'etapa', args: 'plan' })
  const w = escrito(f)
  expect(w.nota).toBe('mía')
  expect(w.historial[0]).toEqual({ etapa: 'spec', desde: '2026-10-25T21:39:52Z', commit: 'abc1234' })
  expect(w.historial[1]).toMatchObject({ etapa: 'plan' })
})

test('argumento inválido explica los valores', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: PLAN }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'pruebas' })
  expect(r.text).toMatch(/spec\|plan\|ejecucion\|final\|uso/)
  expect(f.escritos.size).toBe(0)
  expect(f.rellenos).toHaveLength(0)
})

test('guarda: en el HOME no escribe', async ($, on) => {
  const f = fondos(on, { repo: null, root: 'C:/Users/prueba', home: 'C:/Users/prueba', now: T0 })
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'spec' })
  expect(r.text).toBe('Abre la sesión en la carpeta del proyecto')
  expect(f.escritos.size).toBe(0)
  expect(f.lecturas.filter(l => /etapa\.json$/.test(l))).toHaveLength(0)
  expect(f.rellenos).toHaveLength(0)
  expect((await $.command.run({ command: 'etapa', args: '' })).text).toBe('Abre la sesión en la carpeta del proyecto')
})

test('guarda: dentro de Claude-Data (side-session-notes) no escribe ni lee', async ($, on) => {
  const f = fondos(on, { repo: null, root: 'C:/Users/prueba/AppData/Local/Claude-Data/claude_x/side-session-notes/n', home: 'C:/Users/prueba', now: T0 })
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'spec' })
  expect(r.text).toBe('Abre la sesión en la carpeta del proyecto')
  expect(f.escritos.size).toBe(0)
  expect(f.lecturas.filter(l => /etapa\.json$/.test(l))).toHaveLength(0)
  expect(f.rellenos).toHaveLength(0)
})

test('la guarda usa la raíz del árbol principal, no la del worktree', async ($, on) => {
  const f = fondos(on, { root: 'C:/p/demo/.claude/worktrees/w1', repo: 'C:/p/demo', now: T0 })
  await $.session.start(START)
  await $.command.run({ command: 'etapa', args: 'spec' })
  expect([...f.escritos.keys()]).toEqual([RUTA])
})

test('error de escritura: lo dice y la barra no cambia', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: SPEC }, { escribirFalla: 'EACCES' }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'plan' })
  expect(r.text).toContain('No pude escribir')
  expect(r.text).toContain('C:/p/demo/.claude/etapa.json')
  expect(r.text).toContain('EACCES')
  expect(f.rellenos).toHaveLength(0)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda })
  expect(dentroDe(await anillo(ui, 'Etapa'))).toBe('Spec')
  await ui.unmount()
})

test('plan B: si el prompt no lo toma, el comando trae el texto y el archivo igual se escribe', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: SPEC }, { isFilled: false }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'plan' })
  expect(escrito(f).etapa).toBe('plan')
  expect(r.text).toContain('No pude escribir en el prompt. Cópialo de aquí:')
  expect(r.text).toContain('Cierra la etapa Spec: confirma que la spec está aprobada')
  expect(f.enviados).toBe(0)
})

test('el comando nunca lanza (P-F06): un fallo inesperado vuelve como texto', async ($, on) => {
  const f = fondos(on, base({}, { rootFalla: 'sin raíz' }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'spec' })
  expect(r.text).toMatch(/^No pude cambiar la etapa: /)
  expect(r.text).toContain('sin raíz')
  expect(f.escritos.size).toBe(0)
})

test('guarda: sin HOME conocido no escribe y lo dice', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: SPEC }, { home: '' }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'plan' })
  expect(r.text).toMatch(/HOME/)
  expect(f.escritos.size).toBe(0)
  expect(f.rellenos).toHaveLength(0)
  expect(f.enviados).toBe(0)
})

test('un error de lectura con otro texto ("not found") no cuenta como archivo inexistente', async ($, on) => {
  const f = fondos(on, base({}, { leerFalla: { ruta: /etapa\.json$/, motivo: 'volume not found' } }))
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: 'spec' })
  expect(f.escritos.size).toBe(0)
  expect(r.text).toMatch(/existe pero no lo puedo leer/)
})

test('el mismo proyecto con otras mayúsculas no reinicia inicio ni historial', async ($, on) => {
  const f = fondos(on, base({ [RUTA]: PLAN }))
  await $.session.start(START)
  await $.command.run({ command: 'etapa', args: 'ejecucion MI-BARRA-FLUJO' })
  const w = escrito(f)
  expect(w.inicio).toBe('2026-10-25T21:39:52Z')
  expect(w.historial).toHaveLength(3)
  expect(w.proyecto).toBe('mi-barra-flujo')
})

test('si el átomo falla tras escribir, el texto dice la verdad y hay una línea de debug', async ($, on) => {
  let fallar = false
  on('state.set', async (_$, e, next) => (fallar && e.key === 'etapa' ? { deny: 'disco lleno' } : next(e)))
  const f = fondos(on, base({ [RUTA]: SPEC }))
  await $.session.start(START)
  fallar = true
  const r = await $.command.run({ command: 'etapa', args: 'plan' })
  expect(escrito(f).etapa).toBe('plan') // el archivo sí cambió
  expect(r.text).not.toMatch(/No pude cambiar/)
  expect(r.text).toContain('Etapa: Plan (antes Spec).')
  expect(r.text).toContain('La etapa quedó escrita en el archivo; solo la barra tardará en reflejarla.')
  expect(f.rellenos).toHaveLength(1) // el traspaso se deja igual
  expect(f.logs.some(l => /etapa\.json escrito, pero no pude actualizar la barra/.test(l))).toBe(true)
})
