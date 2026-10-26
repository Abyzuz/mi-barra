// Lógica pura de los cuatro indicadores: de los datos de la sesión a lo que
// la barra dibuja. Sin `$`: se prueba con números.
import type { Limit, Usage } from '../types'

/** Umbrales del contexto en tokens. Se define aquí y contexto.ts lo reexporta (P-M01: sin ciclo). */
export type Umbrales = { ambar: number; rojo: number }

export type Tone = 'ok' | 'warn' | 'bad' | 'off'

/** Un indicador listo para dibujar. `fill` null = no disponible. */
export type Gauge = {
  key: 'etapa' | 'context' | 'cache' | 'fiveHour' | 'week' | 'sync'
  label: string
  /** Fracción del anillo, 0 a 1; null cuando el dato no está disponible. */
  fill: number | null
  /** El número grande: "210k", "42%", "~48 min" o "no disponible". */
  value: string
  /** Lo que va tras el valor: "último uso hace 12 min", "↻ 2 h" (vacío si nada). */
  hint: string
  tone: Tone
}

export const UNAVAILABLE = 'no disponible'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compacto para que la barra no se parta: "45s", "12m", "2h5m", "3d4h". */
export function formatSpan(ms: number): string {
  const span = Math.max(0, ms)
  if (span < MINUTE) return `${Math.floor(span / 1000)}s`
  if (span < HOUR) return `${Math.floor(span / MINUTE)}m`
  if (span < DAY) {
    const h = Math.floor(span / HOUR)
    const m = Math.floor((span % HOUR) / MINUTE)
    return m ? `${h}h${m}m` : `${h}h`
  }
  const d = Math.floor(span / DAY)
  const h = Math.floor((span % DAY) / HOUR)
  return h ? `${d}d${h}h` : `${d}d`
}

/** Tono de un porcentaje usado: verde, ámbar desde 60 %, rojo desde 85 %. */
export function toneOfUsed(percent: number): Tone {
  if (percent >= 85) return 'bad'
  if (percent >= 60) return 'warn'
  return 'ok'
}

const PESO: Record<Tone, number> = { off: 0, ok: 1, warn: 2, bad: 3 }

/**
 * Tono del anillo de contexto: el peor entre la regla absoluta (ámbar y rojo en
 * tokens) y la porcentual de la ventana (ámbar desde 60 %, rojo desde 85 %), para
 * que una ventana chica no se quede en ámbar al 99 %. `'off'` si falta algún dato.
 * Vive aquí para que `contextGauge` no dependa de contexto.ts, que lo reexporta.
 */
