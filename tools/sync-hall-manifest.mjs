import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),file=path.join(root,'public/assets/models/manifest.json');
const main=JSON.parse(await readFile(file,'utf8')),hall=JSON.parse(await readFile(path.join(root,'public/assets/architecture/hall-desk-manifest.json'),'utf8'));
const keys=new Set(hall.assets.map(a=>`${a.assetId}:${a.variant}`));
main.assets=[...main.assets.filter(a=>!keys.has(`${a.assetId}:${a.variant}`)),...hall.assets];
await writeFile(file,JSON.stringify(main,null,2));console.log(`Registered ${hall.assets.length} exact source desk templates; other production overrides preserved.`);
