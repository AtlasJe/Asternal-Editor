(function(root) {
  function validate(project) {
    const errors=[];
    const nodes=new Map(project.nodes.map(n=>[n.id,n]));
    for(const node of project.nodes) {
      if(['move','set-property'].includes(node.type)&&nodes.get(node.target)?.type!=='sprite') errors.push(node.name+': elige un Sprite como destino.');
      if(!['sprite','camera','on-start','on-update','on-input','move','set-property','branch'].includes(node.type)) errors.push(node.name+': este tipo antiguo todavía no tiene ejecución.');
    }
    const edges=project.connections||[], visiting=new Set(),done=new Set();
    function visit(id) {
      if(visiting.has(id)) return true;
      if(done.has(id)) return false;
      visiting.add(id);
      for(const edge of edges.filter(e=>e.from===id)) if(visit(edge.to)) return true;
      visiting.delete(id);done.add(id);return false;
    }
    if(project.nodes.some(n=>visit(n.id))) errors.push('El grafo contiene un ciclo. Usa Cada fotograma para repetir acciones.');
    if(edges.some(e=>!nodes.has(e.from)||!nodes.has(e.to))) errors.push('Hay conexiones con nodos que ya no existen.');
    return errors;
  }
  function dispatch(project,type,delta=0,key='') {
    const byId=new Map(project.nodes.map(n=>[n.id,n]));
    function run(id,depth=0) {
      if(depth>200) throw Error('El grafo superó el límite de ejecución.');
      const node=byId.get(id); if(!node) return;
      const target=byId.get(node.target);let port='out';
      if(node.type==='move'&&target) {target.x=(Number(target.x)||0)+(Number(node.dx)||0)*delta;target.y=(Number(target.y)||0)+(Number(node.dy)||0)*delta;}
      if(node.type==='set-property'&&target&&['x','y','width','height','color'].includes(node.property)) target[node.property]=node.property==='color'?node.value:Number(node.value)||0;
      if(node.type==='branch') port=node.condition?'true':'false';
      for(const edge of project.connections.filter(e=>e.from===id&&e.port===port)) run(edge.to,depth+1);
    }
    project.nodes.filter(n=>n.type===type&&(type!=='on-input'||n.key===key)).forEach(n=>run(n.id));
  }
  root.AsternalRuntime={validate,dispatch};
  if(typeof module!=='undefined') module.exports=root.AsternalRuntime;
})(globalThis);
