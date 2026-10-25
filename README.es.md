# Asternal Editor 2D

Asternal Editor es un editor experimental de juegos 2D. La entrada de la aplicación es index.html. El listado empieza vacío; crea un
proyecto para entrar al editor. Mapa es la vista principal; Escena, Lógica y
Recursos están en la navegación superior.
Funciones actuales y límites: [Editor Alpha](docs/editor-alpha.md).

Asternal Editor es un editor experimental de juegos 2D. Incluye una herramienta de mapas basada en el editor de Builda; la publicación en Builda H5 todavía no está implementada.

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
