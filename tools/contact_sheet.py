from PIL import Image,ImageDraw
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]/'assets-src/previews/concepts'
all_presets=len(sys.argv)>1 and sys.argv[1]=='all'
start=0 if all_presets else int(sys.argv[1]) if len(sys.argv)>1 else 0
count=16 if all_presets else 8
out=Image.new('RGB',(1600,((count+3)//4)*520),(235,238,237));d=ImageDraw.Draw(out)
for k,i in enumerate(range(start,start+count)):
 for vi,view in enumerate(['window','door']):
  im=Image.open(root/f'preset-{i:02d}-{view}.jpg');im.thumbnail((390,240));x=(k%4)*400;y=(k//4)*520+vi*260;out.paste(im,(x,y));d.text((x+7,y+242),f'Preset {i} | {view}',fill=(25,35,35))
out.save(root/('all-presets-review.jpg' if all_presets else f'contact-{start:02d}-{start+count-1:02d}.jpg'))
