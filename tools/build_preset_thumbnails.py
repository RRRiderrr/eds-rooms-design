"""Small production preset cards from the verified Blender concept renders."""
from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/preset-thumbnails';OUT.mkdir(parents=True,exist_ok=True)
for i in range(16):
 src=ROOT/f'assets-src/previews/concepts/preset-{i:02d}-door.jpg'
 if not src.exists():continue
 with Image.open(src) as im:
  im.resize((400,300),Image.Resampling.LANCZOS).save(OUT/f'preset-{i}.jpg',quality=82,optimize=True)
(OUT/'manifest.json').write_text(json.dumps({'source':'Cycles renders of actual room and shipped production GLBs','items':[{'presetId':f'builtin-{i}','image':f'assets/preset-thumbnails/preset-{i}.jpg'} for i in range(16)]},indent=2))
print('Preset thumbnails ready')
