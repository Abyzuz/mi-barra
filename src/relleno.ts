// Cómo dejar un texto en el cuadro del prompt sin pisar lo que el usuario ya
// escribió. Puro: el hook lee el borrador y aplica el plan.

/** Cuadro vacío → reemplaza; con borrador → añade debajo, tras un salto de línea. */
export function planRelleno(borrador: string, texto: string): { text: string; mode: 'replace' | 'append' } {
  if (borrador === '') return { text: texto, mode: 'replace' }
  return { text: '\n' + texto, mode: 'append' }
}
