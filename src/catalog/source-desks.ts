import * as THREE from 'three';
import source from '../../assets-src/main-hall/editor-proxies.json';

/** Exact lightweight parts sampled from the existing Blender desk templates. */
export function createSourceDesk(variant:number,proxy:boolean):THREE.Group {
 const definition=source.variants[String(variant) as keyof typeof source.variants];
 if(!definition)throw new Error(`Missing measured hallDesk template ${variant}`);
 const group=new THREE.Group();group.name=`hallDesk:${variant}:${proxy?'editor':'archviz'}`;
 group.userData={assetId:'hallDesk',variant,mode:proxy?'editor':'archviz',dimensions:definition.dimensions,placement:'floor',sourceRoot:definition.sourceRoot,sourceExact:true};
 for(const part of definition.parts){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(part.uvs,2));
  // Blender stores diffuse RGB in linear space. Do not apply the sRGB transfer
  // twice, or replace the original white/gray/black component finishes.
  const color=new THREE.Color().setRGB(part.material.color[0],part.material.color[1],part.material.color[2],THREE.LinearSRGBColorSpace);
  const material=new THREE.MeshStandardMaterial({name:part.material.name,color,roughness:part.material.roughness,metalness:part.material.metalness});
  material.userData={owned:true,surface:part.material.surface,colorVariant:'original',sourcePbr:true,preserveOriginal:true,tintable:false};
  const mesh=new THREE.Mesh(geometry,material);mesh.name=part.name;mesh.castShadow=!proxy;mesh.receiveShadow=!proxy;mesh.userData={assetId:'hallDesk',sourceExact:true};group.add(mesh);
 }
 return group;
}
