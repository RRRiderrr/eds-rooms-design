"""Lightweight exact architecture proxy; source dimensions and node IDs stay stable."""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture'
bpy.context.view_layer.update()
for o in list(bpy.data.objects):
 if o.type!='MESH':continue
 if 'Outlet' in o.name and 'Conduit' not in o.name:
  vs=[v.co.copy() for v in o.data.vertices];mi=Vector([min(v[i] for v in vs) for i in range(3)]);ma=Vector([max(v[i] for v in vs) for i in range(3)])
  v=[(mi.x,mi.y,mi.z),(ma.x,mi.y,mi.z),(ma.x,ma.y,mi.z),(mi.x,ma.y,mi.z),(mi.x,mi.y,ma.z),(ma.x,mi.y,ma.z),(ma.x,ma.y,ma.z),(mi.x,ma.y,ma.z)]
  faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
  mat=o.data.materials[0];mesh=bpy.data.meshes.new(o.name+'_EditorProxy');mesh.from_pydata(v,[],faces);mesh.materials.append(mat);o.data=mesh
  mod=o.modifiers.new('Rounded outlet silhouette','BEVEL');mod.width=.003;mod.segments=2
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 for uv in list(o.data.uv_layers):o.data.uv_layers.remove(uv)
 o['lightmapped']=False;o['representation']='editor-proxy'
for m in bpy.data.materials:
 if m.use_nodes:
  for n in list(m.node_tree.nodes):
   if n.type not in ('BSDF_PRINCIPLED','OUTPUT_MATERIAL'):m.node_tree.nodes.remove(n)
for o in bpy.data.objects:o.select_set(o.type in ('MESH','EMPTY'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'room-editor.glb'),export_format='GLB',use_selection=True,export_texcoords=False,export_normals=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True)
print('EDITOR_PROXY_READY',sum(len(o.data.vertices) for o in bpy.data.objects if o.type=='MESH'))
