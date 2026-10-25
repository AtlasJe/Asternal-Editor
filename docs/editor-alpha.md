# Asternal Editor Alpha: funciones y límites

La aplicación empieza en index.html. No crea proyectos al abrirse.

## Proyectos

- Crear y renombrar desde el menú de proyectos.
- Renombrar desde el título del editor.
- Eliminar con confirmación; Deshacer recupera el proyecto eliminado.
- Buscar por nombre.
- Los proyectos antiguos reales se migran conservando sus datos originales.
- El almacenamiento se centraliza en project-storage.html para que las páginas
  compartan datos incluso cuando el navegador separa localStorage por archivo.
- Un editor abierto no recrea un proyecto borrado; avisa si otra pestaña lo cambia.
- Si falla el guardado se muestra Sin guardar y se advierte antes de salir.

## Escena y lógica

- Sprites con posición, tamaño, color e imagen; cámara como origen de vista.
- Arrastrar objetos, editar propiedades, eliminar, deshacer y rehacer.
- Grafo con eventos Al iniciar, Cada fotograma y Al pulsar tecla.
- Acciones Mover objeto, Cambiar propiedad y Condición.
- Unir salida y entrada con dos clics o arrastrando entre puertos.
- Clic en una conexión para quitarla.
- Ejecutar usa una copia de la escena: Detener restaura la edición.
- La ejecución informa de destinos faltantes, ciclos y nodos sin runtime.
- Importar imágenes PNG, JPEG o WebP de hasta 2 MB y crear Sprites desde ellas.

## Escena y terreno

La escena es el único espacio de edición 2D. El terreno se pinta en celdas nativas de Asternal y comparte dimensiones, fondo y cámara con sprites y objetos. La vista previa dibuja tanto el terreno como los objetos.

Los proyectos con mapas anteriores se convierten a una paleta de colores básica; la ocupación se conserva y los datos de origen quedan en el respaldo del proyecto.
## Pendiente

El motor sigue en Alpha. La exportación, las físicas completas y los scripts personalizados siguen pendientes. La publicación para Builda H5 tampoco está implementada; `builda.publish.json` es un borrador sin validar contra el contrato oficial.

## Verificación

Desde la raíz:

    node --test tests/project-store.test.cjs tests/preview.test.cjs

Para desarrollar con servidor local:

    python -m http.server 8000 --bind 127.0.0.1

Abrir http://127.0.0.1:8000/ . La biblioteca de proyectos del navegador pertenece
a esa dirección; cambiar de file:// a localhost utiliza otro almacenamiento.
