# EDS corporate elements and original furniture

`prepare-corporate-brand.mjs` extracts artwork from the user-supplied **EDS_RGB_design_elements (2).svg**. It uses the source path/polygon coordinates, not generated illustrations. The original stays in `E:/ArchViz_Resources/RoomAtelier/brand/EDS_RGB_design_elements.svg`; `assets-src/brand/source-provenance.json` records its SHA-256 and source groups. The identity is user supplied for this project, not a CC0 asset or a purchased licence.

The exact RGB palette is blue `#0B30C1`, lavender `#A2B8FE`, lime `#A0FF3D`, white `#F0F0F0`, black `#000000`. `public/assets/brand/palette.json` exposes stable IDs and original motif provenance. The three black-on-transparent masks are `motif-1.png` (diagonal hatch, original group3), `motif-2.png` (8×8 cross grid, group7), `motif-3.png` (opposed quarter-discs, group4); each has an SVG and neutral-background preview. Variant/motif **0 always means absent**. No ImageGen is involved.

## Catalog contracts

- **beanBag**: three original sewn-cover shapes, pear `[.88,.96,.96]`, supported lounge `[1.04,.78,1.10]`, pillow chair `[1.02,.70,.98]` metres. Production has one watertight smooth stuffed skin with a settled seat hollow and sparse recessed tension folds. Raised tube piping, the rear torus loop and zipper teeth were removed. Production42624triangles, proxy3968; high fabric normal strength.055. Proxy geometry preserves its silhouette and exact bounds using a fraction of the triangles. The existing `fabric-woven` PBR service applies metre-scale fabric; all five curated corporate colors remain interchangeable. These are authored project assets, not mislabelled Fab downloads.
- **doorPlaque**: wall mounted, center at1.55m. Variant1 PMMA190×145×4mm, four stainless25mm standoffs, total depth34mm; variant2 matte anodised aluminium220×120×12mm; variant3 corporate cassette240×140×18mm. Original EDS outline wordmark and Ukrainian default text **Переговорна** are printed on independent `DoorPlaque_Label` meshes in both production and proxies.
- **brandDoorPanel**: semantic paint strips220/280/340mm wide. Legacy3530mm height and24/24/28mm placement allowance remain in saved data for compatibility; they are not visible thickness. Runtime color is applied directly to measured plaster via `WallFinishes`, with no panel, profiles or cast shadow. The only runtime mesh is an invisible hit plane250µm from the wall. No number or label exists on paint: the independent physical plaque is centred on it at worldY1.55m in every prepared preset. Visible paint starts above70mm skirting and ends at the measured steel underside (hall2.65/3/3.05m). The catalog GLB/drag preview is a flat swatch. `wallLayer:'background'` permits a plaque over paint without waiving wall/opening validation.
- **hallDesk**: three actual Blender source templates (corner, straight hatch right, straight hatch left), not newly invented furniture. `source-desks.ts` reads `assets-src/main-hall/editor-proxies.json` synchronously. Exact local triangles, source component names and linear-space white/gray/black finishes are preserved. The full production GLBs are maintained by the Blender export pipeline and protected by `productionOverride`. See `assets-src/main-hall/README.md`.

All wall assets use localXY for their face and **local+Z toward the room**. Runtime label content is inert `SceneObject.label`, never executable markup. Root rendering can replace only the named label material with a CanvasTexture; body geometry remains intact. Authoring label planes:

| Asset | Variant | Width×height(m) | Center(m) |
|---|---:|---|---|
| DoorPlaque_Label |1|.158×.065|[0,0,.0127]|
| DoorPlaque_Label |2|.190×.065|[0,0,.0066]|
| DoorPlaque_Label |3|.195×.075|[0,0,.0097]|

## Reproduction and verification

```powershell
node tools/prepare-corporate-brand.mjs
node tools/prepare-wall-murals.mjs
node tools/export_catalog.mjs --only=beanBag,doorPlaque,brandDoorPanel
node tools/optimize-catalog-variants.mjs --variants=beanBag:1,beanBag:2,beanBag:3,doorPlaque:1,doorPlaque:2,doorPlaque:3,brandDoorPanel:1,brandDoorPanel:2,brandDoorPanel:3
node tools/render_catalog_thumbnails.mjs --variants=beanBag:1,beanBag:2,beanBag:3,doorPlaque:1,doorPlaque:2,doorPlaque:3,brandDoorPanel:1,brandDoorPanel:2,brandDoorPanel:3,hallDesk:1,hallDesk:2,hallDesk:3
npx vitest run tests/corporate-assets.test.ts
node tools/check-plaque-labels.mjs
node tools/check-wall-customer-fixes.mjs
node tools/check-wall-mural-ui.mjs
node tools/preview-corporate-assets.mjs
```

The catalog exporter attaches local PNG prints in **both** modes, then the selected-variant optimizer welds identical vertices, preserves UV seams, and compresses with Meshopt. It refuses to overwrite imported production overrides. Nine new production models plus nine proxies total approximately0.94MiB after compression; active asset streaming still loads only selected variants. Meshopt quantisation deliberately preserves physical metre UVs outside[0,1]. Source geometry remains in TypeScript and E: resource copies; production only contains optimised GLBs and small brand textures.

`tests/corporate-assets.test.ts` checks exact floor/bounds, cheaper proxies, finite normals, PMMA thickness and projection, named plaque labels in both modes, unnumbered flat paint swatches, original palette/motif groups, and byte-equivalent source desk positions plus preserved linear colors. `assets-src/brand/qa/contact-sheet.png` is the inspected WebGL2/PBR visual check of all nine models; thumbnails are rendered from actual final GLBs. Existing marker and cork board variants and all protected real PBR asset overrides are untouched.

Dynamic plaque prints explicitly normalize their localXY UVs and use CanvasTexture.flipY=true, FrontSide. Static glTF print UVs remain top-origin; immutable GLB template geometry is cloned only for the small editable print. Actual24WebGLcases (3variants×4directions×2modes) compare the rendered result against the source canvas. Full-wall artwork and the three alpha masks share one lossless4096²SRGBatlas; measuredbounds prevent any paint on blacksteel, skirting or openings. Tests cover actualGPUprogramsamplers, blacksteel on/offpixel identity, full-wall coverage, per-face orientation, Undo/export/reload and independent regions.

Latest authoring modules: `src/catalog/beanbags.ts` provides the single closed cloth skin; `src/catalog/planter.ts` provides the hollow trough, soil, curved double-sided botanical leaf blades and connected petioles. `upgradeDoorSignage` migrates unchanged legacy stock anchors without replacing a custom layout. PMMA prints use white ink/wordmark over dark blue or graphite paint; metal and cassette plaques retain their readable dark print. No `BrandDoorPanel_Label` mesh is generated or rendered, including legacy saved records with a numeric label.
