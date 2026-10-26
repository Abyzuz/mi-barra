// 0.2.2: la banda de escritorio dibuja el valor dentro del anillo y la etiqueta debajo.
import { expect, test } from 'claude-code/testing'

import { ETAPAS, etapaGauge, rotuloEtapa, vistaEtapa } from '../src/etapa.ts'
import { cacheGauge, contextGauge, limitGauge, rotuloCorto, UNAVAILABLE, valorCorto } from '../src/gauges.ts'
import { etapaSvg, ringSvg } from '../src/svg.ts'
import { syncGauge } from '../src/sync.ts'
import { fondos } from './fondos.ts'

const MIN = 60_000
const DIA = 24 * 60 * 60 * 1000
const T0 = Date.parse('2026-11-20T12:00:00Z')
const U = { ambar: 150_000, rojo: 250_000 }

const archivo = (etapa: string, proyecto = 'demo', desde = '2026-10-25T23:00:00Z') =>
  `{ "v": 1, "proyecto": "${proyecto}", "etapa": "${etapa}", "desde": "${desde}", "inicio": "2026-10-25T21:39:52Z", "historial": [] }`
const leida = (texto: string) => ({ raiz: 'C:/p', carpeta: 'p', prohibida: false, file: JSON.parse(texto) })

test('valorCorto: cada indicador dibuja un valor corto, sin pista', () => {
  expect(valorCorto(contextGauge(211_400, 1_000_000, U))).toBe('211k')
  expect(valorCorto(contextGauge(1_000_000, 1_000_000, U))).toBe('1M')
  expect(valorCorto(limitGauge('fiveHour', { percent: 20.2, resetsAt: null }, T0))).toBe('20%')
  expect(valorCorto(limitGauge('week', { percent: 29, resetsAt: T0 + 3 * DIA }, T0))).toBe('29%')
  expect(valorCorto(cacheGauge(T0 - 5 * MIN, T0, 60 * MIN))).toBe('55m') // sin el "~" de la estimación
  expect(valorCorto(cacheGauge(T0 - 2 * 60 * MIN, T0, 60 * MIN))).toBe('venc.')
})

test('valorCorto: sin dato, un guion', () => {
  expect(valorCorto(contextGauge(null, null, U))).toBe('—')
  expect(valorCorto(cacheGauge(null, T0, 60 * MIN))).toBe('—')
  expect(valorCorto(limitGauge('week', null, T0))).toBe('—')
  expect(contextGauge(null, null, U).value).toBe(UNAVAILABLE) // el alt conserva la palabra completa
})

test('valorCorto de Sync: el glifo y, si hay, el número de pendientes', () => {
  const st = (state: string, extra: Record<string, unknown> = {}) =>
    syncGauge({ state, at: T0 - 7 * MIN, pending: 0, message: '', ...extra } as never, T0)!
  expect(valorCorto(st('ok'))).toBe('✓')
  expect(valorCorto(st('pending', { pending: 1 }))).toBe('⚠1')
  expect(valorCorto(st('pending', { pending: 12 }))).toBe('⚠12')
  expect(valorCorto(st('pending', { message: 'algo raro' }))).toBe('⚠')
  expect(valorCorto(st('conflict'))).toBe('⚠')
  expect(valorCorto(st('running', { at: T0 - MIN }))).toBe('↑')
  expect(valorCorto(st('offline'))).toBe('—')
})

test('valorCorto de Etapa: una palabra por etapa y un guion sin etapa', () => {
  const corto = (texto: string) => valorCorto(etapaGauge(vistaEtapa(leida(texto), T0)))
  expect(corto(archivo('spec'))).toBe('Spec')
  expect(corto(archivo('plan'))).toBe('Plan')
  expect(corto(archivo('ejecucion'))).toBe('Ejec.')
  expect(corto(archivo('final'))).toBe('Final')
  expect(corto(archivo('uso'))).toBe('Uso')
  expect(valorCorto(etapaGauge(vistaEtapa(null, T0)))).toBe('—')
  // Toda etapa del flujo tiene su palabra corta (la tabla no se desfasa de ETAPAS).
  for (const e of ETAPAS) expect(corto(archivo(e))).not.toBe('—')
})

