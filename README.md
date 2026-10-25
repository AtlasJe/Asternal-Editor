# Asternal Editor

Editor experimental de juegos 2D que funciona en el navegador. Crea proyectos, edita el mapa directamente en el espacio principal, arma una escena con sprites y conecta nodos visuales para definir comportamientos. La interfaz y esta documentación están en español.

> **Estado: Alpha · v0.1.0.** Es un prototipo en desarrollo. La vista previa de escenas y la lógica básica funcionan; todavía faltan varias funciones de un motor completo.

## Abrir Asternal Editor

- **Probar localmente:** sirve la carpeta con Python y abre el editor en el navegador.
- **Probar en línea:** después de publicar este repositorio con GitHub Pages, abre `https://<usuario>.github.io/<repositorio>/`.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Luego visita <http://127.0.0.1:8000/>. No requiere instalación de paquetes para usar el editor. El servidor local evita las restricciones del navegador al trabajar con archivos locales y permite que Proyectos, Editor y la herramienta de mapas compartan el almacenamiento.

## Funciones disponibles

- Crear, buscar, renombrar y eliminar proyectos; recuperar una eliminación reciente.
- Pintar y organizar el mapa en la vista principal, con guardado dentro del proyecto.
- Editar una escena 2D con sprites, posición, tamaño, color e imágenes importadas.
- Construir lógica conectando nodos de eventos y acciones.
- Ejecutar una vista previa aislada y usar deshacer/rehacer.
- Guardar proyectos en el almacenamiento local del navegador.

No se necesita IA para usar Asternal Editor. La publicación directa en Builda H5 aún no está implementada.

## Publicar como GitHub Pages

El repositorio incluye un workflow que publica la raíz del proyecto en GitHub Pages cuando hay cambios en `main` o `master`, o cuando se ejecuta manualmente.

1. Sube este proyecto a un repositorio de GitHub.
2. En el repositorio, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación.
3. En **Actions**, permite los workflows si GitHub lo solicita.
4. Haz push a `main` (o `master`) y espera a que termine **Deploy GitHub Pages**.
5. Abre la URL que GitHub muestra en **Settings → Pages**.

Si el repositorio se llama `usuario.github.io`, la URL será `https://usuario.github.io/`. Para los demás repositorios suele ser `https://usuario.github.io/nombre-del-repositorio/`. La primera publicación requiere configurar Pages en GitHub; el workflow por sí solo no puede activar esa opción del repositorio.

## Uso y datos

Los proyectos se guardan en el almacenamiento del navegador, en el origen desde el que se abre Asternal Editor. `localhost`, GitHub Pages y `file://` tienen bibliotecas separadas; cambiar de dirección no mueve automáticamente tus proyectos. Exportar/importar proyectos como archivo todavía está pendiente.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `index.html`, `dashboard.*` | Inicio y biblioteca de proyectos |
| `editor.html`, `editor.*` | Editor de escenas, recursos y lógica visual |
| `engine/` | Bases del runtime: ciclo, entrada, renderizado, física y vista previa |
| `scripts/nodes/` | Definiciones de nodos disponibles |
| `scripts/custom/` | Espacio para scripts personalizados |
| `scenes/` | Escenas y datos del proyecto |
| `assets/` | Recursos del motor |
| `build/`, `web/`, `pixi/`, `shared/`, `packs/` | Herramientas y recursos del editor de mapas integrado |
| `docs/` | Alcance actual, límites y documentación conservada del editor de mapas |

## Documentación y desarrollo

- [Funciones y límites de la Alpha](docs/editor-alpha.md)
- [Documentación anterior del editor de mapas](docs/tilemap-base.md)
- [Guía de assets](tools/README.md)

Las pruebas automatizadas del almacenamiento y la vista previa se pueden ejecutar con:

```sh
node --test tests/project-store.test.cjs tests/preview.test.cjs
```

## Contribuir

Los reportes de errores y propuestas son bienvenidos. Incluye los pasos para reproducir el problema, el navegador usado y qué esperabas que ocurriera. Antes de contribuir, revisa los límites actuales de la Alpha.
