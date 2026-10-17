import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const overrides=JSON.parse(await fs.readFile(path.join(root,'assets-src/materials/overrides.json'),'utf8')).materials;
const target=path.join(root,'assets-src/materials/source_missing.json');
const old=JSON.parse(await fs.readFile(target,'utf8'));
const audit={...old,schemaVersion:2,checkedAt:'2026-10-17',status:'All five required production material roles have available sources. Four owned Fab/Quixel surfaces and one user-authorized local Megascans fabric are ingested.',
 auditedLocations:[...(old.auditedLocations??[]).map(entry=>entry.provider==='Available browser inventory'?{...entry,note:'Historical browser inventory only; superseded by successful native Epic Games Launcher access on 2026-10-17.'}:entry),
 {provider:'Native Epic Games Launcher / Fab using documented Computer Use @oai/sky',checkedAt:'2026-10-17',result:'Authorized My Library showed 517 ordinary entries and a Quixel collection entry point. Painted Plaster, Smooth Concrete, Oak Veneer and Painted Metal Door were specifically observed as Saved in library before Download Only; all four completed to On disk. No purchase, account login or new agreement.',downloadCache:'E:/ArchViz_Resources/FabDownloads/VaultCache'},
 {provider:'Fab My Library targeted furniture search',query:'sofa',checkedAt:'2026-10-17',result:'No products returned. No broad search, purchase or unrelated antique substitution.'}],
 available:overrides.map(m=>({target:m.id,sourceId:m.sourceId??'pjBoU0',source:m.sourceLabel,license:m.license,licenseEvidence:m.licenseEvidence,tileMeters:m.tileMeters,productionIncluded:true,sourceFiles:m.files})),
 missing:[],
 remainingLimits:[{target:'exact-original-floor-product',status:'Unknown; the smooth scan is calibrated to the photograph, not a claim to identify the installed commercial product.'},{target:'fabric-woven entitlement evidence',status:'Old local Bridge metadata does not encode the acquisition license. User authorized the local resource; no Fab Standard entitlement is claimed for sjfvce3c. Optional CC0 fabric remains configured.'},{target:'additional realistic sofa',status:'The targeted My Library search returned no items. Existing project-authored sofa geometry remains, without claiming a library model was obtained.'}],
 fallbacks:'Explicitly labelled Poly Haven CC0 plaster/floor/oak/fabric and original coating remain configured in sources.json. Current wall, floor, wood and metal production maps use the owned Fab sources, not those fallbacks.',
 productionManifest:'public/assets/materials/manifest.json',sourceMapping:'assets-src/materials/overrides.json',sourceRegistration:'node tools/register-fab-materials.mjs',
 heavyResourceRoot:'E:/ArchViz_Resources',references:['https://www.fab.com/eula','https://polyhaven.com/license']};
await fs.writeFile(target,JSON.stringify(audit,null,2));
// Keep the already encoded wall maps; refresh only their acquisition metadata.
const manifestPath=path.join(root,'public/assets/materials/manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
for(const source of overrides){const material=manifest.materials.find(m=>m.id===source.id);if(!material)continue;for(const key of ['sourceId','license','licenseEvidence','note','normalConvention','tileMeters','normalStrength'])if(source[key]!==undefined)material[key]=source[key];material.source=source.sourceLabel;material.sourceLabel=source.sourceLabel;}
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({materials:audit.available.map(m=>({id:m.target,sourceId:m.sourceId,tileMeters:m.tileMeters})),missing:audit.missing.length},null,2));
