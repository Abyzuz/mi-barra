import { expect, mock, test } from 'claude-code/testing'

import { UMBRALES_DEFECTO } from '../src/contexto.ts'
import { cacheGauge, contextGauge, formatSpan, limitGauge, pickLimit, UNAVAILABLE } from '../src/gauges.ts'
import { nextMood } from '../src/mood.ts'
import { mascotSvg, ringSvg, TONE_COLOR } from '../src/svg.ts'
import { parseStatus, syncGauge } from '../src/sync.ts'

import { anillo, anillos, dentroDe } from './anillos.ts'

const HOUR = 60 * 60 * 1000

// P-F01: 140 columnas para que los seis indicadores quepan en una fila (con menos envuelven a una segunda; ninguno se oculta).
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 140, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

test('sin datos, cada indicador dice "no disponible" y no inventa un número', async () => {
  expect(contextGauge(null, null, UMBRALES_DEFECTO).value).toBe(UNAVAILABLE)
  expect(contextGauge(null, null, UMBRALES_DEFECTO).fill).toBe(null)
  expect(cacheGauge(null, 1_000, HOUR).value).toBe(UNAVAILABLE)
  expect(limitGauge('fiveHour', null, 0).value).toBe(UNAVAILABLE)
  expect(limitGauge('week', null, 0).value).toBe(UNAVAILABLE)
  expect(pickLimit([], 'five_hour')).toBe(null)
})

test('límites muestran el porcentaje de la API', async () => {
  const five = pickLimit([{ kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-18T15:00:00Z' }], 'five_hour')
  expect(five?.percent).toBe(23.5)
  const g = limitGauge('fiveHour', five, Date.parse('2026-10-18T13:00:00Z'))
  expect(g.value).toBe('24%')
  expect(g.hint).toBe('↻2h')
  expect(pickLimit([{ kind: 'seven_day', percentUsed: 61 }], 'seven_day')?.resetsAt).toBe(null)
})

test('caché: último uso real y restante estimado con "~"', async () => {
  const g = cacheGauge(0, 12 * 60 * 1000, HOUR)
  expect(g.hint).toBe('hace 12m')
  expect(g.value).toBe('~48m')
  expect(cacheGauge(0, 2 * HOUR, HOUR).value).toBe('~vencido')
  expect(formatSpan(26 * HOUR)).toBe('1d2h')
})

test('la mascota sale del permiso solo si entró', async () => {
  expect(nextMood('pensando', { type: 'tool-settled' })).toBe('pensando')
  expect(nextMood('escribiendo', { type: 'tool-settled' })).toBe('escribiendo')
  expect(nextMood('permiso', { type: 'tool-settled' })).toBe('pensando')
  expect(nextMood('pensando', { type: 'chunk', kind: 'text' })).toBe('escribiendo')
  expect(nextMood('escribiendo', { type: 'turn-end' })).toBe('terminado')
  expect(nextMood('terminado', { type: 'idle' })).toBe('inactivo')
  expect(nextMood('pensando', { type: 'idle' })).toBe('pensando')
})

test('los SVG no llevan scripts ni manejadores de eventos', async () => {
  for (const mood of ['pensando', 'escribiendo', 'permiso', 'terminado', 'inactivo'] as const) {
    expect(mascotSvg(mood)).not.toMatch(/<script|\son[a-z]+=/i)
  }
  expect(ringSvg(null, 'off')).toContain('stroke-dasharray="3 4"')
})

test('la barra se dibuja en escritorio y terminal, con "no disponible" al inicio', async $ => {
  const desktop = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...BAND })
  expect((await desktop.findAll({ type: 'Svg' })).length).toBe(6)
  const sinDato = (await anillos(desktop)).filter(a => String(a.props.alt).endsWith(UNAVAILABLE))
  expect(sinDato.length).toBe(4) // el alt dice la palabra completa; dentro del anillo va un guion
  expect(sinDato.every(a => dentroDe(a) === '—')).toBe(true)
  await desktop.unmount()

  const terminal = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...BAND })
  expect(await terminal.find({ type: 'Text', text: /Contexto no disponible/ })).toBeDefined()
  await terminal.unmount()
})

