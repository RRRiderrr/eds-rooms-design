"""Pixel-centre overlap audit of the actual shared lightmap UV, no source edits."""
import bpy,json,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];N=1024
owner=np.full((N,N),-1,dtype=np.int32);face_id=0;overlap=0;covered=0;bad=[]
for o in bpy.data.objects:
 if o.type!='MESH' or not o.get('lightmapped'):continue
 uv=o.data.uv_layers.get('Lightmap')
 if not uv:bad.append(o.name+':missing UV1');continue
 for p in o.data.polygons:
  vs=np.array([tuple(uv.data[i].uv) for i in p.loop_indices],dtype=np.float64)*N
  for i in range(1,len(vs)-1):
   a,b,c=vs[[0,i,i+1]];lo=np.maximum(0,np.floor(np.min([a,b,c],axis=0)).astype(int));hi=np.minimum(N-1,np.ceil(np.max([a,b,c],axis=0)).astype(int))
   if np.any(hi<lo):continue
   x,y=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
   den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-12:continue
   u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
   v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
   inside=(u>1e-7)&(v>1e-7)&(u+v<1-1e-7)
   tile=owner[lo[1]:hi[1]+1,lo[0]:hi[0]+1]
   overlap+=int(np.count_nonzero(inside&(tile>=0)&(tile!=face_id)));covered+=int(np.count_nonzero(inside&(tile<0)));tile[inside]=face_id
  face_id+=1
report={'resolution':N,'faceCount':face_id,'coveredPixels':covered,'overlappingPixelSamples':overlap,'overlapFraction':overlap/max(1,covered),'missingUV':bad,'method':'Triangle interior pixel-centre raster; shared triangle edges excluded. Distinct original polygon owners.'}
(ROOT/'assets-src/analysis/roof_atlas_overlap_audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
