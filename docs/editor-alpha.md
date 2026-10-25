# Editor Alpha: funciones y límites

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

## Editor de tiles

La herramienta original de Builda se abre desde el proyecto y conserva su mapa
por separado. Se sincroniza automáticamente al editar y antes de cerrar.
El mapa todavía no se renderiza en la vista de juego del nuevo runtime.
Los nombres de recursos originales pueden mantener el idioma del paquete.

## Pendiente

El motor sigue en Alpha. No hay todavía publicación real en Builda, exportación
.bg, físicas completas, editor de código personalizado ni renderizado de mapas
en la vista de juego. builda.publish.json es un borrador sin validar contra el
contrato oficial y no se debe presentar como integración de publicación terminada.

## Verificación

Desde la raíz:

    node --test tests/project-store.test.cjs tests/preview.test.cjs

Para desarrollar con servidor local:

    python -m http.server 8000 --bind 127.0.0.1

Abrir http://127.0.0.1:8000/ . La biblioteca de proyectos del navegador pertenece
a esa dirección; cambiar de file:// a localhost utiliza otro almacenamiento.
