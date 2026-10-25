import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assemblePack,validAssetPath} from '../shared/pack-meta.js';
export function readPack(directory){
  const root=directory instanceof URL?directory:pathToFileURL(path.resolve(directory)+path.sep);
  const header=JSON.parse(fs.readFileSync(new URL('pack.meta',root)));
  if(!Array.isArray(header.assets)||header.assets.some(p=>!validAssetPath(p)))throw Error('Invalid metadata index');
  return assemblePack(header,Object.fromEntries(header.assets.map(path=>[path,JSON.parse(fs.readFileSync(new URL(path,root)))])));
}
