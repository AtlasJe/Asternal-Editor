import { createColorPicker } from './color-picker.js';
// Map metadata is independent of the map's cell extents.
export function createMapSettings({ map, onOpen, onApply }) {
  const make = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const entry = make('button', { id: 'map-settings-entry', type: 'button', title: 'Ajustes del mapa', className: 'icon',
    innerHTML: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h2M12 7h8M4 17h8M18 17h2"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg>' });
  entry.setAttribute('aria-label', 'Ajustes del mapa');
  const dialog = make('dialog', { id: 'map-settings' });
  dialog.setAttribute('aria-label', 'Ajustes del mapa');
  const name = make('input', { type: 'text', required: true, maxLength: 80 });
  const size = make('input', { type: 'number', required: true, min: 8, max: 128, step: 1 });
  const background = make('button', { type: 'button', className: 'map-background-color' });
  background.setAttribute('aria-label', 'Color de fondo');
  const colorDialog = make('dialog', { id: 'map-background-picker' });
  colorDialog.setAttribute('aria-label', 'Selector de color de fondo');
  const setColor = color => { background.value = color; background.style.background = color; };
  background.addEventListener('click', () => {
    colorDialog.replaceChildren(createColorPicker(background.value, color => {
      setColor(color);
      colorDialog.close();
    }));
    colorDialog.showModal();
  });
  colorDialog.addEventListener('click', e => {
    const r = colorDialog.getBoundingClientRect();
    if (e.target === colorDialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) colorDialog.close();
  });
  colorDialog.addEventListener('keydown', e => e.stopPropagation());
  const close = make('button', { type: 'button', className: 'map-settings-close', title: 'Cerrar ajustes del mapa',
    innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' });
  close.setAttribute('aria-label', 'Cerrar ajustes del mapa');
  const apply = make('button', { type: 'button', textContent: 'Aplicar' });
  const form = make('form', {}, [
    make('header', {}, [make('h3', { textContent: 'Ajustes del mapa' }), close]),
    make('label', {}, [make('span', { textContent: 'Nombre del mapa' }), name]),
    make('label', {}, [make('span', { textContent: 'Tamaño del tile' }), make('div', { className: 'number-with-unit' }, [size, make('small', { textContent: 'px' })])]),
    make('label', {}, [make('span', { textContent: 'Color de fondo' }), background]),
    make('p', { textContent: 'Cambiar el tamaño conserva el mapa y lo vuelve a cargar; el historial de deshacer se limpia.' }),
    make('footer', {}, [apply]),
  ]);
  name.addEventListener('input', () => name.setCustomValidity(name.value.trim() ? '' : '请输入地图名'));
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', e => e.stopPropagation());
  const applyChanges = e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    onApply({ name: name.value.trim(), tileSize: Number(size.value), backgroundColor: background.value });
    dialog.close();
  };
  apply.addEventListener('click', applyChanges);
  form.addEventListener('submit', applyChanges);
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') applyChanges(e);
  });
  entry.addEventListener('click', () => {
    onOpen();
    name.value = map.name ?? '未命名地图';
    name.setCustomValidity('');
    size.value = map.tileSize;
    setColor(map.backgroundColor);
    dialog.showModal();
  });
  dialog.append(form);
  document.body.append(entry, dialog, colorDialog);
}
