import { expect, test } from 'claude-code/testing'

import { parseEtapa, textoT5 } from '../src/etapa.ts'
import { fondos } from './fondos.ts'

const RUTA = 'C:/proyectos/demo/.claude/etapa.json'
const ARCH =
  '{ "v": 1, "proyecto": "mi-barra-flujo", "etapa": "plan", "desde": "2026-10-25T23:00:00Z", "inicio": "2026-10-25T21:39:52Z", "historial": [{ "etapa": "spec", "desde": "2026-10-25T21:39:52Z" }, { "etapa": "plan", "desde": "2026-10-25T23:00:00Z" }] }'
const EJEC = ARCH.replace('"etapa": "plan", "desde"', '"etapa": "ejecucion", "desde"')
const START = { cwd: '.', surface: 'desktop', isInteractive: true } as const
const T5_PLAN = textoT5(parseEtapa(ARCH).file!, 'demo')
const T5_EJEC = textoT5(parseEtapa(EJEC).file!, 'demo')
const cuenta = (envio: { context: readonly string[] | undefined }, t5: string) => (envio.context ?? []).filter(c => c === t5).length

test('con archivo, el primer prompt lleva T5 como último bloque de context', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  await $.prompt.submit({ text: 'hola', context: ['bloque previo'] } as never)
  expect(f.envios).toHaveLength(1)
  expect(f.envios[0]!.text).toBe('hola')
  expect(f.envios[0]!.context).toEqual(['bloque previo', T5_PLAN])
})

test('solo una vez por sesión', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  await $.prompt.submit({ text: 'hola' })
  await $.prompt.submit({ text: 'otra' })
  expect(cuenta(f.envios[0]!, T5_PLAN)).toBe(1)
  expect(f.envios[1]!.context ?? []).not.toContain(T5_PLAN)
  expect(f.envios[1]!.context ?? []).toEqual([])
})

test('dos prompts a la vez no llevan T5 dos veces', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  await Promise.all([$.prompt.submit({ text: 'a' }), $.prompt.submit({ text: 'b' })])
  expect(f.envios.reduce((n, e) => n + cuenta(e, T5_PLAN), 0)).toBe(1)
})

test('sin archivo, no toca nada', async ($, on) => {
  const escrituras: unknown[] = []
  on('state.set', async (_$, e, next) => {
    if (e.key === 't5') escrituras.push(e.value)
    return next(e)
  })
  const f = fondos(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'hola' })
  await $.prompt.submit({ text: 'otra', context: ['x'] } as never)
  expect(f.envios[0]!.context ?? []).toEqual([])
  expect(f.envios[1]!.context).toEqual(['x'])
  expect(escrituras).toEqual([{ texto: '', adjuntado: false }]) // congelado vacío, y nunca "adjuntado"
})

test('en una raíz prohibida (HOME) no viaja nada', async ($, on) => {
  const f = fondos(on, { root: 'C:/Users/prueba', repo: null, archivos: { 'C:/Users/prueba/.claude/etapa.json': ARCH } })
  await $.session.start(START)
  await $.prompt.submit({ text: 'hola' })
  expect(f.envios[0]!.context ?? []).toEqual([])
})

test('ni isMeta ni comandos lo reciben; el primero de verdad sí', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  await $.prompt.submit({ text: 'x', isMeta: true } as never)
  await $.prompt.submit({ text: '/etapa', command: { name: 'etapa', args: '' } } as never)
  expect(f.envios).toHaveLength(2)
  expect(f.envios[0]!.context ?? []).toEqual([])
  expect(f.envios[1]!.context ?? []).toEqual([])
  await $.prompt.submit({ text: 'hola' })
  expect(f.envios[2]!.context).toEqual([T5_PLAN])
})

test('fija aunque el archivo cambie', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  f.archivos.set(RUTA, EJEC)
  await f.clock.advance(15_000)
  await $.prompt.submit({ text: 'hola' })
  expect(f.envios[0]!.context).toEqual([T5_PLAN])
  expect(f.envios[0]!.context![0]).not.toBe(T5_EJEC)
})

test('fija también tras $.command.run /etapa a otra etapa', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  await $.command.run({ command: 'etapa', args: 'ejecucion' })
  expect(JSON.parse(f.escritos.get(RUTA)!).etapa).toBe('ejecucion')
  await $.prompt.submit({ text: 'hola' })
  expect(f.envios[0]!.context).toEqual([T5_PLAN])
})

test('un reload no la mueve ni la repite', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  await $.prompt.submit({ text: 'hola' })
  f.archivos.set(RUTA, EJEC)
  await $.session.start(START)
  await $.prompt.submit({ text: 'otra' })
  expect(f.envios[1]!.context ?? []).toEqual([])
  const r = await $.command.run({ command: 'etapa', args: '' })
  expect(r.text).toContain(`Claude lee al iniciar cada sesión: «${T5_PLAN}».`)
})

test('un reload antes del primer prompt tampoco la mueve', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  f.archivos.set(RUTA, EJEC)
  await $.session.start(START)
  await $.prompt.submit({ text: 'hola' })
  expect(f.envios[0]!.context).toEqual([T5_PLAN])
})

