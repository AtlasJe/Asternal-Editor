# Asternal Editor

Asternal Editor es un editor propio de juegos 2D. El terreno, los sprites y la cámara se editan dentro de la misma escena; no usa un editor de mapas externo.

## Abrir

Desde la raíz del proyecto ejecuta:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8000/`, crea un proyecto y entra a **Escena**. Usa **Pintar** para dibujar terreno sobre la cuadrícula, **Objetos** para seleccionar sprites y **Añadir** para crear objetos y nodos. Los cambios se guardan en el navegador.

## Motor propio

- `engine/core/`: modelo de escena, ciclo de juego y carga de proyecto.
- `engine/renderer/`: renderizado Canvas2D de terreno, sprites y cámara.
- `engine/input/`: lectura de teclado y controles.
- `engine/runtime/`: ejecución del grafo visual.
- `scripts/nodes/`: eventos y acciones del editor visual.
- `scenes/`: escenas del juego.
- `assets/`: recursos propios del proyecto.

Los proyectos con mapas antiguos se convierten a celdas de color y conservan los datos originales en el respaldo del proyecto. La conversión mantiene la ocupación de las celdas, pero no las texturas externas del formato anterior.

La publicación y exportación todavía están en desarrollo.
