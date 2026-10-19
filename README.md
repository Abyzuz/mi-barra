# mi-barra

Mod de Claude Code: una barra sobre el prompt con cuatro indicadores y una mascota pixel-art animada.

- **Contexto usado**, **límite de 5 h** y **límite semanal**: los porcentajes que reporta la API. Si un dato no llega, dice "no disponible".
- **Caché**: "hace X", el último uso (dato real), y un restante **estimado** con `~`. La API no informa la duración del caché; se supone en `CACHE_TTL_MS` al inicio de `hooks/register.tsx` (1 h por defecto).
- **Mascota**: pensando, escribiendo (saca su notebook), esperando tu permiso, terminado e inactivo.

Sin red, sin procesos externos, sin escribir archivos: solo lee `$.session.usage()` y los eventos de la sesión.

En la app de escritorio se dibuja con SVG; en el terminal, como una línea de texto.

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
