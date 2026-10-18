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

/** Una celda (o un bloque de celdas) de la grilla. */
function px(x: number, y: number, w = 1, h = 1, fill = INK): string {
  return `<rect x="${x * CELL}" y="${y * CELL}" width="${w * CELL}" height="${h * CELL}" fill="${fill}"/>`
}

/** Animación de desplazamiento en celdas, repetida. */
function shift(values: string, dur: string, begin = '0s'): string {
  const scaled = values
    .split(';')
    .map(pair => pair.trim().split(' ').map(n => Number(n) * CELL).join(' '))
    .join(';')
  return `<animateTransform attributeName="transform" type="translate" values="${scaled}" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
}

const LEGS = (color: string) => px(3, 13, 1, 3, color) + px(5, 13, 1, 3, color) + px(10, 13, 1, 3, color) + px(12, 13, 1, 3, color)
const TORSO = (color: string) => px(2, 6, 12, 8, color)
const CLAWS_DOWN = (color: string) => px(0, 11, 2, 2, color) + px(14, 11, 2, 2, color)

/** El cangrejo de pie: torso, pinzas abajo y patas. */
function body(color: string): string {
  return TORSO(color) + CLAWS_DOWN(color) + LEGS(color)
}

const EYES_OPEN = px(4, 8, 1, 2) + px(11, 8, 1, 2)

function crab(mood: Mood): string {
  switch (mood) {
    case 'inactivo':
      // Ojos cerrados, respira lento y suelta una "z".
      return (
        `<g>${body(CLAY_SLEEPY)}${px(3, 10, 2, 1)}${px(11, 10, 2, 1)}${shift('0 0;0 -0.3;0 0', '3.2s')}</g>` +
        `<text x="37" y="12" font-size="11" font-weight="700" font-family="monospace" fill="${CLAY_SLEEPY}">z` +
        `<animate attributeName="y" values="15;5" dur="2.4s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></text>`
      )
    case 'pensando':
      // Mira hacia arriba a la derecha y tres puntos laten encima.
      return (
        `<g>${body(CLAY)}${px(5, 7, 1, 2)}${px(12, 7, 1, 2)}${shift('0 0;0 -0.5;0 0', '2s')}</g>` +
        [0, 1, 2]
          .map(
            i =>
              `<rect x="${(6 + i * 2) * CELL}" y="${2 * CELL}" width="${CELL}" height="${CELL}" fill="${CLAY}" opacity="0.2">` +
              `<animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="${i * 0.2}s" repeatCount="indefinite"/></rect>`,
          )
          .join('')
      )
    case 'escribiendo':
      // Saca su notebook y teclea con las pinzas.
      return (
        `<g>${TORSO(CLAY)}${px(4, 7, 1, 2)}${px(11, 7, 1, 2)}${shift('0 0;0 -0.25;0 0', '0.5s')}</g>` +
        LEGS(CLAY) +
        px(3, 9, 10, 4, LAPTOP) +
        px(3, 9, 10, 1, LAPTOP_EDGE) +
        px(1, 13, 14, 1, LAPTOP_EDGE) +
        `<g>${px(0, 11, 2, 2, CLAY)}${shift('0 0;0 -0.7;0 0', '0.3s')}</g>` +
        `<g>${px(14, 11, 2, 2, CLAY)}${shift('0 0;0 -0.7;0 0', '0.3s', '0.15s')}</g>`
      )
    case 'permiso':
      // Levanta las pinzas, se balancea y muestra un "?".
      return (
        `<g>${TORSO(CLAY)}${LEGS(CLAY)}${EYES_OPEN}` +
        `<g>${px(0, 2, 2, 4, CLAY)}${px(14, 2, 2, 4, CLAY)}${shift('0 0;0 -0.5;0 0', '0.8s')}</g>` +
        `${shift('-0.3 0;0.3 0;-0.3 0', '1.2s')}</g>` +
        `<text x="19" y="14" font-size="15" font-weight="700" font-family="monospace" fill="${CLAY}">?` +
        `<animate attributeName="opacity" values="1;0.15;1" dur="1s" repeatCount="indefinite"/></text>`
      )
    case 'terminado':
      // Ojos felices, salta y brilla.
      return (
        `<g>${body(CLAY)}${px(4, 8)}${px(5, 9)}${px(4, 10)}${px(11, 8)}${px(10, 9)}${px(11, 10)}` +
        `${shift('0 0;0 -1.2;0 0;0 0', '1.2s')}</g>` +
        `<path d="M40 3l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2Z" fill="#f0b03f">` +
        `<animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/></path>`
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
