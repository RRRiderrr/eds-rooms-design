import bpy,json,hashlib
from pathlib import Path
ROOT=Path(r'C:/Users/kakuc/Downloads/blender-mcp/ThreeJS_ArchViz')
audit=json.loads((ROOT/'assets-src/analysis/protection_audit.json').read_text())
def fp(o):
 d={'matrix':[list(r) for r in o.matrix_world]}
 if o.type=='MESH':d['verts']=[list(v.co) for v in o.data.vertices];d['faces']=[list(p.vertices) for p in o.data.polygons]
 return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
changed=[]
for name,expected in audit['ceilingHashes'].items():
 o=bpy.data.objects.get(name)
 if not o or fp(o)!=expected:changed.append(name)
report={'currentLiveFile':bpy.data.filepath,'liveObjectCount':len(bpy.data.objects),'protectedObjects':len(audit['ceilingHashes']),'changedRoofMeshOrTransform':changed,'roofPreserved':not changed,'sourceRoomWasNeverCropped':len(bpy.data.objects)>700,'locksPreserved':all(bpy.data.objects[n].hide_select and all(bpy.data.objects[n].lock_location) and all(bpy.data.objects[n].lock_rotation) and all(bpy.data.objects[n].lock_scale) for n in audit['ceilingHashes'])}
(ROOT/'assets-src/analysis/final_live_source_audit.json').write_text(json.dumps(report,indent=2))
result=report
