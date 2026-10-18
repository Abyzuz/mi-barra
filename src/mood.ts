// Máquina de estados de la mascota. Pura: recibe un evento de la sesión y
// devuelve el estado siguiente.
import type { Mood } from '../types'

export type MoodEvent =
  | { type: 'turn-start' }
  | { type: 'chunk'; kind: 'thinking' | 'text' | 'tool' }
  | { type: 'permission-asked' }
  | { type: 'tool-settled' }
  | { type: 'turn-end' }
  | { type: 'idle' }

export const INITIAL_MOOD: Mood = 'inactivo'

export function nextMood(current: Mood, event: MoodEvent): Mood {
  switch (event.type) {
    case 'turn-start':
      return 'pensando'
    case 'chunk':
      return event.kind === 'text' ? 'escribiendo' : 'pensando'
    case 'permission-asked':
      return 'permiso'
    case 'tool-settled':
      // Solo sale del permiso: si nunca se pidió, no cambia nada.
      return current === 'permiso' ? 'pensando' : current
    case 'turn-end':
      return 'terminado'
    case 'idle':
      return current === 'terminado' ? 'inactivo' : current
  }
}

export const MOOD_LABEL: Record<Mood, string> = {
  pensando: 'Pensando',
  escribiendo: 'Escribiendo',
  permiso: 'Esperando tu permiso',
  terminado: 'Terminado',
  inactivo: 'Inactivo',
}

/** La mascota en el terminal, donde no hay Svg. */
export const MOOD_GLYPH: Record<Mood, string> = {
  pensando: '(o_o)…',
  escribiendo: '(o_o)✎',
  permiso: '(o_o)?',
  terminado: '(^_^)✓',
  inactivo: '(-_-)z',
}
