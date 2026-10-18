// Dibujos SVG como texto: el anillo de cada indicador y la mascota (un
// cangrejo pixel-art) con sus cinco animaciones SMIL, sin scripts. Puros: se
// prueban como strings.
import type { Mood } from '../types'
import type { Tone } from './gauges'

export const TONE_COLOR: Record<Tone, string> = {
  ok: '#3fb37f',
  warn: '#e0a030',
  bad: '#e5534b',
  off: '#8a8f98',
}

const TRACK = 'rgba(138,143,152,0.30)'

/** Anillo de progreso de 36×36. `fill` null = gris punteado (no disponible). */
export function ringSvg(fill: number | null, tone: Tone): string {
  const r = 14
  const c = 2 * Math.PI * r
  const track =
    fill === null
      ? `<circle cx="18" cy="18" r="${r}" fill="none" stroke="${TRACK}" stroke-width="4" stroke-dasharray="3 4"/>`
      : `<circle cx="18" cy="18" r="${r}" fill="none" stroke="${TRACK}" stroke-width="4"/>`
  const arc =
    fill === null || fill <= 0
      ? ''
      : `<circle cx="18" cy="18" r="${r}" fill="none" stroke="${TONE_COLOR[tone]}" stroke-width="4" ` +
        `stroke-linecap="round" stroke-dasharray="${(c * fill).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 18 18)"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">${track}${arc}</svg>`
}

// --- La mascota -------------------------------------------------------------
// Grilla de 16×16 celdas de 3 px (lienzo de 48×48). Cuerpo casi cuadrado,
// patas largas, pinzas abajo a los lados y ojos altos y separados.
const CELL = 3

const CLAY = '#d97757'
const CLAY_SLEEPY = '#b98a78'
const INK = '#1d1b22'
const LAPTOP = '#4a4a55'
const LAPTOP_EDGE = '#6c6c7a'
const CODE = '#9fd3a8'

/** Una celda (o un bloque de celdas) de la grilla. */
function px(x: number, y: number, w = 1, h = 1, fill = INK): string {
  return `<rect x="${x * CELL}" y="${y * CELL}" width="${w * CELL}" height="${h * CELL}" fill="${fill}"/>`
}

/**
 * Animación por cuadros: salta de celda en celda, sin pasos intermedios
 * (calcMode discrete), como un sprite de pixel-art.
 */
