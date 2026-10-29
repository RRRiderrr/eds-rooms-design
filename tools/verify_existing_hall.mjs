/** Validate the exported files, rather than trusting exporter metadata alone. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { Box3, Matrix4, Vector3 } from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'));
const layout = await read('public/assets/architecture/hall-layout.json');
const manifest = await read('public/assets/architecture/hall-desk-manifest.json');
const proxySource = await read('assets-src/main-hall/editor-proxies.json');
const preserved = await read('assets-src/main-hall/source-preservation.json');
const io = new NodeIO();
const checks = [];
const near = (a, b, tolerance = .00002) => Math.abs(a - b) <= tolerance;
const actualBounds = (document) => {
  const box = new Box3();
  let vertices = 0;
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const transform = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      assert(positions, 'Every exported part must have positions');
      const normals = primitive.getAttribute('NORMAL');
      assert(normals && normals.getCount() === positions.getCount(), 'Normal data must match positions');
      const values = positions.getArray();
      const n = normals.getArray();
      for (let i = 0; i < values.length; i += 3) {
        assert(Number.isFinite(values[i]) && Number.isFinite(values[i+1]) && Number.isFinite(values[i+2]));
        box.expandByPoint(new Vector3(values[i], values[i+1], values[i+2]).applyMatrix4(transform));
        assert(near(Math.hypot(n[i], n[i+1], n[i+2]), 1, .002), 'No invalid or zero-length exported normals');
        vertices++;
      }
      const material = primitive.getMaterial();
      assert(material?.getExtras().sourcePbr === true, 'All original part finishes must survive the GLB round trip');
      assert(['metal', 'plastic'].includes(material.getExtras().surface));
      assert(material.getExtras().preserveOriginal === true);
    }
  }
  return { box, vertices };
};

assert.equal(layout.originalTables.length, 26);
assert.equal(new Set(layout.originalTables.map(t => t.id)).size, 26);
assert.equal(new Set(layout.staticSourceMeshes).size, 78);
assert.deepEqual(layout.staticFurnitureNodes, ['Space_existingFurniture']);
assert.equal(layout.doors.length, 14);
assert(layout.doors.some(d => d.id === 'door-15'), 'The connected west vestibule faces the main hall');
assert(!layout.doors.some(d => d.id === 'door-01'), 'Door 01 is behind closed hall-facing boundaries');

for (const entry of manifest.assets) {
  const b = new Box3(new Vector3(...entry.bounds.min), new Vector3(...entry.bounds.max));
  for (const kind of ['production', 'proxy']) {
    const file = path.join(root, 'public', entry[kind]);
    const actual = actualBounds(await io.read(file));
    assert(actual.box.min.distanceTo(b.min) < .00002 && actual.box.max.distanceTo(b.max) < .00002, `${kind} variant ${entry.variant}: Y-up dimensions/origin changed`);
    checks.push({variant:entry.variant, kind, vertices:actual.vertices, dimensions:actual.box.getSize(new Vector3()).toArray(), bytes:(await fs.stat(file)).size});
  }
  const sync = proxySource.variants[String(entry.variant)];
  const syncBox = new Box3();
  for (const part of sync.parts) {
    assert.equal(part.positions.length, part.normals.length);
    assert.equal(part.uvs.length, part.positions.length / 3 * 2);
    for (let i=0;i<part.positions.length;i+=3) syncBox.expandByPoint(new Vector3(...part.positions.slice(i,i+3)));
  }
  assert(syncBox.min.distanceTo(b.min)<.00002 && syncBox.max.distanceTo(b.max)<.00002, 'Synchronous Editor geometry must retain real source dimensions');
  for (const instance of layout.originalTables.filter(t => t.variant === entry.variant)) {
    const transform = new Matrix4().makeRotationY(instance.rotation);
    transform.setPosition(...instance.position);
    const placed = b.clone().applyMatrix4(transform);
    assert(placed.min.distanceTo(new Vector3(...instance.worldBounds.min))<.00002 && placed.max.distanceTo(new Vector3(...instance.worldBounds.max))<.00002, `${instance.id}: saved transforms do not reconstruct source world bounds`);
  }
}

for (const door of layout.doors) {
  const wall = layout.hallWalls.find(w => w.id === door.wallId);
  assert(wall, `${door.id}: missing anchor wall`);
  assert.deepEqual(door.normal, wall.normal);
  const normal = new Vector3(0,0,1).applyAxisAngle(new Vector3(0,1,0), door.rotation);
  assert(normal.distanceTo(new Vector3(...wall.normal))<.000001, `${door.id}: front must face the main hall`);
  const axis = wall.axis === 'x' ? 0 : 2;
  const along = axis === 0 ? 2 : 0;
  const occupied = [];
  for (const anchor of [door.plaque, door.colorElement]) {
    assert(near(anchor.position[axis], wall.coordinate + wall.normal[axis]*(anchor.dimensions[2]/2+.008)), `${door.id}: anchor is not beside the real wall face`);
    assert(anchor.position[1]-anchor.dimensions[1]/2 >= -.00001, 'Signage cannot sink below the floor');
    assert(anchor.position[1]+anchor.dimensions[1]/2 <= wall.height, 'Signage must remain on the wall');
    const interval = [anchor.position[along]-anchor.dimensions[0]/2, anchor.position[along]+anchor.dimensions[0]/2];
    assert(interval[0] >= wall.min && interval[1] <= wall.max, `${door.id}: anchor overhangs a wall end`);
    for (const opening of wall.openings) assert(interval[1] <= opening.min || interval[0] >= opening.max, `${door.id}: anchor overlaps door opening ${opening.id}`);
    occupied.push(interval);
  }
  assert(occupied[0][1] <= occupied[1][0] || occupied[1][1] <= occupied[0][0], 'Plaque and vertical panel must not overlap');
}
assert.equal(preserved.allMeshAndMatrixHashesUnchanged, true);
assert.equal(preserved.objectsBefore, preserved.objectsAfter);
assert.equal(preserved.selectionUnchanged, true);
assert.equal(preserved.liveFileUnchanged, true);

const report = {ok:true, tables:26, sourceMeshParts:78, sourceTemplates:3, hallFacingDoors:14, besideDoorAnchors:28, originalGeometryUnchanged:true, exports:checks};
await fs.writeFile(path.join(root,'assets-src/main-hall/artifact-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
