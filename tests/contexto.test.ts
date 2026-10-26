import { expect, test } from 'claude-code/testing'

import { contextGauge, formatTokens, UNAVAILABLE } from '../src/gauges.ts'
import {
  ARCHIVO_ESTADO,
  escalones,
  filaContexto,
  leerUmbrales,
  pasoToast,
  siguienteEscalon,
  textoT1,
  textoT2,
  tonoContexto,
  turnosEquilibrio,
  UMBRALES_DEFECTO,
} from '../src/contexto.ts'
import { planRelleno } from '../src/relleno.ts'

test('umbrales: defectos, opciones y valores inválidos', () => {
  expect(leerUmbrales({})).toEqual({ umbrales: { ambar: 150_000, rojo: 200_000 }, aviso: null })
  expect(leerUmbrales({ ambar: 20_000, rojo: 30_000 }).umbrales).toEqual({ ambar: 20_000, rojo: 30_000 })
  for (const mal of [{ ambar: 0, rojo: 5 }, { ambar: 200_000, rojo: 150_000 }, { ambar: 1.5, rojo: 9 }, { ambar: 'x', rojo: 9 }]) {
    const r = leerUmbrales(mal)
    expect(r.umbrales).toEqual(UMBRALES_DEFECTO)
    expect(r.aviso).toMatch(/inválidos/)
  }
})

test('tono: absoluto y porcentual, gana el peor', () => {
  const u = UMBRALES_DEFECTO
  expect(tonoContexto(149_999, 1_000_000, u)).toBe('ok')
  expect(tonoContexto(150_000, 1_000_000, u)).toBe('warn')
  expect(tonoContexto(200_000, 1_000_000, u)).toBe('bad')
  expect(tonoContexto(130_000, 200_000, u)).toBe('warn') // 65 % de una ventana de 200k
  expect(tonoContexto(171_000, 200_000, u)).toBe('bad') // 85,5 %: rojo antes del umbral absoluto
  expect(tonoContexto(null, 1_000_000, u)).toBe('off')
})

test('punto de equilibrio', () => {
  expect(turnosEquilibrio(200_000)).toBe(19)
  expect(turnosEquilibrio(262_000)).toBe(11)
  expect(turnosEquilibrio(400_000)).toBe(6)
  expect(turnosEquilibrio(30_000)).toBe(170) // D2: exceso mínimo
  expect(turnosEquilibrio(5_000_000)).toBe(1)
})

test('anillo de contexto en tokens', () => {
  const g = contextGauge(210_000, 1_000_000, UMBRALES_DEFECTO)
  expect([g.value, g.hint, g.tone]).toEqual(['210k', '21 % de 1M', 'bad'])
  expect(g.fill).toBe(0.21)
  expect(contextGauge(null, 1_000_000, UMBRALES_DEFECTO).value).toBe(UNAVAILABLE)
  expect(formatTokens(999_500)).toBe('1M')
  expect(formatTokens(1_250_000)).toBe('1.3M')
})

test('fila de contexto: aparece, cambia de nivel y se pliega por escalones', () => {
  const u = UMBRALES_DEFECTO
  expect(filaContexto(149_999, u, null)).toBe(null)
  expect(filaContexto(150_000, u, null)?.nivel).toBe('ambar')
  expect(filaContexto(150_000, u, null)?.texto).toBe('Contexto 150k: al terminar la tarea en curso, mira si conviene sesión nueva (regla 3).')
  const rojo = filaContexto(200_000, u, null)!
  expect([rojo.nivel, rojo.n]).toEqual(['rojo', 19])
  expect(rojo.texto).toBe('Contexto 200k: cambiar de sesión se paga si quedan más de ~19 turnos (una tarea). Si quedan menos, sigue aquí.')
  expect(filaContexto(null, u, null)).toBe(null)
  expect(siguienteEscalon(160_000, 200_000)).toBe(200_000)
  expect(siguienteEscalon(210_000, 200_000)).toBe(262_000)
  expect(siguienteEscalon(420_000, 200_000)).toBe(550_000) // Review Focus 5
  expect(filaContexto(240_000, u, 262_000)).toBe(null)
  expect(filaContexto(262_000, u, 262_000)?.nivel).toBe('rojo')
})

test('toast: una vez por cruce, se re-arma al bajar o sin dato', () => {
  let a = true
  const paso = (t: number | null) => {
    const r = pasoToast(a, t, 200_000)
    a = r.armado
    return r.mostrar
  }
  expect([paso(150_000), paso(210_000), paso(420_000), paso(null), paso(205_000)]).toEqual([false, true, false, false, true])
})

test('T1 según la etapa y relleno sin pisar el borrador', () => {
  expect(textoT1(210_000, 'ejecucion')).toBe(
    'Contexto en 210k: según la regla 3, cambiar de sesión se paga si quedan más de ~17 turnos. ' +
      'Si quedan más (por ejemplo, una tarea completa), ' +
      `cierra la tanda en ${ARCHIVO_ESTADO}: qué quedó hecho, qué falta, qué agentes siguen corriendo y dónde dejarán su informe, y cómo seguir ` +
      'y propón una sesión nueva en esta carpeta, con tarjeta en la app, que empiece con «continúa desde ' +
      `${ARCHIVO_ESTADO}». ` +
      'Si quedan menos, o son preguntas sueltas, dímelo en una línea y seguimos aquí.',
  )
  expect(textoT1(210_000, 'spec')).toContain('deja la spec al día en docs/superpowers/specs')
  expect(textoT1(210_000, null)).toContain('(pregúntame cuál si no es esta)')
  expect(textoT1(210_000, 'plan')).toContain('«continúa desde el plan»')
  expect(textoT2(210_000)).toBe('⚠ 210k de contexto: sesión nueva si quedan más de ~17 turnos')
  expect(planRelleno('', 'T')).toEqual({ text: 'T', mode: 'replace' })
  expect(planRelleno('mi idea', 'T')).toEqual({ text: '\nT', mode: 'append' })
})

test('escalones: rojo, 262k y 400k mayores que rojo, y +150k después', () => {
  expect(escalones(200_000).slice(0, 5)).toEqual([200_000, 262_000, 400_000, 550_000, 700_000])
  expect(escalones(300_000).slice(0, 3)).toEqual([300_000, 400_000, 550_000])
  expect(escalones(30_000).slice(0, 4)).toEqual([30_000, 262_000, 400_000, 550_000])
  expect(escalones(200_000).at(-1)! > 10_000_000).toBe(true)
})
