// Ayudas de los tests de la banda de escritorio: el valor ahora va dibujado dentro
// del SVG de cada anillo (34 px), no como un `Text` aparte.
type Ui = { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }

/** Los anillos de la banda (los `Svg` de 34; la mascota es de 32). */
export const anillos = async (ui: Ui) => (await ui.findAll({ type: 'Svg' })).filter(s => s.props.width === 34)

/** El texto dibujado dentro de un anillo, o undefined si no lleva. */
export const dentroDe = (a: { props: Record<string, unknown> } | undefined) => /<text[^>]*>([^<]*)<\/text>/.exec(String(a?.props.source))?.[1]

/** El anillo cuyo `alt` empieza por `prefijo` ("Etapa", "Sync"...). */
export const anillo = async (ui: Ui, prefijo: string) => (await anillos(ui)).find(s => String(s.props.alt).startsWith(prefijo))

/** Todo lo que los anillos llevan dentro, en orden. */
export const dentro = async (ui: Ui) => (await anillos(ui)).map(dentroDe)