test('si falla lo suyo, el prompt entra igual', async ($, on) => {
  on('state.set', async (_$, e, next) => (e.key === 't5' && (e.value as { adjuntado?: boolean } | null)?.adjuntado === true ? { deny: 'disco lleno' } : next(e)))
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  const r = await $.prompt.submit({ text: 'hola' })
  expect(r.text).toBe('hola')
  expect(f.envios[0]!.context).toEqual([T5_PLAN])
  // Sin poder marcarlo en el átomo, igual no se repite.
  await $.prompt.submit({ text: 'otra' })
  expect(f.envios[1]!.context ?? []).toEqual([])
  expect(f.logs.some(l => /T5 adjuntado, pero no pude marcarlo/.test(l))).toBe(true)
})

test('si el envío se descarta, el siguiente lleva T5', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  f.descartarEnvios = true
  await $.session.start(START)
  await $.prompt.submit({ text: 'primero' })
  f.descartarEnvios = false
  await $.prompt.submit({ text: 'segundo' })
  expect(f.envios.at(-1)!.context).toEqual([T5_PLAN])
})

test('/etapa muestra el mismo texto que viaja, carácter por carácter', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  f.archivos.set(RUTA, EJEC)
  await f.clock.advance(15_000) // la banda ya dice Ejecución
  const r = await $.command.run({ command: 'etapa', args: '' })
  await $.prompt.submit({ text: 'hola' })
  const viajo = f.envios[0]!.context![0]!
  expect(r.text).toContain(`Claude lee al iniciar cada sesión: «${viajo}».`)
  // El archivo cambió: lo que Claude recibirá la próxima vez va aparte.
  expect(r.text).toContain(`En la próxima sesión Claude recibirá: «${T5_EJEC}».`)
})

test('/etapa sin diferencia no añade la línea de la próxima sesión', async ($, on) => {
  fondos(on, { archivos: { [RUTA]: ARCH } })
  await $.session.start(START)
  const r = await $.command.run({ command: 'etapa', args: '' })
  expect(r.text).not.toContain('En la próxima sesión')
})

test('/etapa con la sesión nacida sin etapa: dice qué recibirá la próxima', async ($, on) => {
  const f = fondos(on)
  await $.session.start(START)
  await $.command.run({ command: 'etapa', args: 'spec demo' })
  const r = await $.command.run({ command: 'etapa', args: '' })
  expect(r.text).toContain('En esta sesión Claude no recibió la etapa.')
  expect(r.text).toMatch(/En la próxima sesión Claude recibirá: «Etapa del proyecto \(mi-barra/)
  await $.prompt.submit({ text: 'hola' })
  expect(f.envios[0]!.context ?? []).toEqual([])
})

test('si la lectura falla (no es ENOENT), no se congela nada y el prompt sale sin T5', async ($, on) => {
  const escrituras: unknown[] = []
  on('state.set', async (_$, e, next) => {
    if (e.key === 't5') escrituras.push(e.value)
    return next(e)
  })
  const f = fondos(on, { archivos: { [RUTA]: ARCH }, leerFalla: { ruta: /etapa\.json$/, motivo: 'EACCES: sin permiso' } })
  await $.session.start(START)
  await f.clock.advance(15_000)
  await $.prompt.submit({ text: 'hola' })
  expect(escrituras).toEqual([]) // quedaría "sin etapa" toda la sesión: se reintenta en el próximo tick
  expect(f.envios[0]!.context ?? []).toEqual([])
})

test('la sesión que nace con su primer prompt: espera la lectura en curso y lo lleva (lectura de 300 ms)', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH }, leerTarda: { ruta: /etapa\.json$/, ms: 300 } })
  await $.session.start(START)
  const envio = $.prompt.submit({ text: 'hola' })
  await f.clock.advance(300)
  await envio
  expect(f.envios[0]!.context).toEqual([T5_PLAN])
  await $.prompt.submit({ text: 'otra' })
  expect(f.envios[1]!.context ?? []).toEqual([])
})

test('lectura colgada: el prompt sale a los 2 s sin T5 y el siguiente lo lleva cuando la lectura llega', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH }, leerTarda: { ruta: /etapa\.json$/, ms: 10_000 } })
  await $.session.start(START)
  let salio = false
  const envio = $.prompt.submit({ text: 'hola' }).then(r => {
    salio = true
    return r
  })
  await f.clock.advance(1_900)
  expect(salio).toBe(false) // aún espera
  await f.clock.advance(100)
  await envio
  expect(f.envios[0]!.context ?? []).toEqual([])
  await f.clock.advance(8_000) // la lectura llega
  await $.prompt.submit({ text: 'otra' })
  expect(f.envios[1]!.context).toEqual([T5_PLAN])
})

test('un resultado con la clave drop presente pero indefinida cuenta como enviado', async ($, on) => {
  const f = fondos(on, { archivos: { [RUTA]: ARCH } })
  f.dropIndefinido = true
  await $.session.start(START)
  await $.prompt.submit({ text: 'hola' })
  await $.prompt.submit({ text: 'otra' })
  expect(f.envios[0]!.context).toEqual([T5_PLAN])
  expect(f.envios[1]!.context ?? []).toEqual([])
})
