import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Check the deployable output, without Blender, a dev server, or a backend.
const root = path.resolve(import.meta.dirname, '../dist');
const checked = new Set();
async function requireFile(relative) {
  const file = path.resolve(root, relative);
  assert(file.startsWith(root + path.sep), `Asset escapes dist: ${relative}`);
  if (checked.has(file)) return;
  const stat = await fs.stat(file).catch(() => null);
  assert(stat?.isFile(), `Missing production asset: ${relative}`);
  checked.add(file);
}
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
assert(!/\/src\/.*\.(?:ts|tsx)/.test(html), 'Source index.html was published instead of dist/index.html');
const entrypoints = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
assert(entrypoints.some(url => /\.js$/.test(url)), 'Built JavaScript entrypoint is missing');
assert(entrypoints.some(url => /\.css$/.test(url)), 'Built stylesheet is missing');
for (const url of entrypoints) {
  assert(!url.startsWith('/') && !/^(?:https?:|file:)/.test(url), `Entrypoint must support project subpaths: ${url}`);
  await requireFile(decodeURIComponent(url.split(/[?#]/)[0]));
}
async function scan(value) {
  if (typeof value === 'string' && /^(?:\.\/)?assets\//.test(value)) await requireFile(value);
  else if (Array.isArray(value)) for (const item of value) await scan(item);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) await scan(item);
}
// Only runtime manifests: archived export metadata can legitimately reference
// heavy authoring files that Vite deliberately excludes from production.
for (const relative of [
  'architecture/room.json', 'architecture/scene-space.json',
  'architecture/probes.json', 'architecture/runtime-lighting.json',
  'environment/factory-panorama.json', 'materials/manifest.json',
  'models/manifest.json', 'thumbnails/manifest.json', 'preset-thumbnails/manifest.json',
]) {
  await requireFile('assets/' + relative);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'assets', relative), 'utf8'));
  // The light fixture export also retains obsolete planar-backdrop metadata;
  // runtime loads its independent factory-panorama manifest instead.
  if (relative === 'architecture/runtime-lighting.json') delete manifest.windowBackdrops;
  await scan(manifest);
}
for (const name of ['basis_transcoder.js', 'basis_transcoder.wasm']) await requireFile('assets/decoders/basis/' + name);
await requireFile('.nojekyll');
await requireFile('assets/architecture/scene-space.json');
await requireFile('assets/materials/manifest.json');
await requireFile('assets/models/manifest.json');
console.log(`Static deployment verified: ${checked.size} linked files; relative URLs; compiled JS and CSS.`);
