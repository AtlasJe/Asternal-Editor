# Asternal Editor

Asternal Editor is an independent 2D game editor. Terrain, sprites, and the camera live in one scene; the editor has its own Canvas2D renderer and does not embed an external map editor.

## Run locally

From the project root:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`, create a project, and open **Scene**. Use **Paint** to draw terrain on the grid, **Objects** to select sprites, and **Add** to create objects and visual nodes. Changes save in the browser.

## Project structure

- `engine/core/`: scene model, game loop, and project loading.
- `engine/renderer/`: Canvas2D terrain, sprite, and camera rendering.
- `engine/input/`: keyboard and control input.
- `engine/runtime/`: visual graph execution.
- `scripts/nodes/`: visual events and actions.
- `scenes/`: game scenes.
- `assets/`: project resources.

Older map projects are converted to color cells; their original data remains in the project backup. Cell occupancy is preserved, while external tile textures are not.

Publishing and export are still in development.
