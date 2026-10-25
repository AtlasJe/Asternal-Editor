(() => {
  const allowed = new Set(['list','get','save','create','rename','remove','restore']);
  const store = AsternalStore.createStore(localStorage);
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.channel !== 'asternal-storage') return;
    const {requestId,method,args=[]} = event.data;
    try {
      let result;
      if (method === 'initialize') {
        if (localStorage.getItem(AsternalStore.key) === null && localStorage.getItem('builda-engine-projects') === null) {
          const legacy = args[0] || {};
          for (const [key,value] of Object.entries(legacy)) {
            if (key === AsternalStore.key || key === 'builda-engine-projects' || key.startsWith('builda-project-')) localStorage.setItem(key,value);
          }
        }
        result = true;
      } else {
        if (!allowed.has(method)) throw Error('Acción de almacenamiento no válida.');
        result = store[method](...args);
      }
      parent.postMessage({channel:'asternal-storage',requestId,result},'*');
    } catch (error) { parent.postMessage({channel:'asternal-storage',requestId,error:error.message},'*'); }
  });
  window.addEventListener('storage',()=>parent.postMessage({channel:'asternal-storage',changed:true},'*'));
})();