export function tonoContexto(tokens: number | null, window: number | null, u: Umbrales): Tone {
  if (tokens === null || window === null || window <= 0) return 'off'
  const absoluto: Tone = tokens >= u.rojo ? 'bad' : tokens >= u.ambar ? 'warn' : 'ok'
  const porcentual = toneOfUsed((tokens / window) * 100)
  return PESO[porcentual] > PESO[absoluto] ? porcentual : absoluto
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** "850", "350k", "1M", "1.2M". Redondea a miles primero: 999 500 es "1M", no "1000k". */
export function formatTokens(n: number): string {
  if (n < 1000) return `${Math.round(n)}`
  const miles = Math.round(n / 1000)
  if (miles < 1000) return `${miles}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** El anillo de contexto: en tokens, con el tono del peor entre umbrales y porcentaje. */
export function contextGauge(tokens: number | null, window: number | null, u: Umbrales): Gauge {
  if (tokens === null || window === null || window <= 0) {
    return { key: 'context', label: 'Contexto', fill: null, value: UNAVAILABLE, hint: '', tone: 'off' }
  }
  return {
    key: 'context',
    label: 'Contexto',
    fill: clamp01(tokens / window),
    value: formatTokens(tokens),
    hint: `${Math.round((tokens / window) * 100)} % de ${formatTokens(window)}`,
    tone: tonoContexto(tokens, window, u),
  }
}

/**
 * El caché: lo real es "hace X" (el último uso). El restante es una estimación
 * con un TTL supuesto (la API no informa la duración), y se marca con "~".
 */
export function cacheGauge(cacheAt: number | null, now: number, ttlMs: number): Gauge {
  if (cacheAt === null) {
    return { key: 'cache', label: 'Caché', fill: null, value: UNAVAILABLE, hint: '', tone: 'off' }
  }
  const elapsed = Math.max(0, now - cacheAt)
  const remaining = ttlMs - elapsed
  const hint = `hace ${formatSpan(elapsed)}`
  if (remaining <= 0) {
    return { key: 'cache', label: 'Caché', fill: 0, value: '~vencido', hint, tone: 'bad' }
  }
  const fill = clamp01(remaining / ttlMs)
  return {
    key: 'cache',
    label: 'Caché',
    fill,
    value: `~${formatSpan(remaining)}`,
    hint,
    tone: fill > 0.25 ? 'ok' : 'warn',
  }
}

export function limitGauge(key: 'fiveHour' | 'week', limit: Limit | null, now: number): Gauge {
  const label = key === 'fiveHour' ? 'Límite 5h' : 'Semanal'
  if (limit === null) {
    return { key, label, fill: null, value: UNAVAILABLE, hint: '', tone: 'off' }
  }
  const hint = limit.resetsAt === null ? '' : `↻${formatSpan(limit.resetsAt - now)}`
  return {
    key,
    label,
    fill: clamp01(limit.percent / 100),
    value: `${Math.round(limit.percent)}%`,
    hint,
    tone: toneOfUsed(limit.percent),
  }
}

/** Palabra corta de cada etapa para el centro del anillo (la clave es `ETIQUETA` de etapa.ts; un test las ata). */
const ETAPA_CORTA: Record<string, string> = {
  Spec: 'Spec',
  Plan: 'Plan',
  Ejecución: 'Ejec.',
  'Revisión final': 'Final',
  'Uso real': 'Uso',
}

/**
 * Lo que va dentro del anillo en la banda de escritorio: corto, sin pista y de cuatro
 * caracteres o menos donde se puede. Sin dato, un guion (el `alt` conserva la palabra completa).
 */
export function valorCorto(g: Gauge): string {
  switch (g.key) {
    case 'etapa':
      return ETAPA_CORTA[g.value] ?? '—'
    case 'sync': {
      const pendientes = /^⚠ (\d+) por decidir$/.exec(g.value)
      if (pendientes) return `⚠${pendientes[1]}`
      const glifo = /^[✓⚠↑]/.exec(g.value)
      return glifo ? glifo[0] : '—'
    }
    case 'cache':
      if (g.value === UNAVAILABLE) return '—'
      return g.value === '~vencido' ? 'venc.' : g.value.replace(/^~/, '')
    default:
      return g.value === UNAVAILABLE ? '—' : g.value
  }
}

/** La etiqueta bajo el anillo en la banda de escritorio (la de Etapa la da `rotuloEtapa`). */
export function rotuloCorto(g: Gauge): string {
  return g.key === 'fiveHour' ? '5h' : g.label
}

export function gauges(usage: Usage, cacheAt: number | null, now: number, ttlMs: number, u: Umbrales): Gauge[] {
  return [
    contextGauge(usage.contextTokens, usage.contextWindow, u),
    cacheGauge(cacheAt, now, ttlMs),
    limitGauge('fiveHour', usage.fiveHour, now),
    limitGauge('week', usage.week, now),
  ]
}

/** Lo que trae la API (`rateLimits`) a una ventana, o null si no hay lectura. */
export function pickLimit(
  limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
  kind: 'five_hour' | 'seven_day',
): Limit | null {
  const found = limits.find(l => l.kind === kind)
  if (!found) return null
  const parsed = found.resetsAt === undefined ? NaN : Date.parse(found.resetsAt)
  return { percent: found.percentUsed, resetsAt: Number.isNaN(parsed) ? null : parsed }
}

export const EMPTY_USAGE: Usage = { context: null, contextTokens: null, contextWindow: null, fiveHour: null, week: null }
