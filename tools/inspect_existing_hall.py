"""Read-only inventory of the current live Blender file through its local MCP bridge."""
import argparse, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))
from blender_rpc import execute

CODE = r'''
import bpy,json,hashlib,re
from mathutils import Vector
def bounds(o):
 ps=[o.matrix_world@Vector(p) for p in o.bound_box] if o.type=='MESH' else []
 return {'min':[min(p[i] for p in ps) for i in range(3)],'max':[max(p[i] for p in ps) for i in range(3)]} if ps else None
def item(o):
 return {'name':o.name,'type':o.type,'parent':o.parent.name if o.parent else None,'children':[c.name for c in o.children],
 'matrix':[list(r) for r in o.matrix_world],'location':list(o.location),'rotation':list(o.rotation_euler),'scale':list(o.scale),
 'dimensions':list(o.dimensions),'bounds':bounds(o),'collections':[c.name for c in o.users_collection],
 'visible':o.visible_get(),'hideViewport':o.hide_viewport,'hideRender':o.hide_render,
 'materials':[m.name if m else None for m in o.data.materials] if o.type=='MESH' else [],
 'vertices':len(o.data.vertices) if o.type=='MESH' else 0,'polygons':len(o.data.polygons) if o.type=='MESH' else 0,
 'properties':{k:str(o[k]) for k in o.keys()}}
relevant=[o for o in bpy.data.objects if o.name.startswith(('Desk_','East_Desk_','Door_','Window_','Wall_','Floor_','Central_Room_','Central_Window_','Column_'))]
fingerprints={}
for o in bpy.data.objects:
 d={'matrix':[list(r) for r in o.matrix_world]}
 if o.type=='MESH':d['vertices']=[list(v.co) for v in o.data.vertices];d['faces']=[list(p.vertices) for p in o.data.polygons]
 fingerprints[o.name]=hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':')).encode()).hexdigest()
views=[]
for window in bpy.context.window_manager.windows:
 for area in window.screen.areas:
  if area.type=='VIEW_3D':
   r=area.spaces.active.region_3d
   views.append({'viewLocation':list(r.view_location),'viewRotation':list(r.view_rotation),'viewDistance':r.view_distance,'perspective':r.view_perspective})
result={'file':bpy.data.filepath,'objectCount':len(bpy.data.objects),'unitScale':bpy.context.scene.unit_settings.scale_length,
'selected':[o.name for o in bpy.context.selected_objects],'objects':[item(o) for o in relevant],
'geometryFingerprints':fingerprints,'viewports':views}
'''

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--output',type=Path,default=ROOT/'assets-src/main-hall/live-inventory.json'); args=parser.parse_args()
    response=execute(CODE,timeout=60)
    if response.get('status')!='ok':raise RuntimeError(response)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(response['result'],ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'file':response['result']['file'],'objects':response['result']['objectCount'],'relevant':len(response['result']['objects']),'output':str(args.output),'roundtripMs':response['roundtrip_ms']},ensure_ascii=False))
if __name__=='__main__':main()
