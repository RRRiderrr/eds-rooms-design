import * as THREE from 'three';
import {assetUrl} from '../assets/materials';

// Shared editor maps; the production GLB embeds the same images and therefore
// remains self-contained when deployed on a static host.
const cache=new Map<string,THREE.Texture>();
export function editorPlanterTexture(name:'pothos-leaf'|'soil'):THREE.Texture|undefined {
 if(typeof document==='undefined')return undefined;
 let texture=cache.get(name);if(!texture){texture=new THREE.TextureLoader().load(assetUrl(`assets/materials/planter/${name}.png`));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;if(name==='soil')texture.wrapS=THREE.RepeatWrapping;texture.userData.shared=true;cache.set(name,texture);}return texture;
}
