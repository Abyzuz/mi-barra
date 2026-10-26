import { atom, read } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { ARCHIVO_ESTADO } from '../src/contexto.ts'
import { textoT8 } from '../src/etapa.ts'
import { etapaSvg } from '../src/svg.ts'
import { anillo, dentroDe } from './anillos.ts'
import { fondos } from './fondos.ts'

const ARCH =
  '{ "v": 1, "proyecto": "mi-barra-flujo", "etapa": "plan", "desde": "2026-10-25T23:00:00Z", "inicio": "2026-10-25T21:39:52Z", "historial": [{ "etapa": "spec", "desde": "2026-10-25T21:39:52Z" }, { "etapa": "plan", "desde": "2026-10-25T23:00:00Z" }] }'
const EJEC = ARCH.replace('"etapa": "plan", "desde"', '"etapa": "ejecucion", "desde"')
const T0 = Date.parse('2026-11-20T12:00:00Z')
const DIA = 24 * 60 * 60 * 1000
const usoDesde = (ms: number) =>
  `{ "v": 1, "proyecto": "mi-barra-flujo", "etapa": "uso", "desde": "${new Date(ms).toISOString()}", "inicio": "2026-10-25T21:39:52Z", "historial": [] }`

// P-F01: los conteos de Svg se hacen con una banda de 140 columnas (caben los seis indicadores en una fila).
const banda = (bodyColumns = 140, maxRows = 6) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  }) as const

const medir = (tokens: number, window = 1_000_000) => ({
  context: { tokens, window, percent: Math.round((tokens / window) * 100) },
  rateLimits: [],
  changed: ['context'],
})

const START = { cwd: '.', surface: 'desktop', isInteractive: true } as const

type Ui = { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }
const anilloEtapa = (ui: Ui) => anillo(ui, 'Etapa')

