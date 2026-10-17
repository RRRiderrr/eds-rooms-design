# Materials and optimized asset pipeline

Run `npm run assets` from `ThreeJS_ArchViz`. The script downloads missing CC0 sources once, caches original sources on E through `ARCHVIZ_RESOURCES` (metadata remains in `assets-src/materials`), generates material tiers, copies the version-matched Three.js Basis decoder, and writes Meshopt versions of the Blender exports. Subsequent runs reuse downloaded files and unchanged encodes. The browser never calls the download API or any backend. `npm run assets -- --materials-only`, `--geometry-only`, and `--decoders-only` select individual stages; `--force` re-encodes materials.

## Provenance and available library

The local audit found `E:/Megascans Library/Downloaded/surface/fabric_furniture fabric_sjfvce3c`, the user's downloaded Quixel **Furniture Fabric** surface: albedo, normal and roughness at 2K, 1m scan area. It is used as an explicitly labelled local, user-authorized Megascans source. Its old Bridge metadata contains neither a Fab entitlement nor an explicit UE-only license; this project does **not** claim that a Fab Standard license was verified. Before publishing that surface outside the user's authorized project, its original acquisition terms must be respected. A fully CC0 woven fabric fallback is configured in `sources.json` and can be selected by removing the automatic local-fabric section in `assets.mjs` or providing a CC0 override. No purchases or credential extraction were performed. The pre-existing authorized Epic launcher session was used.

On 2026-10-17 Windows Computer Use through the installed `@oai/sky` skill recovered the native Epic Games Launcher / Fab connection. My Library displayed 517 ordinary entries and an entry point to the Quixel collection. Four specifically inspected materials showed **Saved in library**, then **On disk** after Download Only. No purchase, new login, new agreement or credential extraction was performed. The download cache is `E:/ArchViz_Resources/FabDownloads/VaultCache`, selected through launcher settings. The earlier missing-runtime-path problem is no longer a blocker. Audit details are in `assets-src/materials/source_missing.json`.

Current production material coverage:

