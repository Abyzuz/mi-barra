// Lógica pura de los cuatro indicadores: de los datos de la sesión a lo que
// la barra dibuja. Sin `$`: se prueba con números.
import type { Limit, Usage } from '../types'

export type Tone = 'ok' | 'warn' | 'bad' | 'off'

/** Un indicador listo para dibujar. `fill` null = no disponible. */
export type Gauge = {
  key: 'context' | 'cache' | 'fiveHour' | 'week'
  label: string
  /** Fracción del anillo, 0 a 1; null cuando el dato no está disponible. */
  fill: number | null
  /** El número grande: "42%", "~48 min" o "no disponible". */
  value: string
  /** Lo que va tras el valor: "último uso hace 12 min", "↻ 2 h" (vacío si nada). */
  hint: string
  tone: Tone
}

export const UNAVAILABLE = 'no disponible'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "45 s", "12 min", "2 h 5 min", "3 d 4 h". */
export function formatSpan(ms: number): string {
  const span = Math.max(0, ms)
  if (span < MINUTE) return `${Math.floor(span / 1000)} s`
  if (span < HOUR) return `${Math.floor(span / MINUTE)} min`
  if (span < DAY) {
    const h = Math.floor(span / HOUR)
    const m = Math.floor((span % HOUR) / MINUTE)
    return m ? `${h} h ${m} min` : `${h} h`
  }
  const d = Math.floor(span / DAY)
  const h = Math.floor((span % DAY) / HOUR)
  return h ? `${d} d ${h} h` : `${d} d`
}

/** Tono de un porcentaje usado: verde, ámbar desde 60 %, rojo desde 85 %. */
export function toneOfUsed(percent: number): Tone {
  if (percent >= 85) return 'bad'
  if (percent >= 60) return 'warn'
  return 'ok'
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function contextGauge(percent: number | null): Gauge {
  if (percent === null) {
    return { key: 'context', label: 'Contexto', fill: null, value: UNAVAILABLE, hint: '', tone: 'off' }
  }
  return {
    key: 'context',
    label: 'Contexto',
    fill: clamp01(percent / 100),
    value: `${Math.round(percent)}%`,
    hint: '',
    tone: toneOfUsed(percent),
  }
}

/**
 * El caché: lo real es "último uso hace X". El restante es una estimación
 * con un TTL supuesto (la API no informa la duración), y se marca con "~".
 */
export function cacheGauge(cacheAt: number | null, now: number, ttlMs: number): Gauge {
  if (cacheAt === null) {
    return { key: 'cache', label: 'Caché', fill: null, value: UNAVAILABLE, hint: '', tone: 'off' }
  }
  const elapsed = Math.max(0, now - cacheAt)
  const remaining = ttlMs - elapsed
  const hint = `último uso hace ${formatSpan(elapsed)}`
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
  const label = key === 'fiveHour' ? 'Límite 5 h' : 'Semanal'
  if (limit === null) {
    return { key, label, fill: null, value: UNAVAILABLE, hint: '', tone: 'off' }
  }
  const hint = limit.resetsAt === null ? '' : `↻ ${formatSpan(limit.resetsAt - now)}`
  return {
    key,
    label,
    fill: clamp01(limit.percent / 100),
    value: `${Math.round(limit.percent)}%`,
    hint,
    tone: toneOfUsed(limit.percent),
  }
}

export function gauges(usage: Usage, cacheAt: number | null, now: number, ttlMs: number): Gauge[] {
  return [
    contextGauge(usage.context),
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

export const EMPTY_USAGE: Usage = { context: null, fiveHour: null, week: null }
