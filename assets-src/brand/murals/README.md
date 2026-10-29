# EDS wall paintings

These are full-wall paint compositions, not mounted boards or raised signs. Eight vector-native designs use the exact user-supplied EDS wordmark paths, diagonal, plus-field and paired quarter-disc motifs. Original designs 1–3 retain their SVG sources unchanged; designs 4–8 add dialogue, engineering, partnership, calm and presentation compositions. Corporate colors are copied from the supplied identity: #0B30C1, #A2B8FE, #A0FF3D, #F0F0F0, #000000.

Rebuild: `node tools/prepare-wall-murals.mjs`. This writes individual 4096 × 2304 SVG sources (16:9, matching 5.2 × 2.93 m painted wall below the structural black beam), previews, and one combined 4096² atlas for all eight murals and the existing three alpha-mask motifs. Each runtime mural tile is 1328 × 747 px with 16px edge extrusion; the atlas keeps the previous GPU allocation and uses one sampler. Ukrainian text is baked into runtime texture; SVG uses Arial/DejaVu Sans so its source remains editable.

RGB is sRGB paint color; alpha is an unchanged mask only for motif tiles. Use `atlas.json` `uvRectBottomLeft` with Texture.flipY = true. Texture pixels never contain the floor, ceiling, furnishings or doorway imagery from the reference. Renderer must clip painting to actual wall surface (including openings and top black fascia), not create full rectangular geometry.

The supplied wordmark is preserved exactly; only uniform scale and placement change. Runtime atlas WebP is lossless, and a PNG alternative is included for local tools. No external fonts, web service, backend, or generated logo is required.
