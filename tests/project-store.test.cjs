const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore}=require('../project-store.js');
function memory(entries={}){const data=new Map(Object.entries(entries));return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
test('una instalación limpia no crea ni escribe proyectos',()=>{
 const storage=memory(),store=createStore(storage);
 assert.deepEqual(store.list(),[]);assert.equal(store.get('builda-2d'),null);assert.equal(storage.data.size,0);
});
test('crear, renombrar, recargar, borrar el último y restaurar conserva los datos',()=>{
 const storage=memory(),store=createStore(storage);let p=store.create('Mi juego');
 p.nodes.push({id:'sprite',type:'sprite',name:'Jugador'});p=store.save(p);
 store.rename(p.id,'Juego renombrado');
 const reloaded=createStore(storage);assert.equal(reloaded.get(p.id).name,'Juego renombrado');assert.equal(reloaded.get(p.id).nodes.length,1);
 reloaded.remove(p.id);assert.deepEqual(createStore(storage).list(),[]);assert.equal(store.get(p.id),null);
 reloaded.restore(p.id);assert.equal(store.get(p.id).nodes.length,1);
});
test('un proyecto eliminado no se recrea desde una pestaña vieja',()=>{
 const store=createStore(memory()),p=store.create('A');store.remove(p.id);
 assert.throws(()=>store.save(p),/ya no existe/);assert.equal(store.list().length,0);
});
test('rechaza guardados de revisiones antiguas',()=>{
 const store=createStore(memory()),p=store.create('A'),old=store.get(p.id);
 store.rename(p.id,'Nuevo');assert.throws(()=>store.save(old),/otra pestaña/);assert.equal(store.get(p.id).name,'Nuevo');
});
test('migra proyectos antiguos y sus nodos sin fabricar el ejemplo implícito',()=>{
 const storage=memory({'builda-engine-projects':JSON.stringify([{id:'builda-2d',name:'Ejemplo'},{id:'real',name:'Real'}]),'builda-project-real':JSON.stringify({name:'Real',nodes:[{id:'s',type:'sprite'}]})});
 const store=createStore(storage);assert.equal(store.list().length,1);assert.equal(store.get('real').nodes.length,1);
 store.rename('real','Editado');assert.equal(createStore(storage).get('real').name,'Editado');assert.ok(storage.getItem('builda-project-real'));
});
test('un JSON corrupto se reporta sin sobrescribirlo',()=>{
 const storage=memory({'builda-workspace-v2':'{roto'});assert.throws(()=>createStore(storage).list());assert.equal(storage.getItem('builda-workspace-v2'),'{roto');
});
test('un error de cuota nunca informa de guardado correcto',()=>{
 const storage=memory(),store=createStore(storage);const p=store.create('A');storage.setItem=()=>{throw Error('QuotaExceeded');};
 assert.throws(()=>store.rename(p.id,'B'),/almacenamiento/);assert.equal(store.get(p.id).name,'A');
});
