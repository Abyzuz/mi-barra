import { expect, test } from 'claude-code/testing'

import { mascotSvg } from '../src/svg.ts'
import { fondos } from './fondos.ts'

const banda = (maxRows = 6) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 120, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  }) as const

/** El `source` de la mascota: el kit no expone el `key` de un Svg, así que es el único interactivo. */
const mascota = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  String((await ui.findAll({ type: 'Svg' })).find(s => s.props.isInteractive === true)?.props.source)

const medir = (tokens: number | undefined, window = 1_000_000) => ({
  context: tokens === undefined ? { window } : { tokens, window, percent: Math.round((tokens / window) * 100) },
  rateLimits: [],
  changed: ['context'],
})

test('la fila de rojo aparece con su botón primario y se va al bajar', async ($, on) => {
  fondos(on)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  const cerrar = await ui.find({ type: 'Button', key: 'tanda-cerrar' })
  expect(cerrar?.props.variant).toBe('primary')
  expect(await ui.find({ type: 'Button', key: 'tanda-seguir' })).toBeDefined()
  await $.session.measure(medir(undefined))
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeUndefined()
  await $.session.measure(medir(210_000))
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeDefined()
  await $.session.measure(medir(120_000))
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeUndefined()
  await ui.unmount()
})

test('cerrar tanda con cuadro vacío reemplaza; nunca envía', async ($, on) => {
  const f = fondos(on, { borrador: '' })
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  await ui.press({ key: 'tanda-cerrar' })
  expect(f.rellenos.length).toBe(1)
  expect(f.rellenos[0]!.mode).toBe('replace')
  expect(f.rellenos[0]!.text.startsWith('Contexto en 210k')).toBe(true)
  expect(f.enviados).toBe(0)
  await ui.unmount()
})

test('cerrar tanda con borrador añade debajo; nunca envía', async ($, on) => {
  const f = fondos(on, { borrador: 'mi idea' })
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  await ui.press({ key: 'tanda-cerrar' })
  expect(f.rellenos[0]!.mode).toBe('append')
  expect(f.rellenos[0]!.text.startsWith('\n')).toBe(true)
  expect(f.rellenos[0]!.text).toContain('Contexto en 210k')
  expect(f.enviados).toBe(0)
  await ui.unmount()
})

test('sin cuadro: plan B con texto, Copiar y toast', async ($, on) => {
  const f = fondos(on, { isFilled: false })
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  await ui.press({ key: 'tanda-cerrar' })
  expect(await ui.find({ type: 'Text', text: /Contexto en 210k/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'tanda-copiar' })).toBeDefined()
  expect(f.toasts).toContain('No pude escribir en el prompt: cópialo con el botón')
  await ui.press({ key: 'tanda-copiar' })
  expect(f.copias.length).toBe(1)
  expect(f.copias[0]!.startsWith('Contexto en 210k')).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'tanda-copiar' })).toBeUndefined()
  expect(f.enviados).toBe(0)
  await ui.unmount()
})

test('seguir aquí pliega hasta el escalón siguiente', async ($, on) => {
  fondos(on)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  await ui.press({ key: 'tanda-seguir' })
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeUndefined()
  await $.session.measure(medir(250_000))
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeUndefined()
  await $.session.measure(medir(262_000))
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeDefined()
  await ui.unmount()
})

test('tras compactar, el aviso vuelve a sonar aunque se hubiera plegado (P-F03)', async ($, on) => {
  fondos(on)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  await ui.press({ key: 'tanda-seguir' }) // pliega hasta 262k
  await $.session.measure(medir(undefined)) // compactó: sin dato
  await $.session.measure(medir(205_000)) // vuelve a pasar el rojo
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeDefined()
  await ui.press({ key: 'tanda-seguir' })
  await $.session.measure(medir(100_000)) // compactó a verde
  await $.session.measure(medir(205_000))
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeDefined()
  await ui.unmount()
})

test('toast una vez por cruce', async ($, on) => {
  const f = fondos(on)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  await $.session.measure(medir(150_000))
  expect(f.toasts).toEqual([])
  await $.session.measure(medir(210_000))
  await $.session.measure(medir(230_000))
  expect(f.toasts).toEqual(['⚠ 210k de contexto: sesión nueva si quedan más de ~17 turnos'])
  await $.session.measure(medir(undefined))
  await $.session.measure(medir(205_000))
  expect(f.toasts.length).toBe(2)
})

