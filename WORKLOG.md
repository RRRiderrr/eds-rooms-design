# rooms design — current execution state

Updated 2026-10-17. Production preview: http://127.0.0.1:4174/.

## Source preservation

Live source: ../reconstructed_room.blend; Blender MCP TCP9876 remains connected. All 766 original objects retain mesh, matrix, parent and material-assignment fingerprints. The 101 protected ceiling/lighting/HVAC objects retain selection and transform locks. No source room was replaced or cropped.

Lounge: 5.203635 × 6.097781 m, roof about 4.32 m. Door_03_CLOSED and Window_06 are measured originals. Full envelope: 49.6 × 8.47 m; real polygonal floor area 388.154 m². App coordinates: x=BlenderX−0.9477145; y=BlenderZ; z=−(BlenderY+1.0209095).

## Product and additions

Static Vite/TypeScript/Three.js WebGL2, relative paths and local decoders; no production backend. Both modes show the full source space. Editor initially requests zero heavy model/material/environment resources. Architecture protected; roof visibility only. Hinged interactive room door, WASD/Space/Ctrl and touch joystick. Furniture does not block navigation.

SceneStore owns versioned configuration, IndexedDB drafts/custom presets, validated configuration-only import/export, Undo/Redo, 0=None variants, snapping, floor/wall/support-top placement, layers and full-space surfaces. Accessories follow supports; built-ins remain immutable.

16 presets, 75 positive model variants. Every preset contains five unique photo-derived signage assemblies on real wall-38 between doors. Separate thick EDS logo appears in lounge presets 5/7/14. Six production signs/proxies retain one stable object ID per assembly. Print atlases attach automatically before Meshopt. Added glass/organic coffee tables, three different bar-stool silhouettes, 55/65-inch TVs and two coffee machines on storage.

Editor floor context menu “Запустити ArchViz тут” enters at the clicked floor position with architecture clearance. New source EDS icon, rooms design header, Ukrainian UI, no bottom-right Local label, separated Help/Export.

## Rendering repairs

Cycles indirect-only HDR GI + offline OIDN, 18 irradiance probes and indoor PMREM. Movable furniture excluded from bake. All 25 runtime fixtures now have fixed source positions/output at every tier. Walking never reassigns lights. High has six shadow maps (room2048/hall1024); Medium two1024; Low retains same GI/direct lights. Shadow maps update for scene/door/quality changes. New maps initialize before sampling, including WebKit startup.

High architecture disappearance was reproduced in visible IAB: old SSR beauty rendering replaced the opaque image with the panorama. StableSSRPass contributes a bounded reflection layer over the primary image. Primary compositor retains 4×MSAA (Medium2); SSR depth/beauty single-sample. Wall/floor occlusion regression passes in all five browser projects. Supported PCF replaces deprecated PCFSoft. Roof winding, material sides and UVs remain correct. No fake contact-shadow rectangles. Painted-wall maps use UASTC; stable sub-LSB output dither reduces quantized bands without blur.

Owned Fab/Quixel: PaintedPlaster pjBoU0 (1m), SmoothConcrete tezmdjno (2×2m), OakVeneer tfjcffgc (2×4m), PaintedMetalDoor ugzobcglw (2×1m). Local Megascans fabric sjfvce3c keeps honest provenance. 45 KTX2 maps passed mip/sRGB/linear checks. Correct tile aspect ratios in web and Blender. Plants and selected chairs are PolyHaven CC0; other furniture is authored modular geometry. Do not claim all models came from Fab or exact Lumen parity.

Factory background is a generated full-sphere 2:1 panorama, native1774×887 with1024×512/512×256 tiers. Explicitly LDR converted to RGBE, not measured HDR. No planar window backdrop. Separate PMREM supplies glass reflections; indoor GI unchanged. Editor hides panorama. Unused legacy environment files excluded from dist.

## Verification

