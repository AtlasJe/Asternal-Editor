const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,dispatch}=require('../engine/runtime/preview.js');
const scene=()=>({nodes:[{id:'sprite',type:'sprite',name:'Sprite',x:0,y:0},{id:'event',type:'on-update'},{id:'move',type:'move',name:'Mover',target:'sprite',dx:100,dy:20}],connections:[{from:'event',port:'out',to:'move'}]});
test('el grafo ejecuta movimiento según delta y no por número de frames',()=>{
 const a=scene(),b=scene();dispatch(a,'on-update',1);for(let i=0;i<10;i++)dispatch(b,'on-update',.1);
 assert.equal(a.nodes[0].x,b.nodes[0].x);assert.equal(a.nodes[0].y,20);
});
test('detecta referencias rotas y ciclos',()=>{
 const s=scene();s.nodes[2].target='missing';assert.match(validate(s).join(),/destino/);
 s.connections.push({from:'move',port:'out',to:'event'});assert.match(validate(s).join(),/ciclo/);
});
test('una condición solo ejecuta su rama correspondiente',()=>{
 const s={nodes:[{id:'start',type:'on-start'},{id:'branch',type:'branch',condition:false},{id:'s',type:'sprite',x:0},{id:'a',type:'set-property',target:'s',property:'x',value:10},{id:'b',type:'set-property',target:'s',property:'x',value:20}],connections:[{from:'start',port:'out',to:'branch'},{from:'branch',port:'true',to:'a'},{from:'branch',port:'false',to:'b'}]};
 dispatch(s,'on-start');assert.equal(s.nodes[2].x,20);
});
test('la entrada solo responde a la tecla elegida',()=>{
 const s=scene();s.nodes[1].type='on-input';s.nodes[1].key='Space';
 dispatch(s,'on-input',.5,'KeyA');assert.equal(s.nodes[0].x,0);dispatch(s,'on-input',.5,'Space');assert.equal(s.nodes[0].x,50);
});