test('sync: cada estado del motor con su texto y su tono', async () => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  const at = (msAgo: number) => now - msAgo
  const ok = syncGauge({ state: 'ok', at: at(7 * 60_000), pending: 0, message: 'Todo al día.' }, now)
  expect(ok?.key).toBe('sync')
  expect(ok?.label).toBe('Sync')
  expect(ok?.value).toBe('✓ hace 7 min')
  expect(ok?.tone).toBe('ok')
  expect(syncGauge({ state: 'running', at: at(0), pending: 0, message: '' }, now)?.value).toBe('↑ subiendo')
  const pending = syncGauge({ state: 'pending', at: at(0), pending: 2, message: '2 por decidir.' }, now)
  expect(pending?.value).toBe('⚠ 2 por decidir')
  expect(pending?.tone).toBe('warn')
  const conflict = syncGauge({ state: 'conflict', at: at(0), pending: 1, message: 'Conflicto con el otro equipo; 1 por decidir.' }, now)
  expect(conflict?.value).toBe('⚠ conflicto')
  expect(conflict?.tone).toBe('warn')
  const secret = syncGauge({ state: 'secret', at: at(0), pending: 1, message: 'Subida bloqueada: posible secreto en x.' }, now)
  expect(secret?.value).toBe('⚠ secreto bloqueado')
  expect(secret?.tone).toBe('warn')
  const offline = syncGauge({ state: 'offline', at: at(0), pending: 0, message: 'Sin conexión con GitHub; se reintenta luego.' }, now)
  expect(offline?.value).toBe('sin red')
  expect(offline?.tone).toBe('off')
})

test('sync: sin pendientes pero con aviso del motor, muestra el aviso', async () => {
  const now = 1_000_000
  const behind = syncGauge(
    { state: 'pending', at: now, pending: 0, message: 'hay cambios del otro equipo; se integran al abrir la próxima sesión' },
    now,
  )
  expect(behind?.value.startsWith('⚠ hay cambios del otro equipo')).toBe(true)
  expect(behind?.value.length).toBeLessThanOrEqual(42)
  expect(behind?.tone).toBe('warn')
  const error = syncGauge({ state: 'error', at: now, pending: 1, message: 'No se pudo subir.' }, now)
  expect(error?.value).toBe('⚠ No se pudo subir.')
  expect(error?.tone).toBe('warn')
})

test('sync: una subida que lleva más de 5 min "corriendo" avisa que no terminó', async () => {
  const MIN = 60_000
  const now = 100 * MIN
  expect(syncGauge({ state: 'running', at: now - 5 * MIN, pending: 0, message: '' }, now)?.value).toBe('↑ subiendo')
  const stuck = syncGauge({ state: 'running', at: now - 6 * MIN, pending: 0, message: '' }, now)
  expect(stuck?.value).toBe('⚠ subida sin terminar')
  expect(stuck?.tone).toBe('warn')
})

test('sync: sin status.json no aparece; un "ok" de más de 24 h avisa', async () => {
  const HOUR_MS = 60 * 60 * 1000
  expect(syncGauge(null, 0)).toBe(null)
  const stale = syncGauge({ state: 'ok', at: 0, pending: 0, message: 'Todo al día.' }, 30 * HOUR_MS)
  expect(stale?.value).toBe('⚠ hace 30 h')
  expect(stale?.tone).toBe('warn')
  expect(syncGauge({ state: 'ok', at: 0, pending: 0, message: '' }, 3 * HOUR_MS)?.value).toBe('✓ hace 3 h')
})

