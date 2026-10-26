// El indicador de sincronización: de status.json (lo escribe el motor wsync
// del espacio de trabajo) a lo que la barra dibuja. Puro: sin `$`.
import type { SyncState, SyncStatus } from '../types'
import type { Gauge } from './gauges'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
/** Un "ok" más viejo que esto avisa: la subida automática dejó de correr. */
const STALE_MS = 24 * HOUR
/** Un "subiendo" más viejo que esto: la subida en segundo plano murió sin terminar. */
const RUNNING_MAX_MS = 5 * MINUTE
/** Largo máximo del aviso del motor dentro de la barra. */
const MESSAGE_MAX = 40

const STATES: readonly SyncState[] = ['ok', 'running', 'pending', 'conflict', 'secret', 'offline', 'error']

/** El texto de status.json, o null si no es un estado que el indicador entienda. */
export function parseStatus(text: string): SyncStatus | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { state, at, pending, message } = data as Record<string, unknown>
  if (!STATES.includes(state as SyncState) || typeof at !== 'number') return null
  return {
    state: state as SyncState,
    at,
    pending: typeof pending === 'number' ? pending : 0,
    message: typeof message === 'string' ? message : '',
  }
}

function short(message: string): string {
  return message.length <= MESSAGE_MAX ? message : `${message.slice(0, MESSAGE_MAX - 1)}…`
}

function sync(value: string, tone: Gauge['tone']): Gauge {
  // Anillo lleno del color del tono; "sin red" queda gris punteado.
  return { key: 'sync', label: 'Sync', fill: tone === 'off' ? null : 1, value, hint: '', tone }
}

function okGauge(status: SyncStatus, now: number): Gauge {
  const age = Math.max(0, now - status.at)
  if (age > STALE_MS) return sync(`⚠ hace ${Math.floor(age / HOUR)} h`, 'warn')
  if (age < HOUR) return sync(`✓ hace ${Math.floor(age / MINUTE)} min`, 'ok')
  return sync(`✓ hace ${Math.floor(age / HOUR)} h`, 'ok')
}

/** null = sin status.json (equipo sin espacio de trabajo): el indicador no aparece. */
export function syncGauge(status: SyncStatus | null, now: number): Gauge | null {
  if (status === null) return null
  switch (status.state) {
    case 'ok':
      return okGauge(status, now)
    case 'running':
      if (now - status.at > RUNNING_MAX_MS) return sync('⚠ subida sin terminar', 'warn')
      return sync('↑ subiendo', 'ok')
    case 'conflict':
      return sync('⚠ conflicto', 'warn')
    case 'secret':
      return sync('⚠ secreto bloqueado', 'warn')
    case 'offline':
      return sync('sin red', 'off')
    case 'pending':
      if (status.pending > 0) return sync(`⚠ ${status.pending} por decidir`, 'warn')
      return sync(`⚠ ${short(status.message || 'pendiente')}`, 'warn')
    case 'error':
      return sync(`⚠ ${short(status.message || 'error')}`, 'warn')
  }
}