- npm test: 70 passed; npm run build passed, bundle index-B57NvPFT.js.
- Prior broad suite: Full100 functional cases initially88 passed/11 inapplicable skips/1 WebKit GPU failure. Fixed shadow readiness; failing16-preset scenario then passed on rerun. Effective89 unique functional cases passed/11 skipped. Entire100-case suite was not rerun afterward.
- New High opaque-architecture regression: 5/5 passed, Chromium desktop/portrait/landscape, WebKit tablet and Firefox desktop; no page/GL errors.
- Production review: 4×MSAA, SSR samples0, no page/resource errors, zero heavy Editor requests; approximately60FPS on RTX4070Ti. Not a promise for other hardware.
- Static /eds/index.html passed with and without float render targets. Earlier no-WebGL fallback, save/import/history tests passed.
- Fresh editable Blender concepts:16 collections,32 Cycles control views, visually reviewed. Correct input is prepared assets-src/room_archviz.blend; wrong source rejected and render brightness checked. Earlier wrong-input black QA renders replaced; live original unaffected. Fresh preset thumbnails included in dist.
- Evidence: assets-src/analysis/QA-summary.json, logs, test-results/review, assets-src/concepts/blender-visual-review.json, assets-src/signage/previews/exported/report.json. Large reports on E:/ArchViz_Resources/qa/2026-10-17.

## Resources and limits

Heavy downloads, conversions, bake intermediates and browser binaries on E:/ArchViz_Resources. Native EGS/Fab recovered via documented Computer Use/@oai/sky. Four downloaded materials already Saved in library. No purchases, new agreements or credential extraction. Targeted owned-library sofa search returned no item; modular furniture remains.

Signage dimensions inferred from photographed doors/wall bays, not surveyed; tiny unreadable timeline copy reconstructed. Panorama not measured HDR. Physical iOS/Android devices not tested. Exact Lumen parity not established. No remaining known failing automated scenario.

## Latest furniture, navigation and drag update

Floor Quixel ORM roughness measured 0.894–0.910 (mean0.902), metalness0; retained scan albedo contrast0.60. Floor SSR broad blur with maximum4% blend. All floor meshes use the same actual surface.

Furniture source fixes: continuous sofa backing and supported low seat; removed scalloped cushion deformation and floating decorative ridges;96-segment circular production silhouettes with rounded rims; continuous metre-scale cylindrical UVs; oval supports inside the actual tabletop contour; supports intersect underside rather than hovering; attached footrests on all3 stools; correct outward bent-shell winding and underseat saddles; closed two-wall lamp shades; proper chair back supports and tilted closed laptop with hinge, keyboard and mug. Source/GLB thumbnails rebuilt. Detailed geometry tests cover contact paths, real ray surfaces, outward volume and <0.8mm radial silhouette error.

Preset6 reconfigured; seating, storage and laptop orientation corrected across presets. TV85in variant3 in3/6/9/13 faces the sofa. Floating bar2 physically reaches the measured wall, with a narrow mounting allowance. Untouched builtin drafts refresh from current definitions; custom/modified drafts preserved.

Window collision includes actual glass/frame triangles on both sides and at raised camera heights; door colliders track their live hinge. Furniture remains nonblocking. Swept camera tests cover real room and hall GLBs, window gaps and open/closed door.

Direct card drag from the library has live proxy, floor/wall/support targeting, snap/free placement, invalid feedback, Escape/cancel/outside cleanup, one release commit and Undo. Desktop uses card, touch uses grip preserving catalog scrolling. Stable app-root pointer capture handles native touch.

Final targeted verification:70 unit tests passed;10 High/window browser cases passed across Chromium desktop/portrait/landscape, WebKit tablet and Firefox desktop;8 production library-drag cases passed on Chromium/Firefox and native Chromium touch,8 input-specific skips. Static subdirectory and no-float fallback passed;4 actual85in TV dimensions and6 production screenshots verified with no page/GL/HTTP errors. Fresh Blender16 concepts/32views and75 assets rebuilt. Live766-object source audit unchanged, MCP roundtrip724.6ms. Source copies and heavy resources remain on E.

Evidence: assets-src/analysis/furniture-*.log, test-results/furniture-review/review.json, test-results/library-drag/production/latest.json, and updated QA-summary. Full old100-case suite was not rerun after this change set; new targeted scenarios and geometry/state tests were rerun.

## Resume

Inspect this log, QA-summary and preview before editing. Keep all app work inside ThreeJS_ArchViz and live architecture unchanged. Do not repeat generation for its own sake.

Preview4174 and Blender9876 remain active. Start preview only if4174 is not listening: npm run preview from ThreeJS_ArchViz. npm run export:blender refreshes snapshot/export/bake/optimization. python tools/reexport_room.py --concepts also builds concepts/thumbnails. Concepts must use centered prepared source, never live original directly.
