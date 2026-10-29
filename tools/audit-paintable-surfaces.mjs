/** Derive paint limits from the preserved source mesh inventory and verify them
 * against actual exported triangle positions. Never opens or mutates Blender. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { Matrix3, Matrix4, Vector3, Box3 } from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const inventory = await read('assets-src/main-hall/live-inventory.json');
const layout = await read('public/assets/architecture/hall-layout.json');
const byName = new Map(inventory.objects.map(o => [o.name, o]));
const center = layout.sourceCenter;
const toApp = ([x,y,z]) => [x-center[0],z,-(y-center[1])];
const boxOf = source => {
  const box = new Box3();
  for (const x of [source.bounds.min[0],source.bounds.max[0]])
    for (const y of [source.bounds.min[1],source.bounds.max[1]])
      for (const z of [source.bounds.min[2],source.bounds.max[2]]) box.expandByPoint(new Vector3(...toApp([x,y,z])));
  return box;
};
const rounded = value => Number(value.toFixed(7));
const jsonBox = box => ({min:box.min.toArray().map(rounded),max:box.max.toArray().map(rounded)});
const io = new NodeIO();
const documents = [];
for (const relative of ['public/assets/architecture/space.glb','public/assets/architecture/room.glb']) {
  const data = await fs.readFile(path.join(root, relative));
  const document = await io.readBinary(data);
  documents.push({relative,sha256:createHash('sha256').update(data).digest('hex'),document});
}
const triangles = [];
for (const {relative,document} of documents) {
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const transform = new Matrix4().fromArray(node.getWorldMatrix());
    const normalTransform = new Matrix3().getNormalMatrix(transform);
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial()?.getName() ?? '';
      if (!/^(?:01_WALLS|15_WALLS|08_CEILING_STEEL|13_SKIRTING)/.test(material)) continue;
      const positions = primitive.getAttribute('POSITION');
      const normals = primitive.getAttribute('NORMAL');
      const indices = primitive.getIndices()?.getArray();
      const count = indices?.length ?? positions.getCount();
      for (let i=0;i<count;i+=3) {
        const points = [], ns = [];
        for (let j=0;j<3;j++) {
          const index = indices?.[i+j] ?? i+j;
          points.push(new Vector3().fromArray(positions.getArray(),index*3).applyMatrix4(transform));
          if(normals) ns.push(new Vector3().fromArray(normals.getArray(),index*3).applyMatrix3(normalTransform).normalize());
        }
        triangles.push({file:relative,node:node.getName(),material,points,normals:ns});
      }
    }
  }
}
function evidenceFor(source,materialPrefix,nodeName) {
  const bounds = boxOf(source), tolerant = bounds.clone().expandByScalar(.00003);
  const matching = triangles.filter(t=>t.material.startsWith(materialPrefix)
    && (!nodeName || t.node===nodeName) && t.points.every(p=>tolerant.containsPoint(p)));
  const actual = new Box3();
  matching.forEach(t=>t.points.forEach(p=>actual.expandByPoint(p)));
  assert(matching.length>0,`${source.name}: no triangles in exported GLBs`);
  assert(actual.min.distanceTo(bounds.min)<.00004&&actual.max.distanceTo(bounds.max)<.00004,
    `${source.name}: exported/source bounds differ`);
  return {triangles:matching.length,files:[...new Set(matching.map(t=>t.file))],bounds:jsonBox(actual)};
}
function derive(id,sourceNumber,wall) {
  const name = `Wall_${sourceNumber}_Clean`, steelName = `Wall_${sourceNumber}_Top_Steel_Beam`;
  const plaster = byName.get(name), steel = byName.get(steelName);
  assert(plaster&&steel,`${id}: missing source wall or beam`);
  const skirtings = inventory.objects.filter(o=>o.name.startsWith(`Wall_${sourceNumber}_Skirting_`));
  assert(skirtings.length,`${id}: missing source skirting`);
  const plasterBounds=boxOf(plaster),steelBounds=boxOf(steel);
  const minY = Math.max(...skirtings.map(s=>boxOf(s).max.y));
  const maxY = Math.min(plasterBounds.max.y,steelBounds.min.y);
  const wallTriangles = triangles.filter(t=>t.node===name&&t.material.startsWith(plaster.materials[0].startsWith('15')?'15_WALLS':'01_WALLS'));
  const axisIndex=wall.axis==='x'?0:2;
  const front=wallTriangles.filter(t=>t.points.every(p=>Math.abs(p.getComponent(axisIndex)-wall.coordinate)<.00003));
  const expectedNormal = new Vector3(...wall.normal);
  assert(front.length,`${id}: real wall-facing triangles not found`);
  assert(front.some(t=>t.normals.some(n=>n.dot(expectedNormal)>.99)),`${id}: expected wall-facing normal not found`);
  assert(maxY>minY,`${id}: no paintable interval`);
  return {
    minY:rounded(minY),maxY:rounded(maxY),sourceNode:name,steelNode:steelName,
    axis:wall.axis,coordinate:rounded(wall.coordinate),normal:wall.normal,
    material:plaster.materials[0],
    proof:{plaster:evidenceFor(plaster,plaster.materials[0],name),steel:evidenceFor(steel,'08_CEILING_STEEL'),
      skirtingTop:rounded(minY),skirtingSources:skirtings.map(s=>s.name),frontTriangles:front.length,
      rule:'Paint existing plaster only above the skirting and below the separate steel beam underside.'}
  };
}
const hall={};
for(const wall of layout.hallWalls) hall[wall.id]=derive(wall.id,wall.id.slice(5),wall);
const meeting={};
for(const wall of layout.meetingRoom.walls) meeting[wall.id]=derive(wall.id,wall.sourceWallId.slice(5),wall);
const report={schemaVersion:1,units:'metres',sourceFile:layout.sourceFile,coordinateSystem:'app Y-up',
  sourceInventory:'assets-src/main-hall/live-inventory.json',
  geometryFiles:documents.map(({relative,sha256})=>({path:relative,sha256})),hall,meeting};
await fs.writeFile(path.join(root,'assets-src/main-hall/paintable-surfaces.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({hall:Object.fromEntries(Object.entries(hall).map(([id,s])=>[id,[s.minY,s.maxY]])),meeting:Object.fromEntries(Object.entries(meeting).map(([id,s])=>[id,[s.minY,s.maxY]])),verifiedExportedTriangles:true},null,2));
