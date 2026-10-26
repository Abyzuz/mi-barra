// Lógica pura del flujo de contexto: umbrales, tono del anillo, el punto de
// equilibrio `n`, la fila de aviso, los escalones de plegado, el toast y los
// textos T1/T2. Sin `$`: se prueba con números. Importa de gauges.ts, nunca
// al revés (P-M01: sin ciclo de imports); `tonoContexto` y `Umbrales` viven allá
// y se reexportan.
import type { EtapaId } from '../types'
import { formatTokens, type Umbrales } from './gauges.ts'

export type { Umbrales }

export const UMBRALES_DEFECTO: Umbrales = { ambar: 150_000, rojo: 200_000 }

function esEnteroPositivo(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0
}

/**
 * Los umbrales de `userConfig`. Faltantes → defecto; inválidos (no enteros
 * positivos o `ambar >= rojo`) → ambos defectos y un `aviso` para el debug log.
 */
export function leerUmbrales(options: Readonly<Record<string, unknown>>): { umbrales: Umbrales; aviso: string | null } {
  const ambar = options.ambar ?? UMBRALES_DEFECTO.ambar
  const rojo = options.rojo ?? UMBRALES_DEFECTO.rojo
  if (esEnteroPositivo(ambar) && esEnteroPositivo(rojo) && ambar < rojo) {
    return { umbrales: { ambar, rojo }, aviso: null }
  }
  return {
    umbrales: UMBRALES_DEFECTO,
    aviso: `mi-barra: umbrales inválidos (ambar=${String(ambar)}, rojo=${String(rojo)}); uso ${UMBRALES_DEFECTO.ambar}/${UMBRALES_DEFECTO.rojo}`,
  }
}

export { tonoContexto } from './gauges.ts'

// Punto de equilibrio entre seguir y abrir una sesión fresca. Los números salen
// de medir el costo ponderado de sesiones reales del autor.
/** Costo ponderado de traspasar a una sesión nueva (~170k). */
export const TRASPASO = 170_000
/** Contexto con el que arranca una sesión fresca (~110k: herramientas y skills). */
export const SESION_FRESCA = 110_000
/** Sobrecosto por turno: 0,1 × el exceso de contexto sobre la sesión fresca. */
export const SOBRECOSTO = 0.1
/** Exceso mínimo (R2/D2): evita dividir por cero o negativos con umbrales de prueba bajos. */
export const EXCESO_MINIMO = 10_000

/** Cuántos turnos hacen falta para que el traspaso se pague (mínimo 1). */
export function turnosEquilibrio(tokens: number): number {
  const exceso = Math.max(tokens - SESION_FRESCA, EXCESO_MINIMO)
  return Math.max(1, Math.round(TRASPASO / (SOBRECOSTO * exceso)))
}

/** Dónde se guarda el estado de una tanda cuando la etapa no fija otro destino. */
export const ARCHIVO_ESTADO = 'progress.md, o el archivo de estado que fije el CLAUDE.md del proyecto'

const ESCALONES_FIJOS = [262_000, 400_000]
const PASO_ESCALON = 150_000
const TOPE_ESCALONES = 10_000_000

/**
 * Los escalones donde el aviso plegado vuelve a salir: `rojo`, 262k y 400k (los
 * que pasen de `rojo`) y luego cada +150k hasta pasar 10 M.
 */
export function escalones(rojo: number): number[] {
  const lista = [rojo, ...ESCALONES_FIJOS.filter(e => e > rojo)]
  while (lista[lista.length - 1]! <= TOPE_ESCALONES) lista.push(lista[lista.length - 1]! + PASO_ESCALON)
  return lista
}

/** El primer escalón estrictamente mayor que `tokens`. */
export function siguienteEscalon(tokens: number, rojo: number): number {
  return escalones(rojo).find(e => e > tokens) ?? tokens + PASO_ESCALON
}

export type FilaContexto = { nivel: 'ambar' | 'rojo'; texto: string; n: number }

/**
 * La fila de aviso bajo los anillos, o null: sin dato, por debajo de ámbar o
 * plegada por «Seguir aquí» hasta `plegadoHasta`.
 */
export function filaContexto(tokens: number | null, u: Umbrales, plegadoHasta: number | null): FilaContexto | null {
  if (tokens === null || tokens < u.ambar) return null
  if (plegadoHasta !== null && tokens < plegadoHasta) return null
  const n = turnosEquilibrio(tokens)
  const t = formatTokens(tokens)
  if (tokens >= u.rojo) {
    return {
      nivel: 'rojo',
      n,
      texto: `Contexto ${t}: cambiar de sesión se paga si quedan más de ~${n} turnos (una tarea). Si quedan menos, sigue aquí.`,
    }
  }
  return { nivel: 'ambar', n, texto: `Contexto ${t}: al terminar la tarea en curso, mira si conviene sesión nueva (regla 3).` }
}

/** `{archivo}` de T1 (D3) y `{cierre}` según la etapa. */
function archivoYCierre(etapa: EtapaId | null): { archivo: string; cierre: string } {
  switch (etapa) {
    case 'ejecucion':
    case 'final':
      return {
        archivo: ARCHIVO_ESTADO,
        cierre: `cierra la tanda en ${ARCHIVO_ESTADO}: qué quedó hecho, qué falta, qué agentes siguen corriendo y dónde dejarán su informe, y cómo seguir`,
      }
    case 'spec':
      return { archivo: 'la spec', cierre: 'deja la spec al día en docs/superpowers/specs con lo decidido y las preguntas abiertas' }
    case 'plan':
      return { archivo: 'el plan', cierre: 'deja el plan escrito hasta donde va, con una nota de lo que falta' }
    default:
      return {
        archivo: 'ese archivo',
        cierre: 'deja el estado en un archivo de la carpeta del proyecto (pregúntame cuál si no es esta)',
      }
  }
}

/** T1: lo que «Cerrar tanda» y `/tanda` dejan en el prompt. */
export function textoT1(tokens: number, etapa: EtapaId | null): string {
  const { archivo, cierre } = archivoYCierre(etapa)
  return (
    `Contexto en ${formatTokens(tokens)}: según la regla 3, cambiar de sesión se paga si quedan más de ~${turnosEquilibrio(tokens)} turnos. ` +
    `Si quedan más (por ejemplo, una tarea completa), ${cierre} y propón una sesión nueva en esta carpeta, con tarjeta en la app, ` +
    `que empiece con «continúa desde ${archivo}». ` +
    'Si quedan menos, o son preguntas sueltas, dímelo en una línea y seguimos aquí.'
  )
}

/** T2: el toast al cruzar el rojo. */
export function textoT2(tokens: number): string {
  return `⚠ ${formatTokens(tokens)} de contexto: sesión nueva si quedan más de ~${turnosEquilibrio(tokens)} turnos`
}

/**
 * Un paso del toast: una vez por cruce de `rojo` hacia arriba. Sin dato o por
 * debajo de `rojo` se re-arma; el aviso sale solo al cruzar estando armado.
 */
export function pasoToast(armado: boolean, tokens: number | null, rojo: number): { mostrar: boolean; armado: boolean } {
  if (tokens === null || tokens < rojo) return { mostrar: false, armado: true }
  if (armado) return { mostrar: true, armado: false }
  return { mostrar: false, armado: false }
}
