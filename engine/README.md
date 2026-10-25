# Motor de Asternal

El editor y el runtime usan código propio. La escena es la fuente única para el terreno, los sprites, la cámara y las dimensiones.

- `core/`: modelo de escena, carga de proyecto y ciclo principal.
- `renderer/`: cuadrícula de Canvas2D, celdas de terreno, sprites y cámara.
- `input/`: acciones configurables para teclado, mouse y touch.
- `physics/`: espacio para colisiones y gravedad.
- `audio/`: espacio para reproducción y control de audio.
- `runtime/`: ejecución de la lógica visual.

El renderer dibuja las mismas celdas en el editor y en la prueba de juego. Los mapas anteriores se convierten a una paleta de colores; el proyecto conserva una copia de sus datos originales.