test('rotuloEtapa: proyecto recortado, día de uso y "Etapa" sin etapa', () => {
  expect(rotuloEtapa(null, T0)).toBe('Etapa')
  expect(rotuloEtapa({ raiz: 'C:/p', carpeta: 'p', prohibida: false, file: null }, T0)).toBe('Etapa')
  expect(rotuloEtapa(leida(archivo('plan', 'demo')), T0)).toBe('demo')
  expect(rotuloEtapa(leida(archivo('plan', 'mi-barra-flujo')), T0)).toBe('mi-barra-fl…') // 12 caracteres con la elipsis
  expect(rotuloEtapa(leida(archivo('plan', 'doce-letras')), T0)).toBe('doce-letras')
  expect(rotuloEtapa(leida(archivo('uso', 'demo', new Date(T0 - 13 * DIA).toISOString())), T0)).toBe('demo 14/14')
  expect(rotuloEtapa(leida(archivo('uso', 'mi-barra-flujo', new Date(T0 - 2 * DIA).toISOString())), T0)).toBe('mi-barra-fl… 3/14')
})

test('rotuloCorto: el límite de cinco horas es "5h"; los demás, su etiqueta', () => {
  expect(rotuloCorto(limitGauge('fiveHour', null, T0))).toBe('5h')
  expect(rotuloCorto(limitGauge('week', null, T0))).toBe('Semanal')
  expect(rotuloCorto(contextGauge(null, null, U))).toBe('Contexto')
  expect(rotuloCorto(cacheGauge(null, T0, 60 * MIN))).toBe('Caché')
  expect(rotuloCorto(syncGauge({ state: 'ok', at: T0, pending: 0, message: '' }, T0)!)).toBe('Sync')
})

test('ringSvg y etapaSvg dibujan el valor centrado, escapado, y sin él quedan como antes', () => {
  const con = ringSvg(0.5, 'ok', '20%')
  expect(con).toMatch(/<text[^>]*text-anchor="middle"[^>]*>20%<\/text>/)
  const tam = (svg: string) => /font-size="(\d+)"/.exec(svg)?.[1]
  expect(tam(ringSvg(0.5, 'ok', '20%'))).toBe('11') // hasta 3 caracteres
  expect(tam(ringSvg(0.5, 'ok', '⚠1'))).toBe('11')
  expect(tam(ringSvg(0.5, 'ok', '100%'))).toBe('10') // 4 caracteres
  expect(tam(ringSvg(0.5, 'ok', '211k'))).toBe('10')
  expect(tam(ringSvg(0.5, 'ok', 'Ejec.'))).toBe('9') // 5 o más
  expect(tam(ringSvg(0.5, 'ok', 'venc.'))).toBe('9')
  expect(tam(ringSvg(0.5, 'ok', '⚠123'))).toBe('10')
  expect(tam(ringSvg(0.5, 'ok', '⚠1234'))).toBe('9')
  expect(ringSvg(0.5, 'ok')).not.toContain('<text')
  const raro = ringSvg(null, 'off', 'a&b<c>"')
  expect(raro).toContain('>a&amp;b&lt;c&gt;&quot;</text>')
  expect(raro).not.toContain('a&b')
  expect(raro).not.toMatch(/<script|\son[a-z]+=/i)
  const etapa = etapaSvg(1, 'Plan')
  expect(etapa).toMatch(/<text[^>]*text-anchor="middle"[^>]*>Plan<\/text>/)
  expect(etapa.match(/<path/g)?.length).toBe(5)
  expect(etapaSvg(null, '—')).toContain('>—</text>')
  expect(etapaSvg(1)).not.toContain('<text')
})

test('el valor lleva el color de su tono como fill fijo, sin <style> ni tema', () => {
  const fill = (svg: string) => /<text[^>]* fill="([^"]+)"/.exec(svg)?.[1]
  expect(fill(ringSvg(0.2, 'ok', '20%'))).toBe('#1D9E75')
  expect(fill(ringSvg(0.7, 'warn', '70%'))).toBe('#EF9F27')
  expect(fill(ringSvg(0.9, 'bad', '90%'))).toBe('#E24B4A')
  expect(fill(ringSvg(null, 'off', '—'))).toBe('#888780')
  expect(fill(etapaSvg(2, 'Ejec.'))).toBe('#1D9E75') // con etapa, verde
  expect(fill(etapaSvg(null, '—'))).toBe('#888780') // sin etapa, gris
  for (const svg of [ringSvg(0.5, 'ok', '20%'), ringSvg(null, 'off', '—'), etapaSvg(1, 'Plan'), etapaSvg(null, '—')]) {
    expect(svg).not.toMatch(/<style|@media|prefers-color-scheme|currentColor|#1d1b22/i)
  }
})

