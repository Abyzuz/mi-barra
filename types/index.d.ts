/** Estado de la sesión que la mascota dibuja. */
export type Mood = 'pensando' | 'escribiendo' | 'permiso' | 'terminado' | 'inactivo'

/** Etapa de un proyecto, en el orden del flujo. */
export type EtapaId = 'spec' | 'plan' | 'ejecucion' | 'final' | 'uso'

/** El contenido de `<raíz>/.claude/etapa.json`; las fechas son ISO 8601. */
export type EtapaFile = {
  v: 1
  proyecto: string
  etapa: EtapaId
  /** Cuándo se fijó la etapa actual. */
  desde: string
  /** El arranque de la sesión que creó el archivo. */
  inicio: string
  historial: { etapa: EtapaId; desde: string }[]
}

/** Lo que la barra leyó del proyecto: su raíz, el nombre de la carpeta y el archivo (null = no hay o no vale). */
export type EtapaLeida = {
  raiz: string
  carpeta: string
  /** La raíz es una carpeta donde el mod no lee ni escribe (HOME, unidad, `~/.claude`, scratch). */
  prohibida: boolean
  file: EtapaFile | null
}

/** Una skill que pide su propia sesión y la etapa que le corresponde (aviso de escalada). */
export type Escalada = { skill: string; esperada: EtapaId }

/** Una ventana de límite tal como la reporta la API. */
export type Limit = {
  /** Porcentaje usado, 0 a 100 (puede pasar de 100). */
  percent: number
  /** Cuándo se reinicia, en ms de época; null si la API no lo dijo. */
  resetsAt: number | null
}

/** Lo que `$.session.usage()` / `session.measure` reportan; null = no disponible. */
export type Usage = {
  context: number | null
  /** Tokens usados y tamaño de la ventana; null si la API no los dio. */
  contextTokens: number | null
  contextWindow: number | null
  fiveHour: Limit | null
  week: Limit | null
}

/** Estados que el motor wsync escribe en `~/.claude/workspace/status.json`. */
export type SyncState = 'ok' | 'running' | 'pending' | 'conflict' | 'secret' | 'offline' | 'error'

/** El contenido de status.json; `at` en ms de época. */
export type SyncStatus = {
  state: SyncState
  at: number
  /** Cuántas decisiones quedan en pending.json. */
  pending: number
  /** El aviso del motor, en español ("Todo al día.", "hay cambios del otro equipo…"). */
  message: string
}

declare module 'claude-code' {
  interface PluginState {
    'mi-barra': {
      mood: Mood
      usage: Usage
      /** Fin del último turno principal que leyó o escribió caché (ms de época). */
      cacheAt: number | null
      /** Reloj de la barra: se mueve cada TICK_MS para redibujar los tiempos. */
      now: number
      /** Último status.json leído; null = no hay (equipo sin espacio de trabajo). */
      sync: SyncStatus | null
      /** «Seguir aquí»: la fila de contexto queda plegada hasta este número de tokens; null = visible. */
      plegadoHasta: number | null
      /** El toast de rojo está listo para sonar (se re-arma al bajar o sin dato). */
      toastArmado: boolean
      /** Plan B de «Cerrar tanda»: el texto que no cupo en el prompt y espera «Copiar». */
      copiaPendiente: string | null
      /** La etapa leída del proyecto; null = la lectura aún no terminó. */
      etapa: EtapaLeida | null
      /**
       * El texto de etapa que viaja a Claude en esta sesión, congelado la primera vez que termina la lectura:
       * null = aún sin congelar; `texto: ''` = sesión sin etapa; `adjuntado` = ya viajó en el primer prompt.
       */
      t5: { texto: string; adjuntado: boolean } | null
      /** `clock.now()` del primer `session.start` (ms de época); 0 = sin fijar. */
      arranque: number
      /** «Ignorar» en la fila de las dos semanas de uso real. */
      dosSemanasIgnorado: boolean
      /** La skill que arrancó pidiendo su propia sesión; null = sin aviso (la fila se calcula al dibujar). */
      escalada: Escalada | null
    }
  }
}
