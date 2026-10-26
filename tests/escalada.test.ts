import { expect, test } from 'claude-code/testing'

import { etapaEsperada, filaEscalada, skillDeLlamada, textoT7, toastEscalada, varianteEscalada } from '../src/escalada.ts'
import { fondos } from './fondos.ts'

// ---- Lógica pura ----

test('mapa skill → etapa con y sin prefijo', () => {
  expect(etapaEsperada('superpowers:brainstorming')).toBe('spec')
  expect(etapaEsperada('writing-plans')).toBe('plan')
  expect(etapaEsperada('superpowers:subagent-driven-development')).toBe('ejecucion')
  expect(etapaEsperada('Superpowers:Executing-Plans')).toBe('ejecucion')
  expect(etapaEsperada('commit')).toBe(null)
  expect(etapaEsperada('otro:brainstorming-extra')).toBe(null)
  expect(etapaEsperada('toString')).toBe(null)
  expect(etapaEsperada('a:b:brainstorming')).toBe(null)
})

test('variantes', () => {
  expect(varianteEscalada(null, 'spec')).toBe('sin-etapa')
  expect(varianteEscalada('plan', 'plan')).toBe(null)
  expect(varianteEscalada('spec', 'plan')).toBe('siguiente')
  expect(varianteEscalada('plan', 'ejecucion')).toBe('siguiente')
  expect(varianteEscalada('spec', 'ejecucion')).toBe('otra') // salto
  expect(varianteEscalada('ejecucion', 'spec')).toBe('otra') // anterior
})

test('fila y botones; nunca un botón que retroceda', () => {
  const sin = filaEscalada('sin-etapa', 'spec', null, 'demo', false)
  expect(sin.texto).toBe('Arrancó un brainstorm y demo no tiene etapa: si es un proyecto de más de una tarea, va en su propia sesión.')
  expect(sin.botones.map(b => b.key)).toEqual(['esc-marcar', 'esc-pedir', 'esc-ignorar'])
  expect(sin.botones[0].label).toBe('Marcar Spec en demo')
  expect(filaEscalada('sin-etapa', 'spec', null, 'otro', true).botones.map(b => b.key)).toEqual(['esc-pedir', 'esc-ignorar'])
  const sig = filaEscalada('siguiente', 'plan', 'spec', 'demo', false)
  expect([sig.texto, sig.botones.map(b => b.label)]).toEqual(['Arrancó un plan en la sesión de Spec: una sesión por etapa.', ['Pasar a Plan', 'Ignorar']])
  expect(filaEscalada('otra', 'spec', 'ejecucion', 'demo', false).botones.map(b => b.key)).toEqual(['esc-pedir', 'esc-ignorar'])
  expect(filaEscalada('otra', 'ejecucion', 'spec', 'demo', false).texto).toBe(
    'Arrancó una ejecución en la etapa Spec: si es parte de esta etapa, ignóralo; si es un proyecto nuevo, va en otra sesión.',
  )
  expect([toastEscalada('spec'), toastEscalada('plan'), toastEscalada('ejecucion')]).toEqual([false, true, true])
})

test('T7 y los nombres que llegan de los dos disparadores', () => {
  expect(textoT7('demo')).toBe(
    'Esto ya es un proyecto de más de una tarea. No sigas construyendo aquí: guarda lo decidido hasta ahora en un archivo de la carpeta del proyecto (pregúntame cuál si no es demo) y propón una sesión nueva allí, con tarjeta en la app, que parta de ese archivo. En esa sesión marcaré la etapa.',
  )
  expect(skillDeLlamada({ tool: 'Skill', skill: 'superpowers:brainstorming' })).toBe('superpowers:brainstorming')
  expect(skillDeLlamada({ tool: 'Skill', skill: '' })).toBe(null)
  expect(skillDeLlamada({ tool: 'Skill' })).toBe(null)
  expect(skillDeLlamada({ tool: 'Skill', skill: 7 })).toBe(null)
  expect(skillDeLlamada({ tool: 'Bash', skill: 'a:b' })).toBe(null)
})

