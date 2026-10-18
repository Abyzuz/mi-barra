import { expect, test } from 'claude-code/testing'

import { cacheGauge, contextGauge, formatSpan, formatTokens, limitGauge, pickLimit, UNAVAILABLE } from '../src/gauges.ts'
import { nextMood } from '../src/mood.ts'
import { mascotSvg, ringSvg } from '../src/svg.ts'

const HOUR = 60 * 60 * 1000

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 } },
} as const

test('sin datos, cada indicador dice "no disponible" y no inventa un número', async () => {
  expect(contextGauge(null).value).toBe(UNAVAILABLE)
  expect(contextGauge(null).fill).toBe(null)
  expect(cacheGauge(null, 1_000, HOUR).value).toBe(UNAVAILABLE)
  expect(limitGauge('fiveHour', null, 0).value).toBe(UNAVAILABLE)
  expect(limitGauge('week', null, 0).value).toBe(UNAVAILABLE)
  expect(pickLimit([], 'five_hour')).toBe(null)
})

test('contexto y límites muestran el porcentaje de la API', async () => {
  expect(contextGauge(42).value).toBe('42%')
  expect(contextGauge(35, 350_412, 1_000_000).hint).toBe('350k/1M')
  expect(contextGauge(35).hint).toBe('')
  expect(formatTokens(1_250_000)).toBe('1.3M')
  expect(formatTokens(850)).toBe('850')
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
  expect((await desktop.findAll({ type: 'Svg' })).length).toBe(5)
  const values = (await desktop.findAll({ type: 'Text', text: UNAVAILABLE })).filter(el => el.props.bold === true)
  expect(values.length).toBe(4)
  await desktop.unmount()

  const terminal = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...BAND })
  expect(await terminal.find({ type: 'Text', text: /Contexto no disponible/ })).toBeDefined()
  await terminal.unmount()
})