| ID | Source | Intended surface / scale |
| --- | --- | --- |
| `wall-painted` | Owned Fab / Quixel Painted Plaster pjBoU0, Fab Standard | Repainted warm office finish, 1m tile, restrained real scan normals; heavyweight source on E |
| `floor-commercial-grey` | Owned Fab / Quixel Smooth Concrete `tezmdjno`, Fab Standard (15.31 MB medium source) | 2×2m scan, calibrated neutral grey with restrained 18% source contrast; representative surface because the original floor product remains unknown |
| `metal-painted` | Owned Fab / Quixel Painted Metal Door `ugzobcglw`, Fab Standard (8.03 MB) | 2×1m scan; normal/roughness only at runtime, preserving authored ceiling, door and frame colours; a specific powder-coating manufacture is not asserted |
| `wood-oak` | Owned Fab / Quixel Oak Veneer `tfjcffgc`, Fab Standard (5.25 MB) | Real furniture veneer, 2×4m scan; both physical UV dimensions are retained |
| `fabric-woven` | Local Quixel Furniture Fabric `sjfvce3c`; optional [Poly Haven Denim Fabric](https://polyhaven.com/a/denim_fabric), CC0 | Woven fabric normalized to preserve curated upholstery colours, 1m tile |

Poly Haven's [license](https://polyhaven.com/license) allows commercial use and redistribution of its CC0 assets. The [Fab Standard license summary](https://www.fab.com/eula) allows compatible tools, while acquisition provenance determines which license actually applies. No surface here is falsely labelled as Fab/Megascans if its source is CC0 or project-authored. The API downloader identifies this application with its own User-Agent/Referer; downloaded files are self-hosted, and no live API requests are made by the application.

## Replacing a missing source

`overrides.json` now records the four owned Fab materials. `node tools/register-fab-materials.mjs` reconstructs that mapping from the same four explicitly inspected download directories, without reading credentials or private app APIs. For another source/machine, edit it using `overrides.example.json` as the schema: stable `id`, source label, actual license/acquisition evidence, tile size in metres and local paths for `baseColor`, OpenGL `normal`, `roughness`, optional `ao`/`metalness` or packed `orm`. `tileMeters` accepts a scalar or `[width,height]`. Heavy sources/intermediates stay in `E:/ArchViz_Resources/RoomAtelier/materials` (`ARCHVIZ_RESOURCES` overrides the resource root). `--only-material=floor-commercial-grey,wood-oak,metal-painted` limits an incremental rebuild. `normalConvention: directx` inverts green during ingest. The example's evidence text is not a license grant.

Suitable CC0 plaster/floor/oak and the original deterministic metal coating remain clearly labelled fallbacks in `sources.json`; they are no longer the current wall/floor/wood/metal production source. Standalone source texture resale is not part of this application. Downloaded sources are processed into the integrated project under their actual acquisition terms.

## Texture format and colour management

- Low / Medium / High are 512 / 1024 / 2048 pixels per map. Lower tiers preserve the same physical material and baked lighting; they only change texture detail.
- Base colour is sRGB ETC1S KTX2. Normal uses linear UASTC KTX2; ORM uses linear ETC1S KTX2. All contain the full mip pyramid to 1px. Basis Universal encoding runs offline through `ktx2-encoder` WASM, with no external executable or global installation required.
- ORM packs AO in red, roughness in green and metalness in blue. Input single-channel files are packed in linear space. Base colour never supplies the roughness data.
- Each tier includes a WebP base-colour and near-lossless WebP data-map fallback. Normal/ORM retain linear channel values; no sRGB conversion is applied to data maps. The runtime selects supported GPU block compression through `KTX2Loader.detectSupport(renderer)`, then gracefully loads self-hosted image maps if transcoding is unavailable.
- Architecture UV0 expresses metres. Runtime repeat is `metresPerUv / tileMeters`; a separate unique UV1 channel supplies the baked Cycles irradiance. The loader sets ORM channel 0 so AO does not accidentally sample the lightmap atlas.
- No displacement is used. Normal intensity is restrained for real-scale office surfaces. Curated colours tint only appropriate materials such as normalized fabric.

## Runtime ownership

`src/assets/materials.ts` exports `MaterialLibrary`, `loadMaterial`, `releaseMaterial`, `assetUrl`, and `TextureQuality`. A library belongs to a `WebGLRenderer`. `await library.acquire(id, quality, options)` returns `{ material, source, release }`; assign the material, then call `release()` once the old scene/variant has actually been swapped out. Instances have independent material values while sharing image sources. Textures are reference-counted, and the final lease releases the cache entry. `library.dispose()` terminates decoder workers and disposes remaining resources. Preload the new lease before releasing the old one to avoid a visible blank swap. Do not acquire this library for Editor proxies.

The convenience `loadMaterial(id, quality, renderer, options)` returns a material; `releaseMaterial(material)` releases its lease. Use `options.metersPerUv`, `normalStrength`, and capped `anisotropy` for physically consistent UV density and runtime quality.

## Geometry

Blender outputs `public/assets/architecture/room.glb` and `room-editor.glb`. The geometry stage captures originals in `assets-src/exports` and writes `*.meshopt.glb` beside the production assets. It preserves scene hierarchy, original names, hinge transforms, UV0 and UV1; it deduplicates resources, prunes unused accessors and applies medium Meshopt compression. The runtime must configure `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`. No Draco decoder, WebGPU, mandatory browser extension, server renderer or database is required.

`assets-src/materials/geometry-report.json` records before/after sizes. Do not flatten dynamic door nodes into static geometry, merge furniture into the baked room, or bake mutable furniture shadows into the architecture. UV0 outside `[0,1]` is intentional for real-scale tiled materials; non-lightmapped dynamic panes and hardware may also omit atlas UVs.

`dist` contains only runtime resources. Original scans, source textures, Blender files, processing PNGs, metadata and engineering scripts remain outside `dist`.

## Real furniture and foliage

`node tools/ingest-real-models.mjs` prepares `armchair-2`, `chair-2`, `plant-1` and `plant-2` from actual CC0 Poly Haven models [Modern Arm Chair 01](https://polyhaven.com/a/modern_arm_chair_01), [Dining Chair 02](https://polyhaven.com/a/dining_chair_02), [Potted Plant 01](https://polyhaven.com/a/potted_plant_01) and [Potted Plant 02](https://polyhaven.com/a/potted_plant_02). Normalization uses uniform scale only, measured bounds, a centred footprint and the base on the floor. Source UV atlases, wood grain, upholstery normal/roughness and leaf cutouts are preserved. Separate leaf-alpha source maps are packed into base-colour alpha; curated tint applies only to tagged upholstery/pots.

Low/Medium/High combine geometry LODs with 512/1024/2048 texture tiers. Plant 1 is reduced from 176,226 source triangles to 10,383/21,473/58,376; plant 2 from 69,806 to 4,724/9,210/25,342. Each has a WebP-textured fallback GLB. `assets-src/materials/real-models.json` records paths, CC0 source URLs, physical bounds and budgets. Uncompressed normalized Blender imports stay in `E:/ArchViz_Resources/RoomAtelier/real-models`; the catalogue exporter protects these production overrides. One targeted Fab **My Library** search for `sofa` on 2026-10-17 returned no items; no unrelated paid or antique sofa was substituted.

## Factory panorama

`node tools/prepare-factory-panorama.mjs` prepares the project-generated 2:1 full-sphere factory image as self-hosted low512×256, medium1024×512 and native high1774×887 RGBE maps, with WebP fallbacks. Source PNG: `E:/ArchViz_Resources/RoomAtelier/environment/factory-panorama-generated-v1.png`. The exact built-in ImageGen prompt is in `assets-src/environment/factory-panorama.prompt.txt`. This is a synthetic reconstruction guided by the factory characteristics visible in the office photo, not a surveyed continuation of the hall.

`public/assets/environment/factory-panorama.json` explicitly records **8-bit sRGB LDR converted to linear RGBE**, not measured HDR or recovered highlights. The earlier genuine scene-linear Cycles factory HDR remains separate. `Architecture` uses the new equirectangular Scene.background without window planes. A separate PMREM is assigned only to window glass through `applyGlassReflections()` after material refresh; the indoor environment, probes and baked GI stay independent. `node tools/check-factory-panorama.mjs` checks all three tiers, PMREM and six view directions in WebGL. Evidence: `assets-src/environment/factory-panorama-validation.json` and `assets-src/previews/factory-panorama-six-views.png`.

## Compatibility notes

Only trusted local/source-API images are processed by the build tool. The working Windows installation initially loaded two incompatible native Sharp versions via a transitive dependency; upgrading every Sharp instance to 0.35.5 with a single dependency override (`sharp: $sharp`) and `npm dedupe --legacy-peer-deps` avoids conflicting libvips DLLs. The final `npm audit` reports zero vulnerabilities. Keep all Sharp instances on one version when upgrading. This is a build-time tool, never code executed by imported preset JSON or by the static website.