test('sync: status.json ilegible o de otra forma no aparece', async () => {
  expect(parseStatus('{"state":"ok","at":5,"pending":0,"message":"Todo al día."}')?.at).toBe(5)
  expect(parseStatus('no es json')).toBe(null)
  expect(parseStatus('{"state":"ok"}')).toBe(null)
  expect(parseStatus('{"state":"desconocido","at":5,"pending":0,"message":""}')).toBe(null)
  expect(parseStatus('null')).toBe(null)
})

test('sync: la barra lee status.json del home al iniciar y en cada tick', async ($, on) => {
  const MIN = 60_000
  const clock = mock.clock(on, { now: 100 * MIN })
  mock.env(on, { USERPROFILE: 'C:/casa' })
  let text = JSON.stringify({ state: 'ok', at: 93 * MIN, pending: 0, message: 'Todo al día.' })
  const paths: string[] = []
  on('fs.read', async ($, e, next) => {
    // El motor normaliza el separador del sistema: se compara con "/".
    const path = e.path.replace(/\\/g, '/')
    paths.push(path)
    return path === 'C:/casa/.claude/workspace/status.json' ? { value: text } : next(e)
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  expect(paths).toContain('C:/casa/.claude/workspace/status.json')

  const desktop = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...BAND })
  expect((await desktop.findAll({ type: 'Svg' })).length).toBe(7)
  expect((await anillo(desktop, 'Sync'))?.props.alt).toBe('Sync: ✓ hace 7 min')
  expect(dentroDe(await anillo(desktop, 'Sync'))).toBe('✓')

  text = JSON.stringify({ state: 'conflict', at: 100 * MIN, pending: 1, message: 'Conflicto.' })
  await clock.advance(15_000)
  expect((await anillo(desktop, 'Sync'))?.props.alt).toBe('Sync: ⚠ conflicto')
  expect(dentroDe(await anillo(desktop, 'Sync'))).toBe('⚠')
  await desktop.unmount()
})

test('sync: sin status.json el indicador no aparece y la barra sigue igual', async ($, on) => {
  mock.clock(on)
  mock.env(on, { HOME: '/home/nadie' })
  on('fs.read', async () => ({ deny: 'ENOENT: no existe' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const terminal = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...BAND })
  const line = await terminal.find({ type: 'Text', text: /Contexto/ })
  expect(line).toBeDefined()
  expect(await terminal.findAll({ type: 'Text', text: /Sync/ })).toEqual([])
  await terminal.unmount()
})

test('los umbrales de userConfig llegan a la barra', { options: { ambar: 20_000, rojo: 30_000 } }, async ($, on) => {
  mock.clock(on)
  mock.env(on, { HOME: '/home/nadie' })
  on('fs.read', async () => ({ deny: 'ENOENT: no existe' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { tokens: 25_000, window: 1_000_000, percent: 3 }, rateLimits: [], changed: ['context'] })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...BAND })
  expect(dentroDe(await anillo(ui, 'Contexto'))).toBe('25k')
  const anillos = await ui.findAll({ type: 'Svg' })
  expect(anillos.some(s => String(s.props.source).includes(TONE_COLOR.warn))).toBe(true) // ámbar: 25k ≥ 20k
  await ui.unmount()
})

test('umbrales inválidos: defectos en la barra y una línea en el debug log', { options: { ambar: 30_000, rojo: 20_000 } }, async ($, on) => {
  mock.clock(on)
  mock.env(on, { HOME: '/home/nadie' })
  on('fs.read', async () => ({ deny: 'ENOENT: no existe' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  const lineas: string[] = []
  on('ui.log', async (_$, e) => {
    lineas.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  expect(lineas.some(l => /umbrales inválidos \(ambar=30000, rojo=20000\); uso 150000\/200000/.test(l))).toBe(true)
  await $.session.measure({ context: { tokens: 25_000, window: 1_000_000, percent: 3 }, rateLimits: [], changed: ['context'] })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...BAND })
  const anillos = await ui.findAll({ type: 'Svg' })
  expect(anillos.some(s => String(s.props.source).includes(TONE_COLOR.warn))).toBe(false) // defectos: 25k es verde
  await ui.unmount()
})
