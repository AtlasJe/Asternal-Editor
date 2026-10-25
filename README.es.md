# Builda Engine 2D

La entrada de la aplicación es index.html. El listado empieza vacío; crea un
proyecto para entrar al editor de escenas, lógica y recursos.
Funciones actuales y límites: [Editor Alpha](docs/editor-alpha.md).

Editor web de mapas y base para un motor de juegos 2D compatible con Builda H5.

## Abrir sin servidor

Abre index.html para Proyectos. El archivo
[build/tilemap-editor.html](build/tilemap-editor.html) abre solamente la herramienta
de mapas independiente. Para guardar mapas con tu juego, entra desde Editor de
tiles dentro de un proyecto.

## Ejecutar el editor fuente

Desde la raíz del proyecto:

```powershell
python -m http.server 8000
```

Después abre `http://localhost:8000/web/`.

El servidor local es necesario para que el navegador permita los módulos ES y las llamadas `fetch` que usa la versión fuente.

## Estructura propia

- `engine/`: ciclo de juego, input, renderer, física, audio y runtime.
- `scripts/nodes/`: definiciones reutilizables de nodos.
- `scripts/custom/`: scripts JavaScript personalizados.
- `scenes/`: escenas y conexiones de lógica.
- `assets/`: imágenes, audio, fuentes, tilemaps y datos.
- `build/`: archivos generados para exportación.

El editor de mapas de Builda conserva `shared/`, `web/`, `pixi/` y `packs/` porque sus formatos y rutas dependen de ellos.
