"""Actual adjoining corridor strip; static non-editable context behind Door03."""
import bpy,bmesh,json
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture'
CX=.9477145;CY=-1.0209095
def keep(o):
 n=o.name
 return n in ['Floor_Continuous_00','Ceiling_Corrugated_Deck','Ceiling_Exposed_Steel_Trusses','Ceiling_Cable_Trays','Lamp_Suspension_Cables','Wall_38_Clean','Wall_38_Top_Steel_Beam','Hall_Lamp_North_04','Hall_Lamp_North_05'] or n.startswith(('Wall_38_Skirting_','Door_06_'))
for o in list(bpy.data.objects):
 if o.type!='MESH' or not keep(o):bpy.data.objects.remove(o,do_unlink=True)
for o in list(bpy.data.objects):
 o.data=o.data.copy();o.data.transform(o.matrix_world);o.parent=None;o.matrix_world=Matrix.Identity(4)
 bm=bmesh.new();bm.from_mesh(o.data)
 for co,no in [((-1.8,0,0),(-1,0,0)),((5.5,0,0),(1,0,0)),((0,2.2002,0),(0,-1,0)),((0,4.25,0),(0,1,0))]:
  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=co,plane_no=no,clear_outer=True,clear_inner=False)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
 if not len(o.data.polygons):bpy.data.objects.remove(o,do_unlink=True);continue
 while o.data.uv_layers:o.data.uv_layers.remove(o.data.uv_layers[0])
 uv=o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in p.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
 o.data.transform(Matrix.Translation((-CX,-CY,0)));o.data.update()
 o.hide_select=False;o.hide_viewport=False;o.hide_render=False;o['protected']=True;o['protectedGroup']='context';o['roomId']='actual-north-corridor';o['lightmapped']=False
 o.name='Context_'+o.name
bpy.context.view_layer.update()
for o in bpy.data.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'context.glb'),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True)
(OUT/'context.json').write_text(json.dumps({'schemaVersion':1,'roomId':'actual-north-corridor','source':'Actual full Blender reconstruction, unmodified strip north of Door03','units':'meter','editable':False,'sourceBounds':{'x':[-1.8,5.5],'y':[2.2002,4.25]},'bounds':{'min':[-1.8-CX,0,-(4.25-CY)],'max':[5.5-CX,4.355,-(2.2002-CY)]},'production':'assets/architecture/context.meshopt.glb','fallback':'assets/architecture/context.glb','nodes':[o.name for o in bpy.data.objects]},indent=2))
print('ACTUAL_CORRIDOR_CONTEXT_READY',len(bpy.data.objects))