test('toast al arrancar ya por encima: exactamente uno', async ($, on) => {
  const f = fondos(on, { usage: { tokens: 300_000, window: 1_000_000 } })
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  await $.session.measure(medir(300_000))
  expect(f.toasts.length).toBe(1)
  expect(f.toasts[0]).toContain('300k de contexto')
})

test('salto 150k a 420k: fila con n correcto, un toast, «Seguir aquí» hasta 550k y mascota con "!" tras plegar (P-M19)', async ($, on) => {
  const f = fondos(on)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(150_000))
  await $.session.measure(medir(420_000))
  expect(await ui.find({ type: 'Text', text: /Contexto 420k: cambiar de sesión se paga si quedan más de ~5 turnos/ })).toBeDefined()
  expect(f.toasts.length).toBe(1)
  await ui.press({ key: 'tanda-seguir' })
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeUndefined()
  await $.session.measure(medir(540_000))
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeUndefined()
  expect(await mascota(ui)).toContain('>!<')
  await $.session.measure(medir(550_000))
  expect(await ui.find({ type: 'Button', key: 'tanda-cerrar' })).toBeDefined()
  expect(f.toasts.length).toBe(1)
  await ui.unmount()
})

test('/tanda hace lo mismo que el botón', async ($, on) => {
  const f = fondos(on, { borrador: 'x' })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  expect(f.comandos).toContain('tanda')
  // Sin dato de contexto: no rellena.
  const sinDato = await $.command.run({ command: 'tanda', args: '' })
  expect(sinDato.text).toBe('Contexto no disponible todavía: espera la primera respuesta.')
  expect(f.rellenos.length).toBe(0)
  await $.session.measure(medir(210_000))
  const r = await $.command.run({ command: 'tanda', args: '' })
  expect(r.text).toBe('Dejé el pedido de cierre en el prompt.')
  expect(f.rellenos.length).toBe(1)
  expect(f.rellenos[0]!.mode).toBe('append')
  expect(f.enviados).toBe(0)
})

test('/tanda sin cuadro devuelve el texto completo', async ($, on) => {
  const f = fondos(on, { isFilled: false })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  await $.session.measure(medir(210_000))
  const r = await $.command.run({ command: 'tanda', args: '' })
  expect(r.text).toContain('Contexto en 210k: según la regla 3')
  expect(r.text).toContain('Si quedan menos, o son preguntas sueltas, dímelo en una línea y seguimos aquí.')
  expect(f.enviados).toBe(0)
})

test('terminal: el aviso va antes de los indicadores', async ($, on) => {
  fondos(on)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  await $.session.measure(medir(210_000))
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(6) })
  const textos = await ui.findAll({ type: 'Text' })
  expect(textos[0]!.text).toContain('Contexto 210k: cambiar de sesión')
  expect(textos[1]!.text).toMatch(/Contexto █/)
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
  await ui.unmount()

  const una = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(1) })
  const solo = await una.findAll({ type: 'Text' })
  expect(solo.length).toBe(1)
  expect(solo[0]!.text.startsWith('⚠ Contexto 210k')).toBe(true)
  await una.unmount()
})

test('mascota con "!" mientras está en rojo', async ($, on) => {
  fondos(on)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.session.measure(medir(210_000))
  expect(await mascota(ui)).toContain('>!<')
  await $.session.measure(medir(120_000))
  expect(await mascota(ui)).not.toContain('>!<')
  await ui.unmount()
  for (const mood of ['pensando', 'escribiendo', 'permiso', 'terminado', 'inactivo'] as const) {
    expect(mascotSvg(mood, true)).not.toMatch(/<script|\son[a-z]+=/i)
    expect(mascotSvg(mood, true)).toContain('>!<')
    expect(mascotSvg(mood)).not.toContain('>!<')
  }
})

test('si guardar la medición falla, el hook lo anota y pasa la cadena', async ($, on) => {
  const f = fondos(on)
  let romper = false
  on('state.set', async (_$, e, next) => {
    if (romper) return { deny: 'boom' }
    return next(e)
  })
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  romper = true
  const r = await $.session.measure(medir(210_000))
  expect(r).toEqual({ changed: ['context'] })
  // La línea solo existe si el hook llegó a su catch y siguió hasta `next`.
  expect(f.logs.some(l => l.includes('no se pudo guardar la medición: ') && l.includes('boom'))).toBe(true)
})
