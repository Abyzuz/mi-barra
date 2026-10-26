// Aviso de escalada: qué skill pide su propia sesión, qué etapa le corresponde y qué
// fila (texto T6 y botones) se muestra. Puro: sin `$`, se prueba con strings.
import type { EtapaId } from '../types'
import { ETIQUETA, siguienteEtapa } from './etapa.ts'

/** Nombre base de la skill (sin prefijo `<plugin>:`, en minúsculas) → la etapa que le corresponde. */
export const ETAPA_DE_SKILL: Readonly<Record<string, EtapaId>> = {
  brainstorming: 'spec',
  'writing-plans': 'plan',
  'executing-plans': 'ejecucion',
  'subagent-driven-development': 'ejecucion',
}

/** La etapa de una skill (`superpowers:brainstorming` o `brainstorming`); null si no es una de las del mapa. */
export function etapaEsperada(skill: string): EtapaId | null {
  const base = /^(?:[^:]+:)?([^:]+)$/.exec(skill.trim().toLowerCase())?.[1]
  if (base === undefined || !Object.prototype.hasOwnProperty.call(ETAPA_DE_SKILL, base)) return null
  return ETAPA_DE_SKILL[base] ?? null
}

/** La skill que nombra la entrada de un `tool.call` de `Skill` (campo plano `skill`, medido en S6b); null si no hay. */
export function skillDeLlamada(e: { tool: string; skill?: unknown }): string | null {
  return e.tool === 'Skill' && typeof e.skill === 'string' && e.skill !== '' ? e.skill : null
}

export type Variante = 'sin-etapa' | 'siguiente' | 'otra'

/** Qué fila corresponde; null si la etapa de ahora ya es la esperada. */
export function varianteEscalada(actual: EtapaId | null, esperada: EtapaId): Variante | null {
  if (actual === null) return 'sin-etapa'
  if (actual === esperada) return null
  return siguienteEtapa(actual) === esperada ? 'siguiente' : 'otra'
}

export type BotonEscalada = { key: 'esc-marcar' | 'esc-pasar' | 'esc-pedir' | 'esc-ignorar'; label: string }

const QUE: Record<EtapaId, string> = {
  spec: 'un brainstorm',
  plan: 'un plan',
  ejecucion: 'una ejecución',
  final: 'una revisión final',
  uso: 'un uso real',
}

/** T6 (spec §5) y los botones de la variante (§4.3). Nunca un botón que escriba una etapa anterior. */
export function filaEscalada(
  v: Variante,
  esperada: EtapaId,
  actual: EtapaId | null,
  carpeta: string,
  prohibida: boolean,
): { texto: string; botones: BotonEscalada[] } {
  const ignorar: BotonEscalada = { key: 'esc-ignorar', label: 'Ignorar' }
  const pedir: BotonEscalada = { key: 'esc-pedir', label: 'Pedir sesión nueva' }
  const ahora = actual === null ? 'sin etapa' : ETIQUETA[actual]
  switch (v) {
    case 'sin-etapa':
      return {
        texto: `Arrancó ${QUE[esperada]} y ${carpeta} no tiene etapa: si es un proyecto de más de una tarea, va en su propia sesión.`,
        botones: [...(prohibida ? [] : [{ key: 'esc-marcar', label: `Marcar ${ETIQUETA[esperada]} en ${carpeta}` } as BotonEscalada]), pedir, ignorar],
      }
    case 'siguiente':
      return {
        texto: `Arrancó ${QUE[esperada]} en la sesión de ${ahora}: una sesión por etapa.`,
        botones: [{ key: 'esc-pasar', label: `Pasar a ${ETIQUETA[esperada]}` }, ignorar],
      }
    case 'otra':
      return {
        texto: `Arrancó ${QUE[esperada]} en la etapa ${ahora}: si es parte de esta etapa, ignóralo; si es un proyecto nuevo, va en otra sesión.`,
        botones: [pedir, ignorar],
      }
  }
}

/** T7, lo que «Pedir sesión nueva» deja en el prompt (spec §5). */
export function textoT7(carpeta: string): string {
  return (
    'Esto ya es un proyecto de más de una tarea. No sigas construyendo aquí: guarda lo decidido hasta ahora en un archivo ' +
    `de la carpeta del proyecto (pregúntame cuál si no es ${carpeta}) y propón una sesión nueva allí, con tarjeta en la app, ` +
    'que parta de ese archivo. En esa sesión marcaré la etapa.'
  )
}

/** Toast solo para plan y ejecución: en un brainstorm la fila basta. */
export function toastEscalada(esperada: EtapaId): boolean {
  return esperada !== 'spec'
}
