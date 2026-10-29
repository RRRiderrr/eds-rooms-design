# Existing main hall: measured source furniture and door anchors

These assets are extracted from the user's current `reconstructed_room.blend`.
No replacement room or replacement desk design is generated. Original GUI file
geometry, matrices, selection, and active file path are checked before and after
the operation. The extraction uses a private `.blend` copy on drive E.

## Repeat the extraction

From `ThreeJS_ArchViz`, with Blender open and its existing TCP 9876 bridge active:

```powershell
python tools/extract_existing_hall.py
node tools/verify_existing_hall.mjs
```

The first script captures the live inventory, derives the main hall topology,
saves an E-drive snapshot with `copy=True`, and runs an independent background
Blender process on the snapshot. An exclusive E-drive lock prevents overlapping
exports. It does not reload or save over the live Blender file. See
`source-preservation.json` for the exact original path, private snapshot, and
before/after comparison. All large working snapshots and logs stay under
`E:/ArchViz_Resources/main-hall`.

## Outputs

* `public/assets/architecture/hall-layout.json`: compact semantic data suitable
  for a synchronous build-time import. Contains 26 exact desk instances, their
  78 source mesh names, source matrices and world bounds, 14 main-hall-facing
  doors, 28 beside-door anchors, real wall face planes, floor polygon, and a
  separate measured meeting room.
* `public/assets/architecture/hall-desk-manifest.json`: three production/proxy
  asset pairs. Merge these entries into the application manifest; this tool does
  not overwrite the main manifest or generated application code.
* `public/assets/models/hallDesk-{1,2,3}.glb`: production meshes evaluated from
  original source objects, including their real bevel geometry.
* `public/assets/proxies/hallDesk-{1,2,3}.glb`: raw source silhouettes with the
  same footprint and origin, 408–438 triangles each.
* `assets-src/main-hall/editor-proxies.json`: the same lightweight parts as
  nonindexed triangle arrays, allowing synchronous Editor construction without
  loading production textures. Position and normal arrays contain XYZ triples;
  UV arrays contain pairs. Each part includes its own measured source finish.
* `export-validation.json`: source-template world vertex reconstruction errors.
  `artifact-validation.json` separately checks the actual exported GLBs,
  synchronous proxies, instance world bounds, materials, and wall anchors.

## Instance and asset contract

All web coordinates are metres, Y up. The shared source conversion is:

```text
appX = BlenderX - 0.9477145
appY = BlenderZ
appZ = -(BlenderY + 1.0209095)
```

`originalTables[]` uses stable IDs `source-desk-west-01` through `08` and
`source-desk-east-01` through `18`, `assetId: hallDesk`, `material: original`,
`position: [x,y,z]`, and `rotation` about Y in radians. The original root origin
is the footprint center at floor level; do not recenter using the pedestal or
tabletop centroid.

Variant 1 is the eight west corner desks (1.6 × 0.75 × 1.6 m). Variants 2 and 3
are the eighteen east straight desks (1.4 × 0.75 × 0.8 m), split into nine each
to preserve their existing stable variant IDs and row orientations. The 18
superfluous raised black cable caps were removed from the live source on
2026-10-29; all other source geometry and transforms were fingerprint-verified.
The 25 mm white tops are continuous, and every steel frame ends at or below
their underside (0.725 m). See `clean-desktop-source-audit.json`. Every
instance reconstructs its original source vertices to within 1 micrometre.

Source finish metadata is on individual GLB materials: `sourcePbr: true`,
`preserveOriginal: true`, `surface`, `partColor`, and `colorVariant`. Steel frames
have `surface: metal`; the white tops and grey cabinets have `surface: plastic`.
The separate manifest uses `productionOverride: true`; it deliberately does not
use the manifest-level flag reserved for external normalized scan overrides.

The previous consolidated full-space export contains the source furniture in
`Space_existingFurniture`. Hide that render node in both modes when editable
desk instances are present; otherwise desks are duplicated. The JSON also lists
all 96 original names for exports that retain separate nodes. These source
objects remain intact in Blender. They were excluded from the architectural GI
bake, so moving them does not reveal a baked desk shadow.

## Hall doors and wall-facing anchors

Door membership is computed from the connected actual floor polygon after
subtracting real wall and closed door leaf footprints. `Door_02` through
`Door_15` face this connected hall. `Door_01` is behind a closed boundary and is
excluded. The west vestibule at Door 15 is connected to the hall and must not be
discarded. Door 03 belongs to the hall-facing signage set even though it is also
the interactive meeting room boundary.

`hallWalls[].coordinate` is the measured **wall face**, with an inward hall
normal, not the wall centerline. The plaque and color panel centers already
include their half-depth and an 8 mm wall clearance. They stay beside openings,
not on door leaves. `rotation` makes the asset's local +Z face the hall. Suggested
door labels are generic except the known meeting room, stairs and entrance;
they can be replaced by the project's room naming.

The meeting room retains its own inward aliases `west/east/near/far`, with source
wall mappings `wall-17/26/21/16`. In particular, its `near` face and the hall's
`wall-21` face are on opposite sides of the same wall. Do not reuse a hall
surface normal for a meeting room wall decoration.
