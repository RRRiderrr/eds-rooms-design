from pathlib import Path
from PIL import Image,ImageDraw
p=Path('C:/Users/kakuc/AppData/Local/Temp');files=sorted(p.glob('codex-clipboard-*.png'),key=lambda f:f.stat().st_mtime,reverse=True)[:10]
out=Image.new('RGB',(1250,1500),'#ddd');d=ImageDraw.Draw(out)
for i,f in enumerate(files):
 im=Image.open(f);im.thumbnail((400,430));x=(i%3)*415;y=(i//3)*375;out.paste(im,(x,y));d.text((x+5,y+345),str(i)+' '+f.name[16:24],fill='black')
out.save('ThreeJS_ArchViz/assets-src/signage/recent-contact.jpg')