// ---- Con el kit ----

const RUTA = 'C:/p/demo/.claude/etapa.json'
const START = { cwd: '.', surface: 'desktop', isInteractive: true } as const
const archivo = (etapa: string) =>
  JSON.stringify({ v: 1, proyecto: 'demo', etapa, desde: '2026-10-25T21:00:00Z', inicio: '2026-10-25T21:00:00Z', historial: [{ etapa, desde: '2026-10-25T21:00:00Z' }] }, null, 2) + '\n'
const base = (archivos: Record<string, string> = {}, mas: Record<string, unknown> = {}) => ({ root: 'C:/p/demo', now: Date.parse('2026-10-26T09:00:00Z'), archivos, ...mas })
const escrito = (f: { escritos: Map<string, string> }) => JSON.parse(f.escritos.get(RUTA)!)

const banda = (maxRows = 6) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 140, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  }) as const

const medir = (tokens: number | undefined, window = 1_000_000) => ({
  context: tokens === undefined ? { window } : { tokens, window, percent: Math.round((tokens / window) * 100) },
  rateLimits: [],
  changed: ['context'],
})

type Cuerpo = Parameters<typeof test>[1]
type Dollar = Parameters<Extract<Cuerpo, (...a: never[]) => unknown>>[0]
type On = Parameters<Extract<Cuerpo, (...a: never[]) => unknown>>[1]

/** Lo que el motor haría con la llamada y el comando si el mod no los tocara. */
function motor(on: On): { llamadas: unknown[] } {
  const llamadas: unknown[] = []
  on('tool.call', async (_$, e) => {
    llamadas.push(e)
    return { result: {} }
  })
  on('command.run', async (_$, e) => ({ text: 'motor:' + e.command }))
  return { llamadas }
}

const SKILL = 'superpowers:brainstorming'
const textos = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => String((t as { text?: string }).text))
const botones = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Button' })).map(b => String((b as { text?: string }).text))

// Los dos disparadores; cada caso se escribe con los dos.
const DISPARADORES: [string, ($: Dollar, skill: string) => Promise<unknown>][] = [
  ['tool.call de Skill', ($, skill) => $.tool.call({ tool: 'Skill', skill } as never)],
  ['command.run tecleado', ($, skill) => $.command.run({ command: skill, args: '' })],
]

