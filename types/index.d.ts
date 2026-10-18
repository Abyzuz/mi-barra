/** Estado de la sesión que la mascota dibuja. */
export type Mood = 'pensando' | 'escribiendo' | 'permiso' | 'terminado' | 'inactivo'

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
  fiveHour: Limit | null
  week: Limit | null
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
    }
  }
}
