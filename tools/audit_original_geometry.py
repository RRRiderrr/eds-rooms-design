"""Compare live full-building geometry against the pre-ArchViz safe backup."""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(r'C:/Users/kakuc/Downloads/blender-mcp/ThreeJS_ArchViz')
def fp(o):
 d={'matrix':[list(r) for r in o.matrix_world],'parent':o.parent.name if o.parent else None,'type':o.type}
 if o.type=='MESH':
  d['verts']=[list(v.co) for v in o.data.vertices];d['faces']=[(list(p.vertices),p.material_index) for p in o.data.polygons]
  d['materials']=[m.name if m else None for m in o.data.materials]
 return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
actual={o.name:fp(o) for o in bpy.data.objects};path=ROOT/'assets-src/analysis/pre_archviz_all_object_hashes.json'
if bpy.app.background:
 path.write_text(json.dumps(actual,indent=2));print('BASELINE_CAPTURED',len(actual))
else:
 expected=json.loads(path.read_text());changed=[n for n,v in expected.items() if actual.get(n)!=v]
 result={'originalObjectCount':len(expected),'currentObjectCount':len(actual),'changedGeometryTransformParentOrMaterialAssignment':changed,'allOriginalGeometryPreserved':not changed}
 (ROOT/'assets-src/analysis/full_scene_preservation_audit.json').write_text(json.dumps(result,indent=2))
