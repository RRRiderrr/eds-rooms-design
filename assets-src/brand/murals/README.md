# EDS wall paintings

These are full-wall paint compositions, not raised boards. Sixteen vector-native designs use the exact supplied EDS wordmark, diagonal, plus field, quarter-disc, checker, arrow, nested square and crosshair grammar. The original eight SVG sources retain their geometry and typography unchanged. Designs 9–16 add growth, direction, coordinates, balance, teamwork, precision, studio and possibility compositions. Corporate colors are #0B30C1, #A2B8FE, #A0FF3D, #F0F0F0 and #000000.

Rebuild: `node tools/prepare-wall-murals.mjs`; this also refreshes the independent motif library first. Sources remain editable 4096 × 2304 SVGs, with 1200 × 675 previews. One combined 4096² atlas holds all 16 opaque murals and 12 alpha-mask motifs. Each mural tile is 992 × 558 px with 16 px edge extrusion. Motif tiles are 992 × 480 with transparent gutters; runtime aspect follows each motif object's physical width and height. No additional art sampler is required.

Use atlas.json uvRectBottomLeft with Texture.flipY=true. RGB is sRGB paint color; motif alpha is a mask tinted by the chosen object color. Murals and motifs must be clipped to the actual wall, its openings and its painted height below the black structural band. Nothing in these textures represents a photographed doorway, floor, ceiling or furniture.

The EDS wordmark is preserved exactly, only uniformly scaled and placed. WebP is lossless; PNG is retained for local tools. All runtime assets are local and need no font download, external service or backend. The vector reference copy is assets-src/brand/eds-design-elements.svg.
