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
// Grilla de 14×12 celdas de 3 px dentro de un lienzo de 44×44.
const CELL = 3
const OX = 1
const OY = 6

const CLAY = '#d97757'
const CLAY_SLEEPY = '#b98a78'
const INK = '#1d1b22'
const LAPTOP = '#4a4a55'
const LAPTOP_EDGE = '#6c6c7a'

/** Una celda (o un bloque de celdas) de la grilla. */
function px(x: number, y: number, w = 1, h = 1, fill = INK, extra = ''): string {
  return `<rect x="${OX + x * CELL}" y="${OY + y * CELL}" width="${w * CELL}" height="${h * CELL}" fill="${fill}"${extra}/>`
}

/** Animación de desplazamiento en celdas, repetida. */
function shift(values: string, dur: string, begin = '0s'): string {
  const scaled = values
    .split(';')
    .map(pair => pair.trim().split(' ').map(n => Number(n) * CELL).join(' '))
    .join(';')
  return `<animateTransform attributeName="transform" type="translate" values="${scaled}" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
}

/** Cuerpo: bloque ancho, pinzas a los lados y cuatro patas. */
function body(color: string, withLegs = true): string {
  return (
    px(3, 2, 8, 5, color) +
    px(1, 4, 2, 2, color) +
    px(11, 4, 2, 2, color) +
    (withLegs ? px(3, 7, 1, 2, color) + px(5, 7, 1, 2, color) + px(8, 7, 1, 2, color) + px(10, 7, 1, 2, color) : '')
  )
}

const EYES_OPEN = px(5, 3, 1, 2) + px(8, 3, 1, 2)

function crab(mood: Mood): string {
  switch (mood) {
    case 'inactivo':
      // Ojos cerrados, respira lento y suelta una "z".
      return (
        `<g>${body(CLAY_SLEEPY)}${px(5, 4)}${px(8, 4)}${shift('0 0;0 0.25;0 0', '3.2s')}</g>` +
        `<text x="34" y="10" font-size="8" font-weight="700" font-family="monospace" fill="${CLAY_SLEEPY}">z` +
        `<animate attributeName="y" values="12;3" dur="2.4s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></text>`
      )
    case 'pensando':
      // Mira hacia arriba y tres puntos laten encima.
      return (
        `<g>${body(CLAY)}${px(6, 3)}${px(9, 3)}${shift('0 0;0 -0.5;0 0', '2s')}</g>` +
        [0, 1, 2]
          .map(
            i =>
              `<rect x="${OX + (5 + i * 2) * CELL}" y="${OY - CELL - 1}" width="${CELL}" height="${CELL}" fill="${CLAY}" opacity="0.2">` +
              `<animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="${i * 0.2}s" repeatCount="indefinite"/></rect>`,
          )
          .join('')
      )
    case 'escribiendo':
      // Saca su notebook y teclea con las pinzas.
      return (
        `<g>${px(3, 2, 8, 5, CLAY)}${EYES_OPEN}${shift('0 0;0 0.25;0 0', '0.5s')}</g>` +
        px(3, 5, 8, 3, LAPTOP) +
        px(3, 5, 8, 1, LAPTOP_EDGE) +
        px(1, 8, 12, 1, LAPTOP_EDGE) +
        `<g>${px(1, 6, 2, 2, CLAY)}${shift('0 0;0 -0.7;0 0', '0.3s')}</g>` +
        `<g>${px(11, 6, 2, 2, CLAY)}${shift('0 0;0 -0.7;0 0', '0.3s', '0.15s')}</g>`
      )
    case 'permiso':
      // Se balancea y levanta un "?".
      return (
        `<g>${body(CLAY)}${EYES_OPEN}${shift('-0.3 0;0.3 0;-0.3 0', '1.2s')}</g>` +
        `<text x="33" y="9" font-size="10" font-weight="700" font-family="monospace" fill="${CLAY}">?` +
        `<animate attributeName="opacity" values="1;0.15;1" dur="1s" repeatCount="indefinite"/></text>`
      )
    case 'terminado':
      // Ojos felices, salta y brilla.
      return (
        `<g>${body(CLAY)}${px(4, 4)}${px(5, 3)}${px(6, 4)}${px(8, 4)}${px(9, 3)}${px(10, 4)}` +
        `${shift('0 0;0 -1;0 0;0 0', '1.2s')}</g>` +
        `<path d="M38 4l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1Z" fill="#f0b03f">` +
        `<animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/></path>`
      )
  }
}

/** La mascota de 44×44 con la animación de cada estado. */
export function mascotSvg(mood: Mood): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" shape-rendering="crispEdges">` +
    crab(mood) +
    `</svg>`
  )
}
