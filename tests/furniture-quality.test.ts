import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAssetObject, disposeAssetObject } from '../src/catalog/geometry';
import { getAsset, getVariant } from '../src/catalog/catalog';

// These tests inspect surfaces visible to a ray, not the generator's primitive
// counts. Parts are recovered from welded triangle connectivity, so supports
// remain independently testable after the production draw-call merge.
const assets: THREE.Group[] = [], temporary: THREE.BufferGeometry[] = [];
const doubleSide = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const frontSide = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
function model(id: string, variant = 1): THREE.Group {
  const group = createAssetObject(id, variant, getAsset(id).materials[0].id, 'archviz');
  group.updateMatrixWorld(true); assets.push(group); return group;
}
afterEach(() => { assets.splice(0).forEach(disposeAssetObject); temporary.splice(0).forEach(g => g.dispose()); });
function meshes(object: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) result.push(child); }); return result;
}
function key(point: THREE.Vector3): string { return [point.x, point.y, point.z].map(v => Math.round(v * 1e6)).join(','); }
type Part = { bounds: THREE.Box3; points: THREE.Vector3[]; triangles: THREE.Triangle[]; mesh: THREE.Mesh; source: THREE.Mesh; indices: number[]; volume: number };
function parts(object: THREE.Object3D): Part[] {
  const result: Part[] = [];
  for (const source of meshes(object)) {
    const position = source.geometry.getAttribute('position'), index = source.geometry.index;
    const nodes = new Map<string, number>(), parent: number[] = [], points: THREE.Vector3[] = [], corners: number[] = [], original: number[] = [];
    function find(i: number): number { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function join(a: number, b: number): void { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
    for (let i = 0; i < (index?.count ?? position.count); i++) {
      const originalIndex = index ? index.getX(i) : i;
      const point = new THREE.Vector3().fromBufferAttribute(position, originalIndex).applyMatrix4(source.matrixWorld), k = key(point);
      let node = nodes.get(k);
      if (node === undefined) { node = points.length; nodes.set(k, node); points.push(point); parent.push(node); }
      corners.push(node); original.push(originalIndex);
      if (i % 3 === 2) { join(corners[i - 2], corners[i - 1]); join(corners[i - 1], corners[i]); }
    }
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < corners.length; i += 3) { const root = find(corners[i]), bucket = buckets.get(root) ?? []; bucket.push(i); buckets.set(root, bucket); }
    for (const bucket of buckets.values()) {
      const triangles: THREE.Triangle[] = [], ids = new Set<number>(), indices: number[] = [], array: number[] = []; let volume = 0;
      for (const first of bucket) {
        const vertices = [0, 1, 2].map(offset => { const node = corners[first + offset]; ids.add(node); indices.push(original[first + offset]); return points[node]; });
        const [a, b, c] = vertices;
        // Degenerate cap/seam triangles do not affect surface connectivity.
        const triangle = new THREE.Triangle(a, b, c);
        if (triangle.getArea() > 1e-12) { triangles.push(triangle); volume += a.dot(b.clone().cross(c)) / 6; }
        vertices.forEach(vertex => array.push(vertex.x, vertex.y, vertex.z));
      }
      if (!triangles.length) continue;
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(array, 3)); temporary.push(geometry);
      const mesh = new THREE.Mesh(geometry, doubleSide); mesh.updateMatrixWorld(true);
      const unique = [...ids].map(id => points[id]);
      result.push({ bounds: new THREE.Box3().setFromPoints(unique), points: unique, triangles, mesh, source, indices, volume });
    }
  }
  return result;
}
function cast(targets: THREE.Object3D[], origin: THREE.Vector3, direction: THREE.Vector3, far = 10): THREE.Intersection[] {
  return new THREE.Raycaster(origin, direction.clone().normalize(), 0, far).intersectObjects(targets, false);
}
const triangleBounds = new WeakMap<THREE.Triangle, THREE.Box3>();
function triangleBox(triangle: THREE.Triangle): THREE.Box3 {
  let bounds = triangleBounds.get(triangle);
  if (!bounds) { bounds = new THREE.Box3().expandByPoint(triangle.a).expandByPoint(triangle.b).expandByPoint(triangle.c); triangleBounds.set(triangle, bounds); }
  return bounds;
}
function near(a: Part, b: Part, tolerance = .012): boolean {
  if (!a.bounds.clone().expandByScalar(tolerance).intersectsBox(b.bounds)) return false;
  const closest = new THREE.Vector3();
  const sample = (from: Part, to: Part): boolean => {
    const step = Math.max(1, Math.floor(from.points.length / 384));
    for (let i = 0; i < from.points.length; i += step) for (const triangle of to.triangles) {
      triangle.closestPointToPoint(from.points[i], closest);
      if (closest.distanceToSquared(from.points[i]) <= tolerance * tolerance) return true;
    }
    return false;
  };
  if (sample(a, b) || sample(b, a)) return true;
  // Two long solids can physically cross without any endpoint near the other
  // surface (e.g. a footrest spoke starting inside the centre column). Test
  // actual surface-edge crossings as well; never inflate the contact tolerance.
  const ray = new THREE.Ray(), direction = new THREE.Vector3(), hit = new THREE.Vector3();
  function crosses(from: THREE.Triangle, to: THREE.Triangle): boolean {
    for (const [start, end] of [[from.a, from.b], [from.b, from.c], [from.c, from.a]]) {
      direction.copy(end).sub(start); const length = direction.length();
      if (length < 1e-9) continue;
      ray.set(start, direction.divideScalar(length));
      if (ray.intersectTriangle(to.a, to.b, to.c, false, hit) && hit.distanceToSquared(start) <= (length + 1e-7) ** 2) return true;
    }
    return false;
  }
  for (const first of a.triangles) for (const second of b.triangles) {
    if (triangleBox(first).intersectsBox(triangleBox(second)) && (crosses(first, second) || crosses(second, first))) return true;
  }
  return false;
}
function connectedToFrame(piece: Part, pieces: Part[], frame: Set<number>): boolean {
  const visited = new Set<number>(), queue = [pieces.indexOf(piece)];
  while (queue.length) {
    const i = queue.shift()!; if (visited.has(i)) continue; visited.add(i);
    if (frame.has(i)) return true;
    for (let j = 0; j < pieces.length; j++) if (!visited.has(j) && near(pieces[i], pieces[j])) queue.push(j);
  }
  return false;
}

