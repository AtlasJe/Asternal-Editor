(function (root) {
  'use strict';
  const KEY = 'builda-workspace-v2';
  const copy = value => JSON.parse(JSON.stringify(value));
  const id = () => root.crypto?.randomUUID?.() || `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function createStore(storage) {
    function read() {
      const raw = storage.getItem(KEY);
      if (raw !== null) {
        const data = JSON.parse(raw);
        if (data.version !== 2 || !Array.isArray(data.projects)) throw Error('El archivo local de proyectos está dañado. No se ha sobrescrito.');
        return data;
      }
      // Migrar proyectos existentes; nunca crear el antiguo ejemplo implícito.
      const index = JSON.parse(storage.getItem('builda-engine-projects') || '[]');
      if (!Array.isArray(index)) throw Error('El listado antiguo de proyectos no es válido.');
      const projects = [];
      for (const entry of index) {
        if (!entry || typeof entry.id !== 'string' || !entry.name) continue;
        const stored = storage.getItem(`builda-project-${entry.id}`);
        if (entry.id === 'builda-2d' && stored === null) continue;
        const detail = JSON.parse(stored || '{}');
        projects.push(normalize({ ...detail, id: entry.id, name: detail.name || entry.name }));
      }
      return { version: 2, projects, trash: [] };
    }
    function write(data) {
      try { storage.setItem(KEY, JSON.stringify(data)); }
      catch { throw Error('No se pudo guardar: el almacenamiento está lleno o bloqueado. Mantén esta pestaña abierta hasta resolverlo.'); }
    }
    function normalize(project) {
      return { ...project, id: project.id, name: String(project.name || 'Sin título').slice(0, 48),
        revision: project.revision || 0, updatedAt: project.updatedAt || Date.now(),
        nodes: Array.isArray(project.nodes) ? project.nodes.filter(n => n && typeof n.id === 'string') : [],
        connections: Array.isArray(project.connections) ? project.connections : [],
        assets: Array.isArray(project.assets) ? project.assets : [],
        scene: { width: 960, height: 540, background: '#1c2023', tileSize: 32, tiles: {}, ...project.scene } };
    }
    function get(projectId) { const project = read().projects.find(p => p.id === projectId); return project ? copy(normalize(project)) : null; }
    function save(project) {
      const data = read(), index = data.projects.findIndex(p => p.id === project.id);
      if (index < 0) throw Error('El proyecto ya no existe. Vuelve a Proyectos.');
      if ((data.projects[index].revision || 0) !== project.revision) throw Error('El proyecto cambió en otra pestaña. Recarga antes de seguir editando.');
      const result = normalize({ ...project, revision: project.revision + 1, updatedAt: Date.now() });
      data.projects[index] = result; write(data); return copy(result);
    }
    return {
      list: () => copy(read().projects.map(normalize).sort((a, b) => b.updatedAt - a.updatedAt)), get, save,
      create(name) {
        const trimmed = String(name).trim();
        if (!trimmed) throw Error('Escribe un nombre para el proyecto.');
        const data = read(), project = normalize({ id: id(), name: trimmed, nodes: [] });
        data.projects.unshift(project); write(data); return copy(project);
      },
      rename(projectId, name) {
        const project = get(projectId);
        if (!project) throw Error('El proyecto ya no existe.');
        if (!String(name).trim()) throw Error('Escribe un nombre.');
        project.name = String(name).trim().slice(0, 48); return save(project);
      },
      remove(projectId) {
        const data = read(), project = data.projects.find(p => p.id === projectId);
        if (!project) throw Error('El proyecto ya no existe.');
        data.projects = data.projects.filter(p => p.id !== projectId);
        data.trash = [...(data.trash || []).slice(-9), project]; write(data);
      },
      restore(projectId) {
        const data = read(), project = (data.trash || []).find(p => p.id === projectId);
        if (!project || data.projects.some(p => p.id === projectId)) throw Error('No se pudo restaurar el proyecto.');
        data.projects.push(project); data.trash = data.trash.filter(p => p.id !== projectId); write(data);
      }
    };
  }
  async function connect() {
    if (typeof document === 'undefined') return createStore(root.localStorage);
    const frame = document.createElement('iframe'); frame.hidden = true;
    frame.src = 'project-storage.html';
    const waiting = new Map(); let sequence = 0;
    function request(method, args = []) {
      return new Promise((resolve, reject) => {
        const requestId = ++sequence;
        const timer = setTimeout(() => { waiting.delete(requestId); reject(Error('El almacenamiento no responde. Recarga la página.')); }, 10000);
        waiting.set(requestId, { resolve, reject, timer });
        frame.contentWindow.postMessage({ channel:'asternal-storage', requestId, method, args }, '*');
      });
    }
    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow || event.data?.channel !== 'asternal-storage') return;
      if (event.data.changed) { window.dispatchEvent(new Event('asternal-storage-changed')); return; }
      const pending = waiting.get(event.data.requestId); if (!pending) return;
      waiting.delete(event.data.requestId); clearTimeout(pending.timer);
      if (event.data.error) pending.reject(Error(event.data.error)); else pending.resolve(event.data.result);
    });
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('No se pudo abrir el almacenamiento compartido.')), 10000);
      frame.onload = () => { clearTimeout(timer); resolve(); };document.body.append(frame);
    });
    // Trasladar los datos de la página antigua una sola vez, conservando el original.
    const legacy = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === KEY || key === 'builda-engine-projects' || key.startsWith('builda-project-')) legacy[key] = localStorage.getItem(key);
    }
    await request('initialize',[legacy]);
    return Object.fromEntries(['list','get','save','create','rename','remove','restore'].map(method => [method,(...args) => request(method,args)]));
  }
  root.AsternalStore = { createStore, connect, id, key:KEY };
  if (typeof module !== 'undefined') module.exports = root.AsternalStore;
})(globalThis);
