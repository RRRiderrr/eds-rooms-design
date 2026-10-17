import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];p=ROOT/'public/assets/architecture/room.json';d=json.loads(p.read_text())
bpy.context.view_layer.update()
out=[]
for o in bpy.data.objects:
 if 'Outlet' in o.name and 'Conduit' not in o.name:
  pts=[o.matrix_world@v.co for v in o.data.vertices]
  mi=[min(v[i] for v in pts) for i in range(3)];ma=[max(v[i] for v in pts) for i in range(3)];c=[(mi[i]+ma[i])/2 for i in range(3)]
  out.append({'id':o.name,'position':[c[0],c[2],-c[1]],'size':[ma[0]-mi[0],ma[2]-mi[2],ma[1]-mi[1]]})
d['outlets']=out;d['id']='lounge-room-01';d['architectureId']='polycam-current-room-v1';p.write_text(json.dumps(d,indent=2))
print('METADATA_FIXED',out)