// --- Banda de escritorio ----------------------------------------------------
const banda = (bodyColumns = 140) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  }) as const
const START = { cwd: '.', surface: 'desktop', isInteractive: true } as const
type Ui = { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text?: string }[]> }
const anillos = async (ui: Ui) => (await ui.findAll({ type: 'Svg' })).filter(s => s.props.width === 34)
const textos = async (ui: Ui) => (await ui.findAll({ type: 'Text' })).map(t => String(t.text))

test('desktop: seis anillos de 34 con el valor dentro y la etiqueta debajo, sin pistas', async ($, on) => {
  fondos(on, {
    home: 'C:/Users/prueba',
    archivos: {
      'C:/proyectos/demo/.claude/etapa.json': archivo('ejecucion', 'mi-barra-flujo'),
      'C:/Users/prueba/.claude/workspace/status.json': JSON.stringify({ state: 'pending', at: T0 - 7 * MIN, pending: 1, message: 'x' }),
    },
    now: T0,
  })
  await $.session.start(START)
  await $.session.measure({
    context: { tokens: 211_400, window: 1_000_000, percent: 21 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20, resetsAt: new Date(T0 + 2 * 60 * MIN).toISOString() },
      { kind: 'seven_day', percentUsed: 29 },
    ],
    changed: ['context', 'rateLimits'],
  })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  const as = await anillos(ui)
  expect(as.length).toBe(6) // Etapa, Contexto, Caché, 5h, Semanal, Sync (la mascota, de 32, aparte)
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(7)
  expect(as.every(a => a.props.height === 34)).toBe(true)
  const dentro = as.map(a => /<text[^>]*>([^<]*)<\/text>/.exec(String(a.props.source))?.[1])
  expect(dentro).toEqual(['Ejec.', '211k', '—', '20%', '29%', '⚠1'])
  const rotulos = (await textos(ui)).filter(t => ['mi-barra-fl…', 'Contexto', 'Caché', '5h', 'Semanal', 'Sync'].includes(t))
  expect(rotulos).toEqual(['mi-barra-fl…', 'Contexto', 'Caché', '5h', 'Semanal', 'Sync'])
  // El alt conserva etiqueta, valor y pista.
  const alts = as.map(a => String(a.props.alt))
  expect(alts[0]).toBe('Etapa: Ejecución · mi-barra-flujo')
  expect(alts[1]).toContain('Contexto: 211k')
  expect(alts[1]).toContain('21 % de 1M')
  expect(alts[3]).toMatch(/^Límite 5h: 20% · ↻/)
  expect(alts[5]).toBe('Sync: ⚠ 1 por decidir')
  // Ni pistas ni valores como texto aparte en la banda.
  const todo = await textos(ui)
  expect(todo.some(t => /↻|hace |·/.test(t))).toBe(false)
  expect(todo).not.toContain('211k')
  await ui.unmount()
})

test('desktop: sin etapa ni datos, guion dentro y "Etapa" debajo; la fila envuelve de respaldo', async ($, on) => {
  fondos(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda(60) })
  const as = await anillos(ui)
  expect(as.length).toBe(5) // sin Sync
  for (const a of as) expect(String(a.props.source)).toContain('>—</text>')
  expect(await textos(ui)).toContain('Etapa')
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.flexDirection === 'row' && b.props.flexWrap === 'wrap' && b.props.columnGap === 2)).toBe(true)
  await ui.unmount()
})

test('desktop: cada indicador es una columna centrada con el anillo arriba y la etiqueta debajo', async ($, on) => {
  fondos(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  const cols = (await ui.findAll({ type: 'Box' })).filter(b => b.props.flexDirection === 'column' && b.props.alignItems === 'center')
  expect(cols.length).toBe(5)
  await ui.unmount()
})

test('terminal: la línea de texto no cambia (valores completos y pistas)', async ($, on) => {
  fondos(on, { archivos: { 'C:/proyectos/demo/.claude/etapa.json': archivo('plan', 'mi-barra-flujo') }, now: T0 })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(100) })
  const linea = (await ui.find({ type: 'Text', text: /Etapa/ }))?.text ?? ''
  expect(linea).toContain('Etapa Plan (mi-barra-flujo) │ Contexto no disponible')
  expect(linea).not.toMatch(/Ejec\.|—/)
  await ui.unmount()
})
