# Photo-matched EDS signage

The six logical assets use the supplied photographs and exact supplied EDS logo. `src/catalog/signage.ts` is the common production/proxy authoring factory. Units are metres, XY is the front wall plane, +Z faces the room, and geometry Z is centred around half the declared mounting depth. The web wall-anchor adds that half-depth in front of the wall. Dimensions are estimated from the photographed door and fitted to the real scene's wall bays; they are not claimed to be a physical survey.

- **Timeline:** 15 separate acrylic plates, six aluminium retaining rails, and a transparent ink atlas rasterised from locally authored vector letters. The source photograph's reflections and wall were not used as a texture. Years, row order and principal text follow the photograph; the tiny body copy has been transcribed from the available resolution and its font rebuilt with Arial outlines.
- **Corporate structure:** separate raised metal headline letters, vinyl legend, orange labels, double circular arcs, connectors, exact EDS contour and four QR ink patterns traced from the photo. QR payloads are not inferred. The electrical outlet was excluded.
- **World map:** actual coastline/island/inner contours (63 shapes), source wood print projected on geometric top caps, plain wood edges and 71 regions of shallow relief. No wall-background plane. The photographed small boats/planes are preserved as shaped wooden pieces.
- **Sales plan:** raised metal letters, aluminium carrier rails, physical transparent number cards and correct photographed values.
- **Ukraine:** full coast including Crimea, 23 wood relief regions, printed regional boundaries/labels, seven metal row labels and seven separate numeric-card rows.
- **EDS:** three extruded 75 mm letter solids, source contour and negative-space plus. Pixel stair steps were simplified at subpixel tolerance and continuous curved sections reconstructed as quadratic paths. Corners and letter openings remain sharp.

Only the map's own printed faces use unretouched source RGB, clipped by geometry. The local Windows Arial font program is not redistributed; glyph contours are document geometry. The original user-provided PNGs are retained on `E:/ArchViz_Resources/Signage/reference`. No paid asset acquisition or external artwork was used.

## Rebuild

From `ThreeJS_ArchViz`:

```powershell
python tools/signage/prepare_data.py
python tools/signage/trace_qr.py
node tools/signage/bake_ink.mjs
node tools/signage/check_models.mjs
```

The first two commands extract geometry and exact QR ink from the existing reference files. `bake_ink` rasterises the timeline's own vector geometry, saves the editable SVG to the E resource drive, and writes the small transparent production print to `public/assets/signage`.

`npm run export:catalog` already calls `attachSignagePrints` automatically **before** Meshopt. No manual print-attachment step is needed in the normal rebuild. For a standalone raw GLB diagnostic, the equivalent command is:

```powershell
node tools/signage/attach_prints.mjs public/assets/models/edsSignage-1.glb public/assets/models/edsSignage-3.glb public/assets/models/edsSignage-5.glb
```

The helper reads `material.extras.printUri`, embeds its PNG/JPEG, converts the printed primitive UV0 to glTF's top-origin convention once, preserves the source PBR material, and accepts only contained local print paths. The materials already carry `extras.sourcePbr: true`; the renderer preserves them individually, including transparent acrylic, print alpha and metallic lettering. Do not add the manifest-level `sourcePbr` flag here: that flag belongs to externally normalized real-model overrides in the current Blender catalog pipeline. Production and editor use the same stable IDs; editor proxies contain no textures and replace tiny print with simple layout lines.

`previews/report.json` stores finite-vertex checks, exact bounds, source triangle counts and render-pass statistics. The 18 PNG previews cover front, oblique and editor-proxy views for all six signs. Shadow/transmission render-pass triangle counts are explicitly separate from the actual source triangles. `node tools/signage/check_models.mjs --exported` repeats this check against the actual production/proxy GLBs and saves its results separately under `previews/exported`.
