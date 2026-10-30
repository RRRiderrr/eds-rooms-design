import * as THREE from 'three';
import { assetUrl } from './architecture';
import type { QualitySettings } from '../quality';

interface Source {id:string;position:[number,number,number];direction:[number,number,number];colorLinear:[number,number,number];length:number;group?:string;}
/** Fixed fixtures: camera movement never changes light positions or output. */
export class DirectLighting {
 readonly group=new THREE.Group();
 private lamps:THREE.SpotLight[]=[];private revision='';
 constructor(){this.group.name='Runtime_Direct_Lighting';}
 async load(){
  const manifest=await fetch(assetUrl('assets/architecture/runtime-lighting.json')).then(r=>{if(!r.ok)throw new Error('Не вдалося завантажити світильники');return r.json();});
  for(const lamp of this.lamps){lamp.removeFromParent();lamp.target.removeFromParent();lamp.dispose();}
  this.lamps=(manifest.lights as Source[]).map(source=>{
   const room=source.group==='central-room';
   const lamp=new THREE.SpotLight(0xffffff,room?15:32,room?6.5:8,1.18,.82,2);
   lamp.name=source.id;lamp.position.set(...source.position);lamp.target.position.copy(lamp.position).add(new THREE.Vector3(...source.direction));
   lamp.color.setRGB(...source.colorLinear);lamp.userData.sourceId=source.id;
   // Wide fixture cones need a small PCF footprint: radius 3 sampled the wall's
   // own depth at grazing angles, producing horizontal bands on plain paint.
   lamp.shadow.camera.near=.3;lamp.shadow.camera.far=lamp.distance;lamp.shadow.bias=-.0001;lamp.shadow.normalBias=.012;lamp.shadow.radius=1.5;
   this.group.add(lamp,lamp.target);return lamp;
  });this.revision='';
 }
 update(_camera:THREE.Camera,quality:QualitySettings){
  if(this.revision===quality.level)return false;this.revision=quality.level;
  const high=new Set(['Room_Lamp_Inner_East_North_Area','Room_Lamp_Inner_West_South_Area','Hall_Lamp_Central_01_Area','Hall_Lamp_Central_03_Area','Hall_Lamp_Central_06_Area','Hall_Lamp_Central_08_Area']);
  const medium=new Set(['Room_Lamp_Inner_East_North_Area','Hall_Lamp_Central_03_Area']);
  for(const lamp of this.lamps){
   lamp.castShadow=quality.shadows&&(quality.level==='high'?high:medium).has(lamp.name);
   // A previous High tier may have allocated six large shadow maps. Release
   // maps for lights that no longer cast shadows, especially after mobile
   // quality adaptation. A later promotion recreates them on the next render.
   if(!lamp.castShadow&&lamp.shadow.map){lamp.shadow.map.dispose();lamp.shadow.map=null;}
   // Keep metre-scale receiver accuracy in both shadowed tiers. Medium has
   // only two shadow casters; High has six. Low does not render shadow maps.
   const size=2048;
   if(lamp.shadow.mapSize.x!==size){lamp.shadow.map?.dispose();lamp.shadow.map=null;lamp.shadow.mapSize.set(size,size);}
  }
  return true;
 }
 get needsShadowRender(){return this.lamps.some(lamp=>lamp.castShadow&&!lamp.shadow.map);}
 dispose(){for(const lamp of this.lamps)lamp.dispose();this.group.clear();this.lamps=[];}
}
