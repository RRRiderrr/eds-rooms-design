import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture'
im=bpy.data.images.load(str(OUT/'lightmap.hdr'),check_existing=False);p=list(im.pixels);w,h=im.size
def sample(u,v):
 x=max(0,min(w-1,int(u*w)));y=max(0,min(h-1,int(v*h)));i=(y*w+x)*4
 return p[i:i+3]
report=[]
for o in bpy.data.objects:
 if o.type!='MESH' or not o.get('lightmapped'):continue
 uv=o.data.uv_layers.get('Lightmap');vals=[]
 for face in o.data.polygons:
  us=[uv.data[li].uv for li in face.loop_indices]
  vals.extend(sample(sum(u.x for u in us)/len(us),sum(u.y for u in us)/len(us)))
 report.append({'name':o.name,'lightmapMean':sum(vals)/len(vals),'max':max(vals),'zeroSamples':sum(v<1e-5 for v in vals),'samples':len(vals)})
scene=bpy.context.scene;scene.view_settings.view_transform='AgX'
im.save_render(str(ROOT/'assets-src/previews/lightmap-atlas.png'),scene=scene)
(ROOT/'assets-src/analysis/lightmap_validation.json').write_text(json.dumps({'size':[w,h],'objects':report},indent=2))
print(json.dumps(report,indent=2))
