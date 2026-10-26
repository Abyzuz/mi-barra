// Fondos compartidos de los tests del kit: un `on(...)` por operación que el mod
// llama, para que ninguna falle con "no implementation for X" (y un `try/catch`
// del mod la trague: el test pasaría por la razón equivocada).
//
// Reglas (P-M08):
// - `escritos` se indexa con rutas normalizadas a `/` (el motor entrega `\`).
// - `fs.write` actualiza también `archivos`, y `fs.read` lee `archivos` en vivo:
//   lo escrito se lee de vuelta, y un test puede cambiar `archivos` a mitad.
// - Un `on(...)` del test para un evento que el fondo ya cubre (`fs.read`,
//   `clock.now`, ...) no carga: el motor dice `on("...") registered twice`. Para
//   variarlo, usa las opciones (`leerNunca`, `leerFalla`, `escribirFalla`, `now`) y lo que el fondo
//   devuelve vivo (`archivos`, `lecturas`, `clock`); un evento que el fondo no
//   cubre (p. ej. `state.set`) sí admite un `on(...)` propio.
import { mock } from 'claude-code/testing'
import type { Register } from 'claude-code'

type On = Parameters<Register>[0]

export type Fondos = {
  escritos: Map<string, string>
  toasts: string[]
  rellenos: { text: string; mode: string }[]
  enviados: number
  /** Lo que llegó al final de la cadena de `prompt.submit` (tras los hooks del mod), en orden. */
  envios: { text: string; context: readonly string[] | undefined }[]
  /** Mientras sea true, el fondo de `prompt.submit` descarta el envío (`{ drop }`), como otro plugin que lo vetara. */
  descartarEnvios: boolean
  /** Con true, el fondo de `prompt.submit` contesta con la clave `drop: undefined` (un envío que entró, pero con la clave presente). */
  dropIndefinido: boolean
  copias: string[]
  logs: string[]
  comandos: string[]
  /** Rutas leídas con `fs.read`, normalizadas a `/`, en orden. */
  lecturas: string[]
  /** Los archivos fingidos, vivos: el test puede cambiar uno a mitad. */
  archivos: Map<string, string>
  clock: ReturnType<typeof mock.clock>
}

export type OpcionesFondos = {
  archivos?: Record<string, string>
  borrador?: string
  isFilled?: boolean
  /** `null` = sin repo; sin valor = un repo con `root`. */
  repo?: string | null
  root?: string
  home?: string
  /** Las lecturas de rutas que calzan nunca resuelven (para probar que no bloquean). */
  leerNunca?: RegExp
  /** Las lecturas de rutas que calzan fallan con este motivo (un error que no es ENOENT). */
  leerFalla?: { ruta: RegExp; motivo: string }
  /** Las lecturas de rutas que calzan resuelven pasados `ms` del reloj fingido (`f.clock.advance`). */
  leerTarda?: { ruta: RegExp; ms: number }
  /** `session.repo` y `session.root` fallan con este motivo. */
  rootFalla?: string
  /** Las escrituras fallan con este motivo (nada se guarda). */
  escribirFalla?: string
  /** Hora inicial del reloj fingido (ms de época). */
  now?: number
  /** Con esto, `session.usage` responde estos tokens. */
  usage?: { tokens?: number; window: number }
}

const norm = (p: string): string => p.replace(/\\/g, '/')

export function fondos(on: On, o: OpcionesFondos = {}): Fondos {
  const archivos = new Map<string, string>(Object.entries(o.archivos ?? {}).map(([k, v]) => [norm(k), v]))
  const f: Fondos = {
    escritos: new Map(),
    toasts: [],
    rellenos: [],
    enviados: 0,
    envios: [],
    descartarEnvios: false,
    dropIndefinido: false,
    copias: [],
    logs: [],
    comandos: [],
    lecturas: [],
    archivos,
    clock: mock.clock(on, o.now === undefined ? undefined : { now: o.now }),
  }
  const root = o.root ?? 'C:/proyectos/demo'

  mock.env(on, { USERPROFILE: o.home ?? 'C:/Users/prueba' })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('session.repo', async () => (o.rootFalla !== undefined ? { deny: o.rootFalla } : { value: o.repo === null ? null : { root: o.repo ?? root, remote: null, internal: false, name: null } }))
  on('session.root', async () => (o.rootFalla !== undefined ? { deny: o.rootFalla } : { value: root }))
  // Sin `usage`, la sesión no tiene medición todavía (sin `tokens`), como una recién abierta.
  const { tokens, window } = o.usage ?? { tokens: undefined, window: 1_000_000 }
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      context: { tokens, window, percent: tokens === undefined ? undefined : Math.round((tokens / window) * 100) },
      rateLimits: [],
    },
  }))
  on('fs.read', async (_$, e) => {
    const path = norm(e.path)
    f.lecturas.push(path)
    if (o.leerFalla?.ruta.test(path)) return { deny: o.leerFalla.motivo }
    if (o.leerNunca?.test(path)) return new Promise<never>(() => {})
    if (o.leerTarda?.ruta.test(path)) await f.clock.sleep(o.leerTarda.ms)
    const texto = archivos.get(path)
    return texto === undefined ? { deny: 'ENOENT: no existe' } : { value: texto }
  })
  on('fs.write', async (_$, e) => {
    if (o.escribirFalla !== undefined) return { deny: o.escribirFalla }
    const path = norm(e.path)
    f.escritos.set(path, e.text)
    archivos.set(path, e.text)
    return { value: undefined }
  })
  on('ui.toast', async (_$, e) => {
    f.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', async (_$, e) => {
    f.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', async (_$, e) => {
    f.copias.push(e.text)
    return { value: { isCopied: true } }
  })
  on('prompt.read', async () => {
    const text = o.borrador ?? ''
    return { value: { text, cursor: text.length } }
  })
  on('prompt.fill', async (_$, e) => {
    f.rellenos.push({ text: e.text, mode: e.mode })
    return o.isFilled === false ? { isFilled: false, refusal: 'no_composer' } : { isFilled: true }
  })
  on('prompt.submit', async (_$, e) => {
    f.enviados++
    f.envios.push({ text: e.text, context: e.context })
    // Fin de la cadena: nada más abajo contesta, así que el fondo devuelve el envío tal como le llegó.
    if (f.descartarEnvios) return { drop: 'descartado por el fondo' }
    return f.dropIndefinido ? { text: e.text, context: e.context, drop: undefined } : { text: e.text, context: e.context }
  })
  on('command.register', async (_$, e) => {
    f.comandos.push(e.name)
    return { value: { command: e.name } }
  })
  return f
}
