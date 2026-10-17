import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture'
im=bpy.data.images.load(str(OUT/'space-lightmap.hdr'),check_existing=False);im.colorspace_settings.name='Non-Color';im.file_format='HDR'
for n in (2048,1024):
 im.scale(n,n);im.filepath_raw=str(OUT/f'space-lightmap-{n//1024}k.hdr');im.save()
meta=json.loads((OUT/'scene-space.json').read_text());meta['lighting']['qualities']={'high':'assets/architecture/space-lightmap.hdr','medium':'assets/architecture/space-lightmap-2k.hdr','low':'assets/architecture/space-lightmap-1k.hdr'};meta['lighting']['qualityNote']='The identical linear indirect irradiance atlas, downsampled only; no GI or light changes between tiers.'
(OUT/'scene-space.json').write_text(json.dumps(meta,indent=2));print('SAME_GI_LIGHTMAP_LODS_READY')
