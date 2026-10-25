(function(root) {
  const definitions = [
    { id:'sprite', name:'Sprite', category:'scene', description:'Imagen o rectángulo en la escena', icon:'image' },
    { id:'camera', name:'Cámara 2D', category:'scene', description:'Encuadre de la escena', icon:'camera' },
    { id:'on-start', name:'Al iniciar', category:'event', description:'Una vez al ejecutar', icon:'play', outputs:['out'] },
    { id:'on-update', name:'Cada fotograma', category:'event', description:'Durante la ejecución', icon:'loop', outputs:['out'] },
    { id:'on-input', name:'Al pulsar tecla', category:'event', description:'Una vez por pulsación', icon:'input', outputs:['out'] },
    { id:'move', name:'Mover objeto', category:'action', description:'Velocidad en píxeles por segundo', icon:'move', inputs:['in'], outputs:['out'] },
    { id:'set-property', name:'Cambiar propiedad', category:'action', description:'Posición, tamaño o color', icon:'sliders', inputs:['in'], outputs:['out'] },
    { id:'branch', name:'Condición', category:'action', description:'Separa verdadero y falso', icon:'branch', inputs:['in'], outputs:['true','false'] }
  ];
  const paths = {
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
    camera:'<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="4"/><path d="M8 6V3h8v3"/>',
    play:'<path d="m8 4 12 8-12 8z"/>',
    loop:'<path d="M20 7a9 9 0 0 0-15-2L2 8m0-6v6h6M4 17a9 9 0 0 0 15 2l3-3m0 6v-6h-6"/>',
    input:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h2m3 0h2m3 0h2M6 13h2m3 0h2m3 0h2M8 16h8"/>',
    move:'<path d="M12 2v20M2 12h20m-13-7 3-3 3 3m-6 14 3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
    sliders:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>',
    branch:'<path d="M5 3v12a5 5 0 0 0 5 5h9M5 9h9a5 5 0 0 0 5-5M16 3l3-1 2 3m-5 12 3 3-3 3"/>',
    layers:'<path d="m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 16l10 5 10-5"/>'
  };
  root.AsternalNodes = { definitions, icon: name => '<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.layers)+'</svg>' };
  if(typeof module!=='undefined') module.exports=root.AsternalNodes;
})(globalThis);