test('la raíz es la del árbol principal aunque la sesión esté en un worktree', async ($, on) => {
  fondos(on, { root: 'C:/p/demo/.claude/worktrees/w1', repo: 'C:/p/demo', archivos: { 'C:/p/demo/.claude/etapa.json': ARCH } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(dentroDe(await anilloEtapa(ui))).toBe('Plan')
  expect(await ui.find({ type: 'Text', text: /mi-barra-fl/ })).toBeDefined() // P-M12
  await ui.unmount()
})

test('sin repo, la raíz es la de la sesión (y las rutas con "\\" también leen)', async ($, on) => {
  const f = fondos(on, { repo: null, root: 'C:\\p\\otra', archivos: { 'C:/p/otra/.claude/etapa.json': ARCH } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(f.lecturas).toContain('C:/p/otra/.claude/etapa.json')
  expect(dentroDe(await anilloEtapa(ui))).toBe('Plan')
  await ui.unmount()
})

test('el anillo Etapa dibuja el segmento de la etapa leída y se llama "Etapa: Plan"', async ($, on) => {
  fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': ARCH } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  const anillo = await anilloEtapa(ui)
  expect(anillo?.props.alt).toBe('Etapa: Plan · mi-barra-flujo')
  expect(anillo?.props.source).toBe(etapaSvg(1, 'Plan'))
  await ui.unmount()
})

test('una lectura que no termina no frena el arranque', async ($, on) => {
  const f = fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': ARCH }, leerNunca: /etapa\.json$/, now: T0 })
  await $.session.start(START) // si esperara la lectura, esto nunca resuelve
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  const anillo = await anilloEtapa(ui)
  expect(anillo?.props.alt).toBe('Etapa: sin etapa')
  expect(anillo?.props.source).toBe(etapaSvg(null, '—'))
  expect(dentroDe(anillo)).not.toBe('Plan')
  await f.clock.advance(15_000)
  await f.clock.advance(15_000)
  expect(f.lecturas.filter(l => /etapa\.json$/.test(l)).length).toBe(1)
  await ui.unmount()
})

test('el tick recoge un cambio del archivo', async ($, on) => {
  const f = fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': ARCH }, now: T0 })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(dentroDe(await anilloEtapa(ui))).toBe('Plan')
  f.archivos.set('C:/proyectos/demo/.claude/etapa.json', EJEC)
  await f.clock.advance(15_000)
  expect(dentroDe(await anilloEtapa(ui))).toBe('Ejec.')
  expect((await anilloEtapa(ui))?.props.alt).toBe('Etapa: Ejecución · mi-barra-flujo')
  await ui.unmount()
})

test('archivo inválido: sin etapa y una línea de debug', async ($, on) => {
  const f = fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': '{"v":9}' }, now: T0 })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(String((await anilloEtapa(ui))?.props.alt)).toMatch(/^Etapa: sin etapa/)
  expect(f.logs.filter(l => /etapa\.json/.test(l)).length).toBe(1)
  await f.clock.advance(15_000) // el mismo problema no se repite en cada tick
  expect(f.logs.filter(l => /etapa\.json/.test(l)).length).toBe(1)
  await ui.unmount()
})

test('sin archivo no hay línea de debug; un error de lectura que no es ENOENT sí', async ($, on) => {
  const f = fondos(on)
  await $.session.start(START)
  expect(f.logs.filter(l => /etapa\.json/.test(l)).length).toBe(0)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(String((await anilloEtapa(ui))?.props.alt)).toMatch(/^Etapa: sin etapa/)
  await ui.unmount()
})

test('un error de lectura que no es ENOENT: sin etapa y una línea de debug', async ($, on) => {
  const f = fondos(on, { leerFalla: { ruta: /etapa\.json$/, motivo: 'EACCES: permiso denegado' } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(String((await anilloEtapa(ui))?.props.alt)).toMatch(/^Etapa: sin etapa/)
  expect(f.logs.filter(l => /etapa\.json/.test(l)).length).toBe(1)
  await ui.unmount()
})

test('la guarda: en el HOME no se lee ni se muestra etapa', async ($, on) => {
  const f = fondos(on, {
    home: 'C:/Users/prueba',
    root: 'C:/Users/prueba',
    repo: null,
    archivos: { 'C:/Users/prueba/.claude/etapa.json': ARCH },
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(f.lecturas.filter(l => /etapa\.json$/.test(l)).length).toBe(0)
  expect(String((await anilloEtapa(ui))?.props.alt)).toMatch(/^Etapa: sin etapa/)
  expect(dentroDe(await anilloEtapa(ui))).toBe('—')
  await ui.unmount()
})

test('"arranque" se fija una sola vez con el reloj del primer session.start', async ($, on) => {
  const f = fondos(on, { now: T0 })
  const escrituras: unknown[] = []
  on('state.set', async (_$, e, next) => {
    if (e.key === 'arranque') escrituras.push(e.value)
    return next(e)
  })
  await $.session.start(START)
  await f.clock.advance(60_000)
  await $.session.start(START)
  expect(escrituras.length).toBe(2)
  expect(escrituras).toEqual([T0, T0]) // el segundo arranque no pisa el primero
})

test('desktop: Etapa va antes de Contexto y la banda tiene un Svg más', async ($, on) => {
  fondos(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda(140) })
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(6) // mascota + Etapa + 4 anillos, sin sync
  const rotulos = (await ui.findAll({ type: 'Text' })).map(t => String((t as { text?: string }).text)).filter(t => ['Etapa', 'Contexto', 'Caché'].includes(t))
  expect(rotulos).toEqual(['Etapa', 'Contexto', 'Caché'])
  await ui.unmount()
})

test('desktop: Semanal y Sync se dibujan siempre, también con la ventana angosta', async ($, on) => {
  const MIN = 60_000
  fondos(on, {
    home: 'C:/Users/prueba',
    archivos: { 'C:/Users/prueba/.claude/workspace/status.json': JSON.stringify({ state: 'ok', at: T0 - 7 * MIN, pending: 0, message: 'Todo al día.' }) },
    now: T0,
  })
  await $.session.start(START)
  for (const columnas of [140, 100, 60]) {
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda(columnas) })
    expect(await ui.find({ type: 'Text', text: 'Sync' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Semanal' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Etapa' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Contexto' })).toBeDefined()
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(7) // mascota + Etapa + 4 anillos + Sync
    const rotulos = (await ui.findAll({ type: 'Text' })).map(t => String((t as { text?: string }).text)).filter(t => ['Etapa', 'Contexto', 'Caché', '5h', 'Semanal', 'Sync'].includes(t))
    expect(rotulos).toEqual(['Etapa', 'Contexto', 'Caché', '5h', 'Semanal', 'Sync'])
    await ui.unmount()
  }
})

test('desktop: la fila de anillos envuelve a una segunda fila en vez de cortarse', async ($, on) => {
  fondos(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda(60) })
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes.some(b => b.props.flexDirection === 'row' && b.props.flexWrap === 'wrap')).toBe(true)
  await ui.unmount()
})

test('terminal: la línea lleva todos los indicadores aunque haya poco ancho (el terminal la trunca al final)', async ($, on) => {
  const MIN = 60_000
  fondos(on, {
    home: 'C:/Users/prueba',
    archivos: { 'C:/Users/prueba/.claude/workspace/status.json': JSON.stringify({ state: 'ok', at: T0 - 7 * MIN, pending: 0, message: 'Todo al día.' }) },
    now: T0,
  })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(60) })
  const linea = (await ui.find({ type: 'Text', text: /Etapa/ }))?.text ?? ''
  expect(linea).toMatch(/Semanal/)
  expect(linea).toMatch(/Sync/)
  await ui.unmount()
})

test('terminal: la etapa aparece en la línea', async ($, on) => {
  fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': ARCH } })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(100) })
  expect(await ui.find({ type: 'Text', text: /Etapa Plan/ })).toBeDefined()
  await ui.unmount()
})

test('terminal: la línea lleva el proyecto como pista de la Etapa', async ($, on) => {
  fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': ARCH } })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const plan = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(100) })
  expect((await plan.find({ type: 'Text', text: /Etapa/ }))?.text).toContain('Etapa Plan (mi-barra-flujo) │ Contexto')
  await plan.unmount()
})

test('terminal: en uso real la pista trae el día', async ($, on) => {
  fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': usoDesde(T0 - 13 * DIA) }, now: T0 })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(100) })
  expect((await ui.find({ type: 'Text', text: /Etapa/ }))?.text).toContain('Etapa Uso real (mi-barra-flujo · día 14 de 14) │ Contexto')
  await ui.unmount()
})

test('terminal: sin etapa y sin pista la línea no cambia', async $ => {
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(100) })
  const linea = (await ui.find({ type: 'Text', text: /Etapa/ }))?.text ?? ''
  expect(linea).toContain('Etapa sin etapa │ Contexto')
  expect(linea).not.toMatch(/Etapa sin etapa \(/)
  await ui.unmount()
})

test('día 14 de uso real: fila con anotar e ignorar; el día 13 no la muestra', async ($, on) => {
  const f = fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': usoDesde(T0 - 13 * DIA) }, now: T0 }) // P-M03: 13 días antes = día 14
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(await ui.find({ type: 'Text', text: 'mi-barra-fl… 14/14' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Dos semanas de uso real/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'uso-anotar' })).toBeDefined()
  await ui.press({ key: 'uso-anotar' })
  expect(f.rellenos[0]?.text).toBe(textoT8('mi-barra-flujo'))
  expect(f.enviados).toBe(0)
  await ui.press({ key: 'uso-ignorar' })
  expect(await ui.find({ type: 'Button', key: 'uso-ignorar' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'uso-anotar' })).toBeUndefined()
  await ui.unmount()
})

test('día 13 de uso real: sin fila', async ($, on) => {
  fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': usoDesde(T0 - 12 * DIA) }, now: T0 }) // 12 días antes = día 13
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(await ui.find({ type: 'Text', text: 'mi-barra-fl… 13/14' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'uso-anotar' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Dos semanas de uso real/ })).toBeUndefined()
  await ui.unmount()
})

test('la fila de dos semanas no sale fuera de uso real', async ($, on) => {
  fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': usoDesde(T0 - 20 * DIA).replace('"uso"', '"final"') }, now: T0 })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(await ui.find({ type: 'Button', key: 'uso-anotar' })).toBeUndefined()
  await ui.unmount()
})

test('cerrar tanda usa la etapa leída', async ($, on) => {
  const f = fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': EJEC } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  await ui.press({ key: 'tanda-cerrar' })
  expect(f.rellenos[0]!.text).toContain(`cierra la tanda en ${ARCHIVO_ESTADO}`)
  await ui.unmount()
})

test('cerrar tanda sin etapa usa el cierre genérico', async ($, on) => {
  const f = fondos(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  await ui.press({ key: 'tanda-cerrar' })
  expect(f.rellenos[0]!.text).not.toContain(`cierra la tanda en ${ARCHIVO_ESTADO}`)
  expect(f.rellenos[0]!.text).toContain('deja el estado en un archivo de la carpeta del proyecto')
  await ui.unmount()
})

test('/tanda con etapa ejecucion usa el cierre de esa etapa (P-M22)', async ($, on) => {
  const f = fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': EJEC } })
  await $.session.start(START)
  await $.session.measure(medir(210_000))
  const r = await $.command.run({ command: 'tanda', args: '' })
  expect(JSON.stringify(r)).toContain('Dejé el pedido de cierre en el prompt.')
  expect(f.rellenos[0]!.text).toContain(`cierra la tanda en ${ARCHIVO_ESTADO}`)
  expect(f.enviados).toBe(0)
})
