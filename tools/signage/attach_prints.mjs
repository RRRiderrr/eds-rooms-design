/** Attach user-supplied map print to actual traced wooden caps, before Meshopt.
 * All paths are project-contained. No scripts or remote URLs are accepted.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function attachSignagePrints(document, publicRoot = path.join(projectRoot, 'public')) {
  const textures = new Map(); let count = 0;
  for (const material of document.getRoot().listMaterials()) {
    const extras = material.getExtras(); const uri = extras.printUri;
    if (typeof uri !== 'string') continue;
    const filename = path.resolve(publicRoot, uri);
    if (!filename.startsWith(path.resolve(publicRoot) + path.sep)) throw new Error(`Invalid print path: ${uri}`);
    const extension = path.extname(filename).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) throw new Error(`Unsupported print format: ${extension}`);
    let texture = textures.get(uri);
    if (!texture) {
      texture = document.createTexture(path.basename(filename)).setImage(new Uint8Array(await fs.readFile(filename))).setMimeType(extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg');
      textures.set(uri, texture);
    }
    material.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(texture);
    material.getBaseColorTextureInfo().setTexCoord(0);
    // The synchronous authoring factory uses Three's ordinary bottom-origin UVs
    // and TextureLoader.flipY=true. GLTFLoader deliberately uses flipY=false:
    // convert only these cap UVs to glTF's top-origin image convention. The
    // marker makes a repeated attachment safe rather than inverting twice.
    for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMaterial() !== material || primitive.getExtras().signagePrintUVTopOrigin === true) continue;
      const sourceUV = primitive.getAttribute('TEXCOORD_0');
      if (!sourceUV) throw new Error(`Printed primitive lacks UV0: ${mesh.getName()}`);
      const array = new Float32Array(sourceUV.getCount() * 2), element = [0, 0];
      for (let i = 0; i < sourceUV.getCount(); i++) { sourceUV.getElement(i, element); array[i * 2] = element[0]; array[i * 2 + 1] = 1 - element[1]; }
      const converted = document.createAccessor(`${sourceUV.getName()}-signage-top-origin`).setType('VEC2').setArray(array).setBuffer(sourceUV.getBuffer());
      primitive.setAttribute('TEXCOORD_0', converted).setExtras({ ...primitive.getExtras(), signagePrintUVTopOrigin: true });
    }
    material.setExtras({ ...extras, sourcePbr: true, printSource: extras.printSource ?? 'User-provided photo; real coast/country geometric mask, printed top caps only' });
    count++;
  }
  return count;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  for (const argument of process.argv.slice(2)) {
    const filename = path.resolve(argument); const document = await io.read(filename);
    const count = await attachSignagePrints(document);
    await io.write(filename, document);
    console.log(`${path.basename(filename)}: attached ${count} geometric map print materials`);
  }
}
