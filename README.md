# mi-barra

Mod de Claude Code: una barra sobre el prompt con seis indicadores, una mascota pixel-art animada y el flujo de trabajo por etapas.

- **Etapa**: en qué etapa está el proyecto (`spec`, `plan`, `ejecucion`, `final` o `uso`), con el proyecto debajo y, en uso real, "día N de 14". Sin etapa dice "sin etapa".
- **Contexto**: los tokens usados en la sesión, en verde, ámbar o rojo según los umbrales. Desde ámbar, una fila propone cerrar la tanda («Cerrar tanda», «Seguir aquí»); en rojo el botón pasa a primario y la fila da los turnos de equilibrio.
- **Límite de 5 h** y **límite semanal**: los porcentajes que reporta la API. Si un dato no llega, dice "no disponible".
- **Sync**: el estado de la sincronización de `~/claude-workspace` (wsync), leído de `~/.claude/workspace/status.json`; no aparece si ese archivo no existe.
- **Caché**: "hace X", el último uso (dato real), y un restante **estimado** con `~`. La API no informa la duración del caché; se supone en `CACHE_TTL_MS` al inicio de `hooks/register.tsx` (1 h por defecto).
- **Mascota**: pensando, escribiendo (saca su notebook), esperando tu permiso, terminado e inactivo.

Sin red y sin procesos externos. Lo único que escribe es `.claude/etapa.json` (con `/etapa` o con el botón «Marcar»); el resto lo lee de `$.session.usage()` y de los eventos de la sesión.

## Umbrales

En `/config` → mi-barra: `ambar` (defecto 150000) y `rojo` (defecto 200000), en tokens de contexto. Valores inválidos (no enteros positivos, o `ambar` no menor que `rojo`) vuelven a los defectos.

## Comandos

- `/tanda`: deja en el cuadro del prompt el texto para cerrar la tanda según la etapa (misma acción que el botón «Cerrar tanda»). Sin cuadro, deja el texto en la fila con un botón «Copiar»; nada se copia solo.
- `/etapa <etapa> [nombre]`: fija la etapa (`spec|plan|ejecucion|final|uso`) y, opcional, el nombre del proyecto. Escribe `.claude/etapa.json` en la raíz del árbol principal del repo, aunque la sesión esté en un worktree; el archivo se versiona con el proyecto.
- `/etapa` sin argumento: muestra la etapa y el texto exacto que Claude recibe al empezar la sesión, como contexto del primer mensaje.

## Aviso de escalada

Si una sesión arranca un brainstorm, un plan o una ejecución (`brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, con o sin prefijo `<plugin>:`) y la etapa no es la que corresponde, la barra lo avisa y ofrece marcar o pasar a la etapa, o pedir una sesión nueva.

La barra avisa, el usuario decide: nada se envía solo. Los botones («Marcar», «Pasar a {Etapa}») solo escriben `.claude/etapa.json`, o dejan texto en el cuadro del prompt; el envío es siempre tuyo.

En la app de escritorio se dibuja con SVG y no se oculta ningún indicador: cada uno es un anillo con el valor dentro y la etiqueta debajo (la pista queda en el texto alternativo), todos en una fila; si no caben, los últimos bajan a una segunda. En el terminal es una línea de texto, que el terminal corta al final si no cabe.

## Instalar

En la línea de comandos de una sesión de terminal:

```
/plugin install mi-barra --marketplace Abyzuz/mi-barra
```

Desde una shell:

```
claude plugin install mi-barra --marketplace Abyzuz/mi-barra
```

En la app de escritorio, donde `/plugin` no corre: haz clic en **+** junto al cuadro del prompt, luego **Plugins**, **Add marketplace** con `Abyzuz/mi-barra` y después **Add plugin**.

## Probar sin instalar

```
claude --plugin-dir <carpeta del mod>
```

o, para la app de escritorio, la variable de entorno `CLAUDE_CODE_PLUGIN_DIRS=<carpeta del mod>` y reiniciar la app.

## Verificar

```
claude plugin validate .
claude plugin test .
```
