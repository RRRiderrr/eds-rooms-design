# Blender authoring and repeatable export

The room is the current reconstruction's central room, not a substitute scene.
Interior dimensions measured from mesh planes: **5.203635 × 6.097781 m**;
floor Z=0, roof deck Z=4.32 m. Source Blender XY centre is
`(0.9477145, -1.0209095)`. Web coordinates are
`(Blender.x - cx, Blender.z, -(Blender.y - cy))`, in metres.

`assets-src/reconstructed_room.before_archviz.blend` is the complete safe backup.
The live `reconstructed_room.blend` remains the complete original building.
Its 101 roof/lighting/HVAC objects have selection and transform locks; mesh and
matrix hashes before and after locking match in `analysis/protection_audit.json`.
The application treats all architecture as immutable; Editor visibility layers
never remove objects or their geometry.

`assets-src/room_archviz.blend` is an independent cropped **export source**.
Clipping of the long shared roof/floor batches happens only in this copy.
Critical source node names are preserved and mapped in `public/assets/architecture/room.json`.
Door03 frame/threshold stay static. Leaf and hardware are local children of
`Interactive_Door_03`, whose origin is at the actual hinge opposite the handle.
Web hinge is `(1.501377, 0, -3.0988903)`; inward opening is −95° about Y.

## Refresh

From the `ThreeJS_ArchViz` directory, with the existing Blender MCP server on
`127.0.0.1:9876`:

```powershell
python tools/reexport_room.py
```

The wrapper snapshots the current full scene using `save_as_mainfile(copy=True)`,
runs Blender headlessly, bakes, exports the proxy, then runs Meshopt optimization
when npm dependencies are installed. It never crops the live scene.
Set `BLENDER_EXECUTABLE` or use `--blender PATH` on another authoring workstation.
`--source path/to/full.blend` works without an MCP connection.
`--skip-bake` is useful for geometry-only iteration; `--concepts` also imports and
renders all presets. This is authoring tooling, never a production server.

## Lighting assets

* UV0 is physically scaled surface UV in metres. UV1 is a shared, unique atlas.
* `lightmap.hdr`: 2048² linear HDR **diffuse indirect irradiance**,
  real Cycles 96-sample bake, 8 total bounces / 6 diffuse bounces, albedo pass off.
* No movable furniture or decor is present in the architecture bake. Closed door
  casts light in the base bake, while the leaf itself uses dynamic lighting.
* `probes.json`: 18 positions, six orthogonal microscopic diffuse receivers each,
  Cycles 48-sample irradiance bake, plus low-order SH coefficients. It contains
  incident light, never a hard-coded room-independent ambient approximation.
* `environment.hdr`: Cycles panoramic render of the same empty room for PMREM.
* `fallback.jpg`: static Cycles room view for devices without usable WebGL2.

Three.js loads the atlas through RGBELoader with `channel=1`, `flipY=false`
(glTF already flips V). Do not apply tone mapping to irradiance data. The same
atlas is used by every device-quality tier. Dynamic pieces use the probes and
PMREM, with limited direct shadows; no realtime GI or ray tracing is required.

The production GLB has source-name extras and per-node `protectedGroup`,
`wallId`, `lightmapped` metadata. The Editor proxy uses the same node names and
precise bounds, strips texture UVs and socket microdetail, and is about 260 KB
before Meshopt, versus approximately 4 MB for full architecture.

`context.meshopt.glb` (approximately 77 KB) is an optional immutable strip of
the actual adjoining north corridor, including source Floor/Wall38/Door06/roof
and lamps. It uses the same coordinates, meter UVs and material names, and is
intended only for ArchViz views through the open door. `context.json` documents
the exact crop. It uses environment/probe lighting rather than adding a second
heavy bake. No new room geometry is invented and the current application instead loads the full measured building complement from space.meshopt.glb. Do not load context.meshopt.glb at the same time because it duplicates architecture. Navigation covers the full measured bounds.

## Real Blender interior concepts

```powershell
& $env:BLENDER_EXECUTABLE --background assets-src/room_archviz.blend --python tools/build_concepts.py
```

This imports the actual shipped production GLBs using the same asset IDs,
material variants and versioned configurations as the web application. It writes
`assets-src/lounge_concepts.blend` with one collection per built-in preset and a
shared production-model library. Two Cycles viewpoints per preset go to
`assets-src/previews/concepts/`; the static architecture source stays separate.
The original ceiling has not been remodelled for these concepts.

## Full-space refresh and quality tiers

The current wrapper exports room and its exact full-building complement, repairs door parenting and corrugated-sheet winding, bakes indirect GI, writes real fixture/window anchors and individual placement obstacles, then optimizes both representations. Full-space GI uses 64 samples, 8 bounces, a 4K atlas and identical 2K/1K downsampled tiers. Runtime direct lights supply direct irradiance. Heavy bake/exports use E:/ArchViz_Resources. `--skip-bake` is only for inspecting geometry; rebake before publishing changed architecture.

`prepare-blender-catalog.mjs` decodes Meshopt/quantization for generated furniture and uses original PNG-bearing normalized source GLBs for real scans. This keeps editable Blender concepts independent of browser-only KTX2 compression.