describe('Production furniture surface and structural quality', () => {
  it.each([
    ['coffeeTable', 1], ['coffeeTable', 2], ['coffeeTable', 3], ['coffeeTable', 5],
    ['meetingTable', 1], ['meetingTable', 2], ['meetingTable', 3],
    ['sideTable', 1], ['sideTable', 2], ['windowBar', 1], ['windowBar', 3],
  ] as const)('%s:%i has a tabletop over every standing support, without a visible air gap', (id, variant) => {
    const group = model(id, variant), height = getVariant(id, variant).dimensions[1], pieces = parts(group);
    const tops = pieces.filter(part => { const size = part.bounds.getSize(new THREE.Vector3()); return size.y < .085 && size.x > .15 && size.z > .15 && part.bounds.max.y > height - .015; });
    expect(tops.length, `${id}:${variant}: tabletop surface`).toBeGreaterThan(0);
    const supports = pieces.filter(part => { const size = part.bounds.getSize(new THREE.Vector3()); return size.y > height * .45 && part.bounds.min.y < height * .3 && part.bounds.max.y > height * .85; });
    expect(supports.length, `${id}:${variant}: standing supports`).toBeGreaterThan(0);
    for (const support of supports) {
      const center = support.bounds.getCenter(new THREE.Vector3());
      const hits = cast(tops.map(top => top.mesh), new THREE.Vector3(center.x, 0, center.z), new THREE.Vector3(0, 1, 0), height + .05);
      expect(hits.length, `${id}:${variant}: support at ${center.x.toFixed(3)},${center.z.toFixed(3)} must be inside the top outline`).toBeGreaterThan(0);
      const underside = Math.min(...hits.map(hit => hit.point.y));
      expect(underside - support.bounds.max.y, `${id}:${variant}: support/underside gap in metres`).toBeLessThanOrEqual(.002);
      expect(support.bounds.max.y, `${id}:${variant}: support must not break through the usable top`).toBeLessThan(height - .004);
    }
  });

  it.each([1, 2, 3])('barStool:%i footrest is connected through real geometry to its load-bearing frame', variant => {
    const pieces = parts(model('barStool', variant));
    const footrests = pieces.filter(part => { const size = part.bounds.getSize(new THREE.Vector3()), center = part.bounds.getCenter(new THREE.Vector3()); return center.y > .20 && center.y < .40 && size.y < .055 && Math.max(size.x, size.z) > .1; });
    expect(footrests.length, 'a usable footrest surface').toBeGreaterThan(0);
    const frame = new Set(pieces.map((part, i) => part.bounds.min.y < .15 && part.bounds.max.y > .55 ? i : -1).filter(i => i >= 0));
    for (const footrest of footrests) {
      expect(connectedToFrame(footrest, pieces, frame), `barStool:${variant}: floating footrest at ${footrest.bounds.getCenter(new THREE.Vector3()).toArray()}`).toBe(true);
    }
  });

  it.each([1, 3])('procedural chair:%i backrest is attached to the seat/frame', variant => {
    const group = model('chair', variant), [width, height] = getVariant('chair', variant).dimensions, pieces = parts(group);
    const back = pieces.filter(part => { const size = part.bounds.getSize(new THREE.Vector3()); return part.bounds.min.y > .4 && part.bounds.max.y > height - .06 && size.x > width * .6 && size.y > .2; });
    expect(back.length, 'a full-sized backrest').toBeGreaterThan(0);
    const frame = new Set(pieces.map((part, i) => part.bounds.min.y < .15 && part.bounds.max.y > .38 ? i : -1).filter(i => i >= 0));
    for (const part of back) expect(connectedToFrame(part, pieces, frame), `chair:${variant}: the back must have a real mounting path to the floor frame`).toBe(true);
  });

  it('the bent stool shell has outward winding and can be seen from above and in front', () => {
    const group = model('barStool', 2), shell = meshes(group).find(mesh => (mesh.material as THREE.Material).userData.surface === 'fabric')!;
    expect(shell).toBeDefined(); const solids = parts(shell);
    expect(solids.reduce((sum, part) => sum + part.volume, 0), 'a closed shell must not have inverted signed volume').toBeGreaterThan(.001);
    const above = cast([shell], new THREE.Vector3(0, .95, .08), new THREE.Vector3(0, -1, 0), .4);
    expect(above.length).toBeGreaterThan(0); expect(above[0].point.y, 'the visible upper seat, not its lower inside face').toBeGreaterThan(.735);
    expect(cast([shell], new THREE.Vector3(0, .9, .5), new THREE.Vector3(0, 0, -1), 1).length).toBeGreaterThan(0);
  });

  it.each([1, 2])('floorLamp:%i shade remains visible from its inner cavity and from outside', variant => {
    const group = model('floorLamp', variant), [width, height] = getVariant('floorLamp', variant).dimensions;
    for (let i = 0; i < 8; i++) {
      const direction = new THREE.Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)), inside = new THREE.Vector3(0, height * .92, 0);
      const inner = cast(meshes(group), inside, direction, width * .6);
      expect(inner.some(hit => hit.point.clone().sub(inside).length() > width * .15), `floorLamp:${variant}: missing inside wall at angle ${i}`).toBe(true);
      const outer = cast(meshes(group), inside.clone().addScaledVector(direction, width), direction.clone().negate(), width);
      expect(outer.length, `floorLamp:${variant}: missing exterior`).toBeGreaterThan(0);
    }
  });

  it.each([['pouf', 1], ['coffeeTable', 1], ['meetingTable', 1], ['sideTable', 1]] as const)('%s:%i circular outline has less than 0.8 mm silhouette error between radial samples', (id, variant) => {
    const group = model(id, variant), [diameter, height] = getVariant(id, variant).dimensions, radius = diameter / 2;
    const y = id === 'pouf' ? height * .55 : height - .014;
    for (let i = 0; i < 137; i++) {
      const angle = (i + .371) / 137 * Math.PI * 2, outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const hits = cast(meshes(group), new THREE.Vector3(0, y, 0).addScaledVector(outward, radius + .1), outward.clone().negate(), radius * 2 + .2);
      expect(hits.length).toBeGreaterThan(0);
      const r = Math.hypot(hits[0].point.x, hits[0].point.z);
      expect(Math.abs(radius - r), `${id}:${variant}: polygonal outer silhouette`).toBeLessThan(.0008);
    }
  });

  it('round upholstery wraps continuously in physical metres instead of changing projection on each quadrant', () => {
    const group = model('pouf', 1), [diameter, height] = getVariant('pouf', 1).dimensions, radius = diameter / 2, circumference = Math.PI * diameter;
    const samples: THREE.Vector2[] = [];
    for (let i = 0; i <= 80; i++) {
      const angle = (i + .17) / 80 * Math.PI * 2, out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const hit = cast(meshes(group), new THREE.Vector3(0, height * .5, 0).addScaledVector(out, radius + .1), out.clone().negate(), .2)[0];
      expect(hit?.uv).toBeDefined(); samples.push(hit.uv!);
    }
    for (let i = 1; i < samples.length; i++) {
      const raw = Math.abs(samples[i].x - samples[i - 1].x), arc = circumference / 80, du = Math.min(raw, Math.abs(circumference - raw));
      expect(du / arc, 'continuous angular UV scale').toBeGreaterThan(.92);
      expect(du / arc, 'no stretched quadrant seam').toBeLessThan(1.08);
      expect(Math.abs(samples[i].y - samples[i - 1].y), 'a level fabric ring must keep its V coordinate').toBeLessThan(.0001);
    }
  });

  it.each([1, 2, 3, 4])('sofa:%i has a continuous rear backing rather than a deep opening under its cushions', variant => {
    const group = model('sofa', variant), [width, height, depth] = getVariant('sofa', variant).dimensions;
    for (const x of [-width * .2, 0, width * .2]) {
      const hits = cast(meshes(group), new THREE.Vector3(x, height * .45, -depth / 2 - .15), new THREE.Vector3(0, 0, 1), depth);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.z, `sofa:${variant}: rear frame must fill the gap, not expose a seat 15 cm deeper`).toBeLessThan(-depth / 2 + .08);
    }
  });

  it.each([1, 2, 3, 4])('sofa:%i has a comfortable continuous seat surface without isolated decorative ridges', variant => {
    const group = model('sofa', variant), width = getVariant('sofa', variant).dimensions[0], heights: number[] = [];
    // Sample the central working area of one cushion, clear of the deliberate
    // perimeter welt, split between cushions and rounded front/back edges.
    for (let i = 0; i <= 17; i++) {
      const hits = cast(meshes(group), new THREE.Vector3(-width * .23, 1.2, .02 + i * .01), new THREE.Vector3(0, -1, 0), 1.2);
      expect(hits.length).toBeGreaterThan(0); heights.push(hits[0].point.y);
    }
    expect(Math.max(...heights) - Math.min(...heights), `sofa:${variant}: a narrow raised bar must not protrude through the upholstery`).toBeLessThan(.003);
  });

  it('the laptop display has a closed visible rear and a usable backwards viewing tilt', () => {
    const pieces = parts(model('accessory', 2));
    const display = pieces.filter(part => { const size = part.bounds.getSize(new THREE.Vector3()); return size.x > .2 && size.y > .12 && (part.source.material as THREE.Material).userData.surface === 'metal'; }).sort((a, b) => b.bounds.getSize(new THREE.Vector3()).y - a.bounds.getSize(new THREE.Vector3()).y)[0];
    expect(display, 'a real display casing').toBeDefined();
    display.mesh.material = frontSide;
    const center = display.bounds.getCenter(new THREE.Vector3());
    expect(cast([display.mesh], center.clone().add(new THREE.Vector3(0, 0, -1)), new THREE.Vector3(0, 0, 1), 2).length, 'visible opaque rear cover').toBeGreaterThan(0);
    expect(cast([display.mesh], center.clone().add(new THREE.Vector3(0, 0, 1)), new THREE.Vector3(0, 0, -1), 2).length, 'visible front casing').toBeGreaterThan(0);
    expect(display.volume, 'closed outward-facing display casing').toBeGreaterThan(.0001);
    const normal = new THREE.Vector3(), weighted = new THREE.Vector3(); let area = 0;
    for (const triangle of display.triangles) { triangle.getNormal(normal); const a = triangle.getArea(); if (normal.z > .8 && a > .00005) { weighted.addScaledVector(normal, a); area += a; } }
    weighted.divideScalar(area);
    expect(weighted.y, 'front normal tilts upwards for a backwards-leaning screen').toBeGreaterThan(.06);
    expect(weighted.y).toBeLessThan(.6);
  });
});