for (const [nombre, lanzar] of DISPARADORES) {
  const esLlamada = nombre.startsWith('tool.call')

  test(`${nombre}: la llamada pasa intacta`, async ($, on) => {
    const m = motor(on)
    const f = fondos(on, base({ [RUTA]: archivo('spec') }))
    await $.session.start(START)
    const r = (await lanzar($, 'superpowers:writing-plans')) as { result?: unknown; text?: string }
    if (esLlamada) {
      expect(r).toEqual({ result: {} })
      expect(m.llamadas.at(-1)).toMatchObject({ tool: 'Skill', skill: 'superpowers:writing-plans' })
      expect(Object.keys(m.llamadas.at(-1) as object).sort()).toEqual(['skill', 'tool', 'tool_use_id'])
    } else {
      expect(r.text).toBe('motor:superpowers:writing-plans')
    }
    expect(f.enviados).toBe(0)
  })

  test(`${nombre}: pasa intacta sin etapa y con un fs.read que lanza`, async ($, on) => {
    const m = motor(on)
    const f = fondos(on, base({}, { leerFalla: { ruta: /etapa\.json/, motivo: 'EPERM: boom' } }))
    await $.session.start(START)
    const r = (await lanzar($, SKILL)) as { result?: unknown; text?: string }
    if (esLlamada) {
      expect(r).toEqual({ result: {} })
      expect(m.llamadas.length).toBe(1)
    } else {
      expect(r.text).toBe('motor:' + SKILL)
    }
    expect(f.enviados).toBe(0)
  })

  test(`${nombre}: sin etapa, fila con Marcar, Pedir e Ignorar; Marcar escribe sin texto en el prompt`, async ($, on) => {
    motor(on)
    const f = fondos(on, base())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    expect(await ui.find({ type: 'Button', key: 'esc-marcar' })).toBeUndefined()
    await lanzar($, SKILL)
    expect(await ui.find({ type: 'Text', text: 'Arrancó un brainstorm y demo no tiene etapa: si es un proyecto de más de una tarea, va en su propia sesión.' })).toBeDefined()
    expect(await botones(ui)).toEqual(['Marcar Spec en demo', 'Pedir sesión nueva', 'Ignorar'])
    expect(await ui.find({ type: 'Button', key: 'esc-pedir' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'esc-ignorar' })).toBeDefined()
    await ui.press({ key: 'esc-marcar' })
    expect(escrito(f).etapa).toBe('spec')
    expect(f.rellenos.length).toBe(0)
    expect(await ui.find({ type: 'Button', key: 'esc-marcar' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
    expect(f.toasts).toEqual([])
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: siguiente, Pasar a deja T3`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({ [RUTA]: archivo('spec') }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, 'superpowers:writing-plans')
    expect(f.toasts).toEqual(['⚠ Arrancó un plan en la sesión de Spec: una sesión por etapa.'])
    expect(await botones(ui)).toEqual(['Pasar a Plan', 'Ignorar'])
    await ui.press({ key: 'esc-pasar' })
    expect(escrito(f).etapa).toBe('plan')
    expect(f.rellenos[0]!.text.startsWith('Cierra la etapa Spec')).toBe(true)
    expect(await ui.find({ type: 'Button', key: 'esc-pasar' })).toBeUndefined()
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: anterior, solo Pedir sesión nueva e Ignorar; nada escribe`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({ [RUTA]: archivo('ejecucion') }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, SKILL)
    expect(await ui.find({ type: 'Button', key: 'esc-marcar' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'esc-pasar' })).toBeUndefined()
    expect(await botones(ui)).toEqual(['Pedir sesión nueva', 'Ignorar'])
    expect(f.toasts).toEqual([]) // un brainstorm: la fila basta
    await ui.press({ key: 'esc-pedir' })
    expect(f.rellenos[0]!.text).toBe(textoT7('demo'))
    expect(f.escritos.size).toBe(0)
    expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: un salto (spec a ejecución) tampoco escribe`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({ [RUTA]: archivo('spec') }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, 'superpowers:subagent-driven-development')
    expect(await botones(ui)).toEqual(['Pedir sesión nueva', 'Ignorar'])
    expect(f.toasts[0]).toBe('⚠ Arrancó una ejecución en la etapa Spec: si es parte de esta etapa, ignóralo; si es un proyecto nuevo, va en otra sesión.')
    expect(f.escritos.size).toBe(0)
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: si guardar el aviso falla, el hook lo anota en el debug log`, async ($, on) => {
    const m = motor(on)
    // El fallo se inyecta donde el hook sí llama (P-F05): el kit deja negar `state.set`.
    on('state.set', async (_$, e, next) => (e.key === 'escalada' && e.value !== null ? { deny: 'disco lleno' } : next(e)))
    const f = fondos(on, base({ [RUTA]: archivo('spec') }))
    await $.session.start(START)
    const r = (await lanzar($, 'superpowers:writing-plans')) as { result?: unknown; text?: string }
    if (esLlamada) {
      expect(r).toEqual({ result: {} })
      expect(m.llamadas.length).toBe(1)
    } else {
      expect(r.text).toBe('motor:superpowers:writing-plans')
    }
    expect(f.logs.some(l => l.includes('no pude avisar de la escalada') && l.includes('disco lleno'))).toBe(true)
    expect(f.enviados).toBe(0)
  })

  test(`${nombre}: Ignorar quita la fila`, async ($, on) => {
    motor(on)
    const f = fondos(on, base())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, SKILL)
    await ui.press({ key: 'esc-ignorar' })
    expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
    expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
    expect(f.escritos.size).toBe(0)
    expect(f.rellenos.length).toBe(0)
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: la fila se va sola si la etapa pasa a coincidir, y no vuelve al cambiar de nuevo`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({ [RUTA]: archivo('spec') }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, 'superpowers:writing-plans')
    expect(await ui.find({ type: 'Button', key: 'esc-pasar' })).toBeDefined()
    f.archivos.set(RUTA, archivo('plan'))
    await f.clock.advance(15_000)
    await f.clock.advance(15_000)
    expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
    f.archivos.set(RUTA, archivo('spec'))
    await f.clock.advance(15_000)
    await f.clock.advance(15_000)
    expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: la fila de escalada va encima de la de contexto`, async ($, on) => {
    motor(on)
    const f = fondos(on, base())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await $.session.measure(medir(210_000))
    await lanzar($, SKILL)
    const t = await textos(ui)
    const esc = t.findIndex(x => x.startsWith('Arrancó un brainstorm'))
    const ctx = t.findIndex(x => x.startsWith('Contexto 210k'))
    expect(esc).toBeGreaterThanOrEqual(0)
    expect(ctx).toBeGreaterThan(esc)
    expect(f.enviados).toBe(0)
    await ui.unmount()

    const term = await $.ui.mount({ plugin: 'mi-barra', surface: 'terminal', ...banda(6) })
    const l = await textos(term)
    expect(l.length).toBe(3)
    expect(l[0]!.startsWith('⚠ Arrancó un brainstorm')).toBe(true)
    expect(l[1]!.startsWith('⚠ Contexto 210k')).toBe(true)
    expect(l[2]).toMatch(/Contexto █/)
    expect(await term.findAll({ type: 'Button' })).toEqual([])
    await term.unmount()
  })

  test(`${nombre}: en el HOME no se ofrece Marcar`, async ($, on) => {
    motor(on)
    const f = fondos(on, { repo: null, root: 'C:/Users/prueba', home: 'C:/Users/prueba', now: 1 })
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, SKILL)
    expect(await ui.find({ type: 'Text', text: /Arrancó un brainstorm y prueba no tiene etapa/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'esc-marcar' })).toBeUndefined()
    expect(await botones(ui)).toEqual(['Pedir sesión nueva', 'Ignorar'])
    expect(f.escritos.size).toBe(0)
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: mientras la lectura de la etapa está pendiente no avisa (P-M21)`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({}, { leerNunca: /etapa\.json/ }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, SKILL)
    await lanzar($, 'superpowers:writing-plans')
    expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
    expect(f.toasts).toEqual([])
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: si Marcar no puede escribir, avisa y deja la fila`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({}, { escribirFalla: 'EACCES' }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, SKILL)
    await ui.press({ key: 'esc-marcar' })
    expect(f.toasts.length).toBe(1)
    expect(f.toasts[0]).toContain('No pude escribir')
    expect(await ui.find({ type: 'Button', key: 'esc-marcar' })).toBeDefined()
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: Pasar a no retrocede si el archivo cambió entre el dibujo y el clic`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({ [RUTA]: archivo('spec') }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, 'superpowers:writing-plans')
    expect(await ui.find({ type: 'Button', key: 'esc-pasar' })).toBeDefined()
    // Otra sesión avanzó la etapa: la banda aún dice «Pasar a Plan» (sin tick).
    f.archivos.set(RUTA, archivo('ejecucion'))
    await ui.press({ key: 'esc-pasar' })
    expect(f.escritos.size).toBe(0)
    expect(f.rellenos.length).toBe(0)
    expect(JSON.parse(f.archivos.get(RUTA)!).etapa).toBe('ejecucion')
    expect(f.toasts.at(-1)).toContain('ya es Ejecución')
    expect(f.toasts.at(-1)).toContain('volver atrás')
    expect(await ui.find({ type: 'Button', key: 'esc-pasar' })).toBeDefined() // la fila queda hasta el próximo tick
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: Marcar no reinicia un proyecto en uso real que apareció después del dibujo`, async ($, on) => {
    motor(on)
    const f = fondos(on, base())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, SKILL)
    expect(await ui.find({ type: 'Button', key: 'esc-marcar' })).toBeDefined()
    const enUso = archivo('uso')
    f.archivos.set(RUTA, enUso)
    await ui.press({ key: 'esc-marcar' })
    expect(f.escritos.size).toBe(0)
    expect(f.archivos.get(RUTA)).toBe(enUso)
    expect(f.toasts.at(-1)).toContain('volver atrás')
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: Pasar a con el archivo ya en la etapa esperada no escribe y cierra la fila`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({ [RUTA]: archivo('spec') }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, 'superpowers:writing-plans')
    f.archivos.set(RUTA, archivo('plan'))
    await ui.press({ key: 'esc-pasar' })
    expect(f.escritos.size).toBe(0)
    expect(f.rellenos.length).toBe(0)
    expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })

  test(`${nombre}: si el cuadro no toma T7, plan B con Copiar`, async ($, on) => {
    motor(on)
    const f = fondos(on, base({ [RUTA]: archivo('ejecucion') }, { isFilled: false }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
    await lanzar($, SKILL)
    await ui.press({ key: 'esc-pedir' })
    expect(f.toasts).toContain('No pude escribir en el prompt: cópialo con el botón')
    expect(await ui.find({ type: 'Button', key: 'tanda-copiar' })).toBeDefined()
    expect(f.enviados).toBe(0)
    await ui.unmount()
  })
}

test('un subagente no dispara', async ($, on) => {
  const m = motor(on)
  const f = fondos(on, base({ [RUTA]: archivo('spec') }))
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  const r = await $.tool.call({ tool: 'Skill', skill: 'superpowers:writing-plans', agentId: 'a1' } as never)
  expect(r).toEqual({ result: {} })
  expect(m.llamadas.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
  expect(f.toasts).toEqual([])
  expect(f.enviados).toBe(0)
  await ui.unmount()
})

test('otra herramienta u otro comando no disparan', async ($, on) => {
  motor(on)
  const f = fondos(on, base())
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  await $.tool.call({ tool: 'Bash', command: 'echo', skill: SKILL } as never)
  // Lo que no es de la escalada llega al motor tal cual: el hook no responde ni cambia el comando.
  expect((await $.command.run({ command: 'compact', args: '' })).text).toBe('motor:compact')
  expect((await $.command.run({ command: 'superpowers:commit', args: '' })).text).toBe('motor:superpowers:commit')
  await $.command.run({ command: 'etapa', args: '' })
  await $.command.run({ command: 'tanda', args: '' })
  expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
  expect(f.toasts).toEqual([])
  expect(f.enviados).toBe(0)
  await ui.unmount()
})

test('/brainstorming sin prefijo y con otras mayúsculas también avisa, y el comando pasa intacto', async ($, on) => {
  motor(on)
  const f = fondos(on, base())
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'mi-barra', surface: 'desktop', ...banda() })
  expect(((await $.command.run({ command: 'brainstorming', args: '' })) as { text: string }).text).toBe('motor:brainstorming')
  expect(await ui.find({ type: 'Text', text: /Arrancó un brainstorm/ })).toBeDefined()
  await ui.press({ key: 'esc-ignorar' })
  expect(await ui.find({ type: 'Text', text: /Arrancó/ })).toBeUndefined()
  expect(((await $.command.run({ command: 'Superpowers:Brainstorming', args: '' })) as { text: string }).text).toBe('motor:Superpowers:Brainstorming')
  expect(await ui.find({ type: 'Text', text: /Arrancó un brainstorm/ })).toBeDefined()
  expect(f.enviados).toBe(0)
  await ui.unmount()
})

test('/etapa y /tanda siguen respondiendo con su propio texto', async ($, on) => {
  motor(on)
  fondos(on, base({ [RUTA]: archivo('spec') }))
  await $.session.start(START)
  expect((await $.command.run({ command: 'etapa', args: '' })).text).toContain('Etapa: Spec desde 2026-10-25')
  expect((await $.command.run({ command: 'tanda', args: '' })).text).toBe('Contexto no disponible todavía: espera la primera respuesta.')
})
