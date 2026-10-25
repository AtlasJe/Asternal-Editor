// Optional standalone payload. Normal web builds continue to load packs over HTTP.
export const offlineData=()=>globalThis.__TILEMAP_OFFLINE__;
const key=folder=>`tilemap:offline-pack:${folder}`;
export function offlineManifest(pack){
  try{
    const saved=JSON.parse(localStorage.getItem(key(pack.folder)));
    if(saved?.base===JSON.stringify(pack.manifest))return saved.manifest;
  }catch{}
  return structuredClone(pack.manifest);
}
export function rememberOfflineManifest(folder,manifest){
  const pack=offlineData()?.packs.find(p=>p.folder===folder);if(!pack)return;
  try{localStorage.setItem(key(folder),JSON.stringify({base:JSON.stringify(pack.manifest),manifest}));}catch{}
}
