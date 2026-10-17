import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];p=ROOT/'public/assets/architecture/scene-space.json';d=json.loads(p.read_text())
colliders=[]
for o in bpy.data.objects:
 if o.type!='MESH' or not ('Column' in o.name or o.name.endswith('_Leaf')):continue
 if o.name.startswith('Door_03_') or o.name=='Central_Room_SW_Steel_Column':continue
 ps=[o.matrix_world@v.co for v in o.data.vertices];lo=[min(v[i] for v in ps) for i in range(3)];hi=[max(v[i] for v in ps) for i in range(3)]
 colliders.append({'id':o.name,'kind':'column' if 'Column' in o.name else 'staticClosedDoor','bounds':{'min':[lo[0]-.9477145,lo[2],-(hi[1]+1.0209095)],'max':[hi[0]-.9477145,hi[2],-(lo[1]+1.0209095)]}})
import re
groups={}
for o in bpy.data.objects:
 if o.type!='MESH':continue
 match=re.match(r'^(Desk_\d+|East_Desk_\d+)',o.name)
 if not match and 'Column' not in o.name:continue
 key=match.group(1) if match else o.name
 groups.setdefault(key,[]).extend([o.matrix_world@Vector(v) for v in o.bound_box])
d['navigation']['obstacles']=[{'id':k,'minX':min(v.x for v in ps)-.9477145,'maxX':max(v.x for v in ps)-.9477145,'minZ':-(max(v.y for v in ps)+1.0209095),'maxZ':-(min(v.y for v in ps)+1.0209095),'height':max(v.z for v in ps),'kind':'column' if 'Column' in k else 'structure'} for k,ps in groups.items()]
area=0.0
for o in bpy.data.objects:
 if o.type!='MESH' or not o.name.startswith('Floor_'):continue
 for polygon in o.data.polygons:
  points=[o.matrix_world@o.data.vertices[i].co for i in polygon.vertices]
  if (points[1]-points[0]).cross(points[2]-points[0]).z<=0:continue
  area+=sum(abs((points[i]-points[0]).cross(points[i+1]-points[0]).z)/2 for i in range(1,len(points)-1))
d['floorAreaSquareMeters']=area
d['navigation']['individualStaticColliders']=colliders;d['navigation']['batchCollisionNote']='Space_structure and Space_doors are draw-call batches. For collision use actual triangles or these per-source bounds, never the full batch AABB. Furniture intentionally absent.';p.write_text(json.dumps(d,indent=2))
print('INDIVIDUAL_ARCHITECTURE_COLLIDERS_READY',len(colliders))
