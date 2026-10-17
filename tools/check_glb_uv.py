import json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'public/assets/architecture/room.glb';b=p.read_bytes();jl=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+jl]);data=b[28+jl:]
reports=[]
for n in d['nodes']:
 if 'mesh' not in n:continue
 for pi,prim in enumerate(d['meshes'][n['mesh']]['primitives']):
  r={'node':n['name'],'primitive':pi,'lightmapped':n.get('extras',{}).get('lightmapped')}
  for key,idx in prim['attributes'].items():
   if not key.startswith('TEXCOORD'):continue
   a=d['accessors'][idx];v=d['bufferViews'][a['bufferView']];off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',8)
   vs=[struct.unpack_from('<2f',data,off+i*stride) for i in range(a['count'])]
   r[key]={'min':[min(v[i] for v in vs) for i in range(2)],'max':[max(v[i] for v in vs) for i in range(2)]}
  reports.append(r)
(ROOT/'assets-src/analysis/export_uv_validation.json').write_text(json.dumps(reports,indent=2))
print(json.dumps([r for r in reports if r['node'] in ['Ceiling_Corrugated_Deck','Floor_Continuous_00','Wall_16_Clean','Door_03_CLOSED_Leaf']],indent=2))
