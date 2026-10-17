import bpy,json,hashlib,os
from pathlib import Path
root=Path(r'C:/Users/kakuc/Downloads/blender-mcp/ThreeJS_ArchViz')
def fp(o):
 d={'matrix':[list(r) for r in o.matrix_world]}
 if o.type=='MESH':d['verts']=[list(v.co) for v in o.data.vertices];d['faces']=[list(p.vertices) for p in o.data.polygons]
 return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
cols=[o for o in bpy.data.objects if any(c.name in ['Ceiling_Structure','HVAC','Lighting'] for c in o.users_collection)]
before={o.name:fp(o) for o in cols}
backup=root/'assets-src'/'reconstructed_room.before_archviz.blend'
if not backup.exists():bpy.ops.wm.save_as_mainfile(filepath=str(backup),copy=True)
for o in cols:
 o.hide_select=True;o.lock_location=(True,)*3;o.lock_rotation=(True,)*3;o.lock_scale=(True,)*3;o['archviz_protected']=True
for o in bpy.data.objects:
 if any(c.name in ['Architecture_Walls','Architecture_Floor','Windows'] for c in o.users_collection):
  o['archviz_protected']=True
for name in ['Architecture_Static','Architecture_Door','Interior_Editables','ArchViz_Assets','Editor_Proxies','Bake','Export']:
 if name not in bpy.data.collections:
  c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c)
copy=root/'assets-src'/'room_archviz.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(copy),copy=True)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
after={o.name:fp(o) for o in cols}
report={'file':bpy.data.filepath,'objects':len(bpy.data.objects),'ceilingHashes':before,'ceilingGeometryUnchanged':before==after,'protectedCount':len(cols),'sourceCopy':str(copy),'backup':str(backup),'doorLeafBounds':[list(bpy.data.objects['Door_03_CLOSED_Leaf'].matrix_world@__import__('mathutils').Vector(p)) for p in bpy.data.objects['Door_03_CLOSED_Leaf'].bound_box]}
(root/'assets-src'/'analysis'/'protection_audit.json').write_text(json.dumps(report,indent=2))
result={k:v for k,v in report.items() if k!='ceilingHashes'}
