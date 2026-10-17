import { Color, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader, Vector2, WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type TextureQuality = 'low' | 'medium' | 'high';
export interface TextureMaps { baseColor: string; normal: string; orm: string; fallback?: { baseColor: string; normal: string; orm: string }; size: number; }
export interface MaterialSource {
  id: string; label: string; source: string; license: string; url?: string; note?: string;
  tileMeters: number | [number, number]; fallbackColor: string; roughness: number; metalness: number; normalStrength?: number;
  /** Painted/coated surfaces keep their authored colour; texture detail is roughness/normal only. */
  baseColorMode?: 'texture' | 'tint' | 'solid';
  qualities: Record<TextureQuality, TextureMaps>;
}
export interface MaterialManifest { schemaVersion: number; materials: MaterialSource[]; architectureMapping: { match: string; materialId: string }[]; }
export interface MaterialOptions {
  /** Curated tint, normally white for scanned walls/wood and chosen cloth colour for neutralized fabric. */
  color?: string;
  /** Actual metres represented by one UV unit. Architecture UV0 uses 1m. Furniture UVs may differ. */
  metersPerUv?: number;
  normalStrength?: number;
  anisotropy?: number;
}
export interface MaterialLease { material: MeshStandardMaterial; release: () => void; source: MaterialSource; }
interface Resource { source: MaterialSource; material: MeshStandardMaterial; textures: Texture[]; users: number; }

/** Resolve under arbitrary static hosting subdirectories; no runtime CDN. */
export function assetUrl(relative: string): string {
  return `${import.meta.env.BASE_URL}${relative.replace(/^\/+/, '')}`;
}

/** Active materials only. Release a lease after scene/variant swaps; shared textures live until their last user. */
export class MaterialLibrary {
  private readonly ktx: KTX2Loader | undefined;
  private readonly images = new TextureLoader();
  private readonly resources = new Map<string, Promise<Resource>>();
  private manifestPromise: Promise<MaterialManifest> | undefined;
  private disposed = false;
  constructor(private readonly renderer: WebGLRenderer) {
    if (typeof WebAssembly !== 'undefined') {
      this.ktx = new KTX2Loader().setTranscoderPath(assetUrl('assets/decoders/basis/')).setWorkerLimit(2).detectSupport(renderer);
    }
  }

  loadManifest(): Promise<MaterialManifest> {
    return this.manifestPromise ??= fetch(assetUrl('assets/materials/manifest.json'))
      .then(response => { if (!response.ok) throw new Error(`Material manifest: HTTP ${response.status}`); return response.json() as Promise<MaterialManifest>; });
  }

  /** Embedded Basis textures in production furniture use the same local transcoder and capability detection. */
  configureModelLoader(loader: GLTFLoader): void { if (this.ktx) loader.setKTX2Loader(this.ktx); }

  async acquire(id: string, quality: TextureQuality, options: MaterialOptions = {}): Promise<MaterialLease> {
    if (this.disposed) throw new Error('MaterialLibrary is disposed');
    const key = `${id}:${quality}`;
    let promise = this.resources.get(key);
    if (!promise) { promise = this.create(id, quality); this.resources.set(key, promise); }
    let resource: Resource;
    try { resource = await promise; } catch (error) { this.resources.delete(key); throw error; }
    if (this.disposed) { this.destroy(resource); throw new Error('MaterialLibrary disposed during asset load'); }
    resource.users++;
    const material = resource.material.clone();
    const textures: Texture[] = [];
    // Each lease may use different real-world UV scale or anisotropy without mutating other objects.
    const tile = Array.isArray(resource.source.tileMeters) ? resource.source.tileMeters : [resource.source.tileMeters,resource.source.tileMeters];
    const repeat = tile.map(meters=>(options.metersPerUv ?? 1)/meters);
    for (const slot of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap'] as const) {
      const texture = material[slot];
      if (!texture) continue;
      const shared = textures.find(t => t.userData.sourceTexture === texture.uuid);
      if (shared) { material[slot] = shared; continue; }
      const clone = texture.clone();
      clone.repeat.set(repeat[0], repeat[1]);
      clone.anisotropy = Math.min(options.anisotropy ?? 4, this.renderer.capabilities.getMaxAnisotropy());
      clone.userData.sourceTexture = texture.uuid;
      clone.needsUpdate = true;
      textures.push(clone);
      material[slot] = clone;
    }
    if (options.color) material.color = new Color(options.color);
    const normalStrength = options.normalStrength ?? resource.source.normalStrength ?? 0.3;
    material.normalScale = new Vector2(normalStrength, normalStrength);
    material.name = `${id}:${quality}`;
    material.userData.materialId = id;
    material.userData.source = resource.source.source;
    let released = false;
    return { material, source: resource.source, release: () => {
      if (released) return;
      released = true;
      material.dispose(); textures.forEach(t => t.dispose());
      if (--resource.users <= 0) { this.resources.delete(key); this.destroy(resource); }
    } };
  }

  /** Resolve original Blender material names without touching protected source geometry. */
  async materialIdForName(name: string): Promise<string | undefined> {
    // Never infer a plaster wall from "WINDOW", or paint an arbitrary "FRAME" black.
    // Original material names are the architecture's stable semantic mapping.
    if (/^05_WINDOW_FRAMES_|^15_WALLS_Window_Panels_/i.test(name)) return 'metal-painted-white';
    if (/^ELECTRICAL_|^06_WINDOW_PANES_|^10_LIGHT_DIFFUSERS_|^11_HVAC_|^14_HANDLES_/i.test(name)) return undefined;
    const manifest = await this.loadManifest();
    return manifest.architectureMapping.find(mapping => new RegExp(mapping.match, 'i').test(name))?.materialId;
  }

  private async create(id: string, quality: TextureQuality): Promise<Resource> {
    const manifest = await this.loadManifest();
    const source = manifest.materials.find(item => item.id === id) ?? (id === 'metal-painted-white' ? {
      ...manifest.materials.find(item => item.id === 'metal-painted')!, id, label: 'Белый окрашенный металл',
      fallbackColor: '#f1f0e9', roughness: .6, metalness: .04, normalStrength: .06, baseColorMode: 'solid' as const,
    } : undefined);
    if (!source) throw new Error(`Unknown material ID: ${id}`);
    const maps = source.qualities[quality] ?? source.qualities.medium;
    const load = async (role: 'baseColor' | 'normal' | 'orm'): Promise<Texture | null> => {
      let texture: Texture | undefined;
      try { if (this.ktx) texture = await this.ktx.loadAsync(assetUrl(maps[role])); } catch { /* Compatible image fallback is self-hosted with every quality tier. */ }
      if (!texture && maps.fallback?.[role]) {
        try { texture = await this.images.loadAsync(assetUrl(maps.fallback[role])); } catch { /* Material remains physically sensible flat fallback, never a broken image. */ }
      }
      if (!texture) return null;
      texture.colorSpace = role === 'baseColor' ? SRGBColorSpace : NoColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.flipY = false;
      texture.channel = 0; // Lightmap UV1 must not leak into material AO; ORM uses world-metre UV0.
      texture.needsUpdate = true;
      return texture;
    };
    const [map, normalMap, orm] = await Promise.all([source.baseColorMode && source.baseColorMode !== 'texture' ? Promise.resolve(null) : load('baseColor'), load('normal'), load('orm')]);
    const material = new MeshStandardMaterial({
      color: source.baseColorMode === 'tint' ? '#ffffff' : map ? '#ffffff' : source.fallbackColor, map, normalMap,
      aoMap: orm, aoMapIntensity: 0.28, roughnessMap: orm, metalnessMap: orm,
      roughness: orm ? 1 : source.roughness, metalness: orm ? 1 : source.metalness,
      normalScale: new Vector2(source.normalStrength ?? 0.3, source.normalStrength ?? 0.3),
    });
    return { source, material, textures: [map, normalMap, orm].filter((texture): texture is Texture => texture !== null), users: 0 };
  }

  private destroy(resource: Resource): void { resource.material.dispose(); resource.textures.forEach(texture => texture.dispose()); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const promise of this.resources.values()) void promise.then(resource => this.destroy(resource), () => undefined);
    this.resources.clear(); this.ktx?.dispose();
  }
}

const libraries = new WeakMap<WebGLRenderer, MaterialLibrary>();
const releases = new WeakMap<MeshStandardMaterial, () => void>();
export async function loadMaterial(id: string, quality: TextureQuality, renderer: WebGLRenderer, options: MaterialOptions = {}): Promise<MeshStandardMaterial> {
  let library = libraries.get(renderer);
  if (!library) { library = new MaterialLibrary(renderer); libraries.set(renderer, library); }
  const lease = await library.acquire(id, quality, options);
  releases.set(lease.material, lease.release);
  return lease.material;
}
export function releaseMaterial(material: MeshStandardMaterial): void { releases.get(material)?.(); releases.delete(material); }
