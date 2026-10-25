// Optional parent-editor integration. Standalone map editing keeps its original flow.
export async function connectProject() {
  const params = new URLSearchParams(location.search), project = params.get('project');
  if (params.get('embed') !== '1' || !project || window.parent === window) return null;
  const text = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(Error('No se pudo conectar el mapa con el proyecto. Vuelve a abrir la herramienta.')); }, 8000);
    function receive(event) {
      if (event.source !== parent || event.data?.type !== 'builda-map-load' || event.data.project !== project) return;
      clearTimeout(timer); window.removeEventListener('message', receive); resolve(event.data.text);
    }
    window.addEventListener('message', receive);
    parent.postMessage({type:'builda-map-request',project},'*');
  });
  return {
    text,
    watch(getText) {
      let previous = text;
      function send(close = false) {
        const current = getText();
        if (current === previous && !close) return;
        previous = current;
        parent.postMessage({type:'builda-map-save',project,text:current,close},'*');
      }
      window.addEventListener('message', event => {
        if (event.source === parent && event.data?.project === project && event.data.type === 'builda-map-flush') send(true);
      });
      parent.postMessage({type:'builda-map-ready',project},'*');
      setInterval(() => send(), 350);
    }
  };
}