function frames(values: string, dur: string, begin = '0s'): string {
  const list = values.split(';').map(pair => pair.trim().split(' ').map(n => Number(n) * CELL).join(' '))
  const keyTimes = list.map((_, i) => (i / list.length).toFixed(3)).join(';')
  return (
    `<animateTransform attributeName="transform" type="translate" values="${list.join(';')}" ` +
    `keyTimes="${keyTimes}" calcMode="discrete" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
  )
}

/** Muestra un elemento solo en ciertos cuadros (1 = visible). */
function blink(pattern: string, dur: string, begin = '0s'): string {
  const list = pattern.split('')
  const keyTimes = list.map((_, i) => (i / list.length).toFixed(3)).join(';')
  return `<animate attributeName="opacity" values="${list.join(';')}" keyTimes="${keyTimes}" calcMode="discrete" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
}

const LEGS = (color: string) => px(3, 13, 1, 3, color) + px(5, 13, 1, 3, color) + px(10, 13, 1, 3, color) + px(12, 13, 1, 3, color)
const TORSO = (color: string) => px(2, 6, 12, 8, color)
const CLAWS_DOWN = (color: string) => px(0, 11, 2, 2, color) + px(14, 11, 2, 2, color)

/** El cangrejo de pie: torso, pinzas abajo y patas. */
function body(color: string): string {
  return TORSO(color) + CLAWS_DOWN(color) + LEGS(color)
}

/** Ojos de 1×2 celdas con parpadeo: un párpado del color del cuerpo cae un instante. */
function eyes(x1: number, x2: number, y: number, color: string): string {
  return (
    px(x1, y, 1, 2) +
    px(x2, y, 1, 2) +
    `<g opacity="0">${px(x1, y, 1, 1, color)}${px(x2, y, 1, 1, color)}${blink('0000000000000100', '4s')}</g>`
  )
}

function crab(mood: Mood): string {
  switch (mood) {
    case 'inactivo':
      // Duerme: ojos cerrados y una "z" que sube a saltos.
      return (
        body(CLAY_SLEEPY) +
        px(3, 10, 2, 1) +
        px(11, 10, 2, 1) +
        `<g>${px(12, 0, 4, 1, CLAY_SLEEPY)}${px(14, 1, 1, 1, CLAY_SLEEPY)}${px(13, 2, 1, 1, CLAY_SLEEPY)}${px(12, 3, 4, 1, CLAY_SLEEPY)}` +
        `${frames('0 0;0 -0.34;0 -0.67;0 -1', '2.4s')}${blink('1110', '2.4s')}</g>`
      )
    case 'pensando':
      // Mira a un lado y al otro; tres puntos aparecen uno por uno.
      return (
        body(CLAY) +
        `<g>${eyes(4, 11, 7, CLAY)}${frames('0 0;1 0;1 0;0 0', '2.4s')}</g>` +
        [0, 1, 2].map(i => `<g>${px(6 + i * 2, 2, 1, 1, CLAY)}${blink(['0111', '0011', '0001'][i]!, '1.6s')}</g>`).join('')
      )
    case 'escribiendo':
      // Saca su notebook: teclea con las pinzas y aparecen líneas de código.
      return (
        TORSO(CLAY) +
        eyes(4, 11, 7, CLAY) +
        LEGS(CLAY) +
        px(3, 9, 10, 4, LAPTOP) +
        px(3, 9, 10, 1, LAPTOP_EDGE) +
        `<g>${px(4, 10, 3, 1, CODE)}${blink('0111', '1.2s')}</g>` +
        `<g>${px(5, 11, 5, 1, CODE)}${blink('0011', '1.2s')}</g>` +
        `<g>${px(4, 12, 2, 1, CODE)}${blink('0001', '1.2s')}</g>` +
        px(1, 13, 14, 1, LAPTOP_EDGE) +
        `<g>${px(0, 11, 2, 2, CLAY)}${frames('0 0;0 -1', '0.4s')}</g>` +
        `<g>${px(14, 11, 2, 2, CLAY)}${frames('0 -1;0 0', '0.4s')}</g>`
      )
    case 'permiso':
      // Agita las pinzas en alto y muestra un "?" que parpadea.
      return (
        TORSO(CLAY) +
        LEGS(CLAY) +
        eyes(4, 11, 8, CLAY) +
        `<g>${px(0, 2, 2, 4, CLAY)}${frames('0 0;0 -1', '0.6s')}</g>` +
        `<g>${px(14, 2, 2, 4, CLAY)}${frames('0 -1;0 0', '0.6s')}</g>` +
        `<text x="19" y="14" font-size="15" font-weight="700" font-family="monospace" fill="${CLAY}">?${blink('10', '1s')}</text>`
      )
    case 'terminado':
      // Ojos felices, salta a saltos y brilla una estrella.
      return (
        `<g>${body(CLAY)}${px(4, 8)}${px(5, 9)}${px(4, 10)}${px(11, 8)}${px(10, 9)}${px(11, 10)}` +
        `${frames('0 0;0 -1;0 -2;0 -1;0 0;0 0;0 0;0 0', '1.2s')}</g>` +
        `<path d="M40 3l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2Z" fill="#f0b03f">${blink('1100', '1.2s')}</path>`
      )
  }
}

/** La mascota de 48×48 con la animación de cada estado. */
export function mascotSvg(mood: Mood): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" shape-rendering="crispEdges">` +
    crab(mood) +
    `</svg>`
  )
}
