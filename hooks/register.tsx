// mi-barra: la barra sobre el prompt. Este archivo solo engancha eventos y
// dibuja; la lógica vive en ../src (pura, con tests).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Usage } from '../types'
import { EMPTY_USAGE, gauges, pickLimit, type Gauge } from '../src/gauges.ts'
import { INITIAL_MOOD, MOOD_GLYPH, MOOD_LABEL, nextMood, type MoodEvent } from '../src/mood.ts'
import { mascotSvg, ringSvg } from '../src/svg.ts'

/** Duración supuesta del caché. La API no la informa: cámbiala aquí (5 min = 5 * 60 * 1000). */
const CACHE_TTL_MS = 60 * 60 * 1000
/** Cuánto dura "terminado" antes de pasar a "inactivo". */
const DONE_TO_IDLE_MS = 2 * 60 * 1000
/** Cada cuánto se redibujan los tiempos (caché, reinicios). */
const TICK_MS = 15 * 1000

const moodAtom = atom({ plugin: 'mi-barra', key: 'mood' } as const, INITIAL_MOOD)
const usageAtom = atom({ plugin: 'mi-barra', key: 'usage' } as const, EMPTY_USAGE)
const cacheAtAtom = atom({ plugin: 'mi-barra', key: 'cacheAt' } as const, null)
const nowAtom = atom({ plugin: 'mi-barra', key: 'now' } as const, 0)

type UsageLike = {
  context: { percent?: number }
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
}

function toUsage(u: UsageLike): Usage {
  return {
    context: u.context.percent ?? null,
    fiveHour: pickLimit(u.rateLimits, 'five_hour'),
    week: pickLimit(u.rateLimits, 'seven_day'),
  }
}

async function feed($: EngineInterface, event: MoodEvent): Promise<void> {
  await update($, moodAtom, mood => nextMood(mood, event))
}

/** Barrita de texto para el terminal: "██░░░" (caracteres que traen casi todas las fuentes). */
function bar(fill: number | null): string {
  if (fill === null) return '·····'
  const n = Math.round(fill * 5)
  return '█'.repeat(n) + '░'.repeat(5 - n)
}

function terminalLine(g: Gauge): string {
  return g.fill === null ? `${g.label} ${g.value}` : `${g.label} ${bar(g.fill)} ${g.value}${g.key === 'cache' ? ` (${g.hint})` : ''}`
}

export const register: Register = on => {
  let finishedAt: number | null = null
  let lastChunkKind: string | null = null

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const now = await $.clock.now()
    await update($, nowAtom, () => now)
    try {
      const usage = toUsage(await $.session.usage())
      await update($, usageAtom, () => usage)
    } catch {
      // Sin lectura: los indicadores quedan "no disponible".
    }
    $.clock.every(TICK_MS, () => {
      void (async () => {
        const tick = await $.clock.now()
        await update($, nowAtom, () => tick)
        const mood = await read($, moodAtom)
        if (mood === 'terminado' && (finishedAt === null || tick - finishedAt >= DONE_TO_IDLE_MS)) {
          await feed($, { type: 'idle' })
        }
      })()
    })
    return result
  })

  // Contexto y límites: el motor los empuja después de cada turno.
  on('session.measure', async ($, e, next) => {
    const usage = toUsage(e)
    await update($, usageAtom, () => usage)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      lastChunkKind = null
      await feed($, { type: 'turn-start' })
    }
    return next(e)
  })

  // Pensando / escribiendo: según el tipo de fragmento que llega del modelo.
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    if (e.agentId !== undefined) return yield* stream
    for (;;) {
      const step = await stream.next()
      if (step.done) return step.value
      const chunk = step.value
      if ((chunk.kind === 'thinking' || chunk.kind === 'text' || chunk.kind === 'tool') && chunk.kind !== lastChunkKind) {
        lastChunkKind = chunk.kind
        await feed($, { type: 'chunk', kind: chunk.kind })
      }
      yield chunk
    }
  })

  // Esperando permiso: solo si el motor dispara PermissionRequest. Si no lo
  // dispara (p. ej. la app maneja el diálogo), la mascota nunca entra aquí.
  on('classic.PermissionRequest', async ($, e, next) => {
    await feed($, { type: 'permission-asked' })
    return next(e)
  }).catch(($, e, next) => next(e))

  // La llamada se resolvió (aprobada, rechazada o fallida): sale del permiso.
  on('tool.call', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      lastChunkKind = null
      await feed($, { type: 'tool-settled' })
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      finishedAt = now
      await feed($, { type: 'turn-end' })
      const usage = e.usage
      if (usage && usage.cache_read_input_tokens + usage.cache_creation_input_tokens > 0) {
        await update($, cacheAtAtom, () => now)
        await update($, nowAtom, () => now)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const mood = await read($, moodAtom)
    const usage = await read($, usageAtom)
    const cacheAt = await read($, cacheAtAtom)
    const now = await read($, nowAtom)
    const list = gauges(usage, cacheAt, now, CACHE_TTL_MS)

    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)
      return (
        <Text wrap="truncate-end">
          {MOOD_GLYPH[mood]} {MOOD_LABEL[mood]} │ {list.map(terminalLine).join(' │ ')}
        </Text>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" alignItems="center" gap={3}>
        <Svg key="pet" source={mascotSvg(mood)} alt={`Mascota: ${MOOD_LABEL[mood]}`} width={32} height={32} isInteractive />
        {list.map(g => (
          <Box key={g.key} flexDirection="row" alignItems="center" gap={1}>
            <Svg source={ringSvg(g.fill, g.tone)} alt={`${g.label}: ${g.value}`} width={24} height={24} />
            <Box flexDirection="column">
              <Text dimColor wrap="truncate-end">{g.label}</Text>
              <Text wrap="truncate-end">
                <Text bold>{g.value}</Text>
                {g.hint ? <Text dimColor> · {g.hint}</Text> : null}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    )
  })
}
