(async () => {
let store;
const $ = selector => document.querySelector(selector);
const dialog = $('#projectDialog'), form = $('#projectForm');
let editingId = null, projects = [];
const folderIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5h6l2 2h10v12H3z"/></svg>';

function report(message, undo) {
  const host = $('#dashboardMessage');
  host.replaceChildren(document.createTextNode(message)); host.hidden = false;
  if (undo) { const button = document.createElement('button'); button.textContent = 'Deshacer'; button.onclick = undo; host.append(button); }
}
async function refresh() {
  try { projects = await store.list(); render(); }
  catch (error) { report(error.message); }
}
function openProject(project) { location.href = 'editor.html?project=' + encodeURIComponent(project.id); }
function closeMenus() { document.querySelectorAll('.project-menu').forEach(menu => menu.remove()); }
function render() {
  closeMenus();
  const term = $('#search').value.trim().toLocaleLowerCase('es');
  const filtered = projects.filter(p => p.name.toLocaleLowerCase('es').includes(term));
  $('#projectGrid').replaceChildren(...filtered.map(card));
  $('#emptyState').hidden = filtered.length > 0;
  $('#emptyState h3').textContent = term ? 'No hay coincidencias' : 'Todavía no tienes proyectos';
  $('#emptyState p').textContent = term ? 'Prueba con otro nombre.' : 'Crea un proyecto vacío para empezar.';
  $('#emptyCreate').hidden = Boolean(term);
  $('#projectCount').textContent = projects.length + (projects.length === 1 ? ' proyecto guardado' : ' proyectos guardados');
}
function card(project) {
  const element = document.createElement('article'); element.className = 'project-card';
  element.innerHTML = '<div class="project-card-top"><span class="project-glyph">' + folderIcon + '</span><button class="more-button" aria-label="Opciones del proyecto" aria-expanded="false">···</button></div><h3></h3><p></p><div class="project-card-bottom"><span></span><button class="open-project">Abrir editor →</button></div>';
  element.querySelector('h3').textContent = project.name;
  element.querySelector('p').textContent = project.nodes.length + ' nodos · ' + project.assets.length + ' recursos';
  element.querySelector('.project-card-bottom span').textContent = new Date(project.updatedAt).toLocaleDateString('es');
  element.querySelector('.open-project').onclick = () => openProject(project);
  const more = element.querySelector('.more-button');
  more.onclick = () => {
    const wasOpen = Boolean(element.querySelector('.project-menu')); closeMenus();
    more.setAttribute('aria-expanded', String(!wasOpen));
    if (wasOpen) return;
    const menu = document.createElement('div'); menu.className = 'project-menu';
    for (const [label, action] of [['Renombrar', () => openDialog(project)], ['Eliminar', () => remove(project)]]) {
      const button = document.createElement('button'); button.textContent = label;
      if (label === 'Eliminar') button.className = 'danger';
      button.onclick = () => { closeMenus(); action(); }; menu.append(button);
    }
    element.querySelector('.project-card-top').append(menu); menu.firstElementChild.focus();
  };
  return element;
}
function openDialog(project = null) {
  editingId = project?.id || null;
  $('#dialogEyebrow').textContent = editingId ? 'PROYECTO' : 'NUEVO PROYECTO';
  $('#dialogTitle').textContent = editingId ? 'Renombrar proyecto' : 'Crear proyecto';
  $('#dialogSubmit').textContent = editingId ? 'Guardar nombre' : 'Crear proyecto';
  $('#projectName').value = project?.name || '';
  $('#dialogHint').textContent = 'Guardado en este navegador.';
  dialog.showModal(); $('#projectName').focus();
}
async function remove(project) {
  if (!confirm('¿Eliminar “' + project.name + '” de la lista de proyectos?')) return;
  try {
    await store.remove(project.id); await refresh();
    report('Proyecto eliminado.', async () => {
      try { await store.restore(project.id); await refresh(); $('#dashboardMessage').hidden = true; }
      catch (error) { report(error.message); }
    });
  } catch (error) { report(error.message); }
}
$('#newProject').onclick = () => openDialog();
$('#emptyCreate').onclick = () => openDialog();
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { dialog.close(); return; }
  const name = $('#projectName').value.trim();
  if (!name) { $('#dialogHint').textContent = 'Escribe un nombre para continuar.'; return; }
  $('#dialogSubmit').disabled = true;
  try {
    if (editingId) await store.rename(editingId, name); else await store.create(name);
    dialog.close(); await refresh();
  } catch (error) { $('#dialogHint').textContent = error.message; }
  finally { $('#dialogSubmit').disabled = false; }
});
$('#search').addEventListener('input', render);
document.addEventListener('click', event => { if (!event.target.closest('.more-button, .project-menu')) closeMenus(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenus(); });
window.addEventListener('builda-storage-changed', refresh);
try { store = await BuildaStore.connect(); await refresh(); }
catch (error) { report(error.message); }
})();
