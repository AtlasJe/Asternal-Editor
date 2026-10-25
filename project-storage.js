(() => {
  const allowed = new Set(['list','get','save','create','rename','remove','restore']);
  const store = BuildaStore.createStore(localStorage);
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.channel !== 'builda-storage') return;
    const {requestId,method,args=[]} = event.data;
    try {
      let result;
      if (method === 'initialize') {
        if (localStorage.getItem(BuildaStore.key) === null && localStorage.getItem('builda-engine-projects') === null) {
          const legacy = args[0] || {};
          for (const [key,value] of Object.entries(legacy)) {
            if (key === BuildaStore.key || key === 'builda-engine-projects' || key.startsWith('builda-project-')) localStorage.setItem(key,value);
          }
        }
        result = true;
      } else {
        if (!allowed.has(method)) throw Error('Acción de almacenamiento no válida.');
        result = store[method](...args);
      }
      parent.postMessage({channel:'builda-storage',requestId,result},'*');
    } catch (error) { parent.postMessage({channel:'builda-storage',requestId,error:error.message},'*'); }
  });
  window.addEventListener('storage',()=>parent.postMessage({channel:'builda-storage',changed:true},'*'));
})();
