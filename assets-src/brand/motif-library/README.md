# Independent EDS wall paint motifs

Twelve alpha-mask motifs are extracted or composed from the supplied EDS vector identity. Designs 1–3 retain the existing SVGs unchanged; 4–8 are additional exact checker, arrow, nested square, cross and crosshair outlines from the reference; 9–12 combine those original forms. Each is an independent colorable element with transparent negative space.

Rebuild: `node tools/prepare-motif-library.mjs`, then `node tools/prepare-wall-murals.mjs`. The second command embeds these masks and all 16 murals in one 4096² atlas. Standalone previews, alpha PNGs and SVGs are ordinary static assets. No external fonts, network service or regenerated logo is used.
