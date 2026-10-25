# Engine

El motor propio se construye encima del editor de mapas de Builda.

- `core/`: ciclo principal y carga de proyecto.
- `renderer/`: Canvas2D, tilemaps, sprites y cámara.
- `input/`: acciones configurables para teclado, mouse y touch.
- `physics/`: colisiones y gravedad.
- `audio/`: reproducción y control de audio.
- `runtime/`: ejecución de escenas exportadas.

El paquete original conserva `shared/`, `web/`, `pixi/` y `packs/` porque sus imports relativos y su formato `.tilemap` dependen de esa estructura.
