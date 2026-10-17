"""4K Cycles indirect-only atlas for the complete actual building complement."""
import bpy,json,math,time
from pathlib import Path
from mathutils import Matrix
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture';WORK=Path('E:/ArchViz_Resources/bake')
scene=bpy.context.scene;original=[o for o in bpy.data.objects if o.type=='MESH']
excluded={'existingFurniture','windows','lighting'}
static=[o for o in original if o.get('protectedGroup') not in excluded]
for o in original:
 o['lightmapped']=o in static
 if o.get('protectedGroup')=='existingFurniture':o.hide_render=True
# The separate room closes the architecture for the bake, but is never exported twice.
with bpy.data.libraries.load(str(ROOT/'assets-src/room_archviz.blend'),link=False) as (src,dst):dst.objects=list(src.objects)
for o in dst.objects:
 if not o:continue
 scene.collection.objects.link(o);o['bakeTemporaryCentralOccluder']=True
# Actual sources of the remaining hall fixtures, original energies/positions.
with bpy.data.libraries.load('E:/ArchViz_Resources/exports/full-space-source.blend',link=False) as (src,dst):dst.objects=[n for n in src.objects if n.startswith('Hall_Lamp_') and n.endswith('_Area')]
for o in dst.objects:
 if not o:continue
 scene.collection.objects.link(o);o.location.x-=.9477145;o.location.y-=-1.0209095;o['bakeTemporaryLight']=True
verts=[];faces=[];cursor=0
for o in static:
 verts.extend([o.matrix_world@v.co for v in o.data.vertices]);faces.extend([[i+cursor for i in p.vertices] for p in o.data.polygons]);cursor+=len(o.data.vertices)
m=bpy.data.meshes.new('Space_Atlas_Packing');m.from_pydata(verts,[],faces);m.uv_layers.new(name='Lightmap')
a=bpy.data.objects.new('Space_Atlas_Packing',m);scene.collection.objects.link(a)
bpy.ops.object.select_all(action='DESELECT');a.select_set(True);bpy.context.view_layer.objects.active=a
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.0025,area_weight=.3,correct_aspect=True,scale_to_bounds=True);bpy.ops.object.mode_set(mode='OBJECT')
uvs=[tuple(v.uv) for v in m.uv_layers.active.data];cursor=0
for o in static:
 uv=o.data.uv_layers.get('Lightmap') or o.data.uv_layers.new(name='Lightmap')
 for i,d in enumerate(uv.data):d.uv=uvs[cursor+i]
 cursor+=len(uv.data);o.data.uv_layers.active_index=1
bpy.data.objects.remove(a,do_unlink=True)
im=bpy.data.images.new('Full_Space_Indirect_4K',width=4096,height=4096,float_buffer=True,alpha=False);im.colorspace_settings.name='Non-Color'
bpy.ops.object.select_all(action='DESELECT')
for o in static:
 o.select_set(True)
 for mat in o.data.materials:
  if not mat:continue
  for n in mat.node_tree.nodes:n.select=False
  n=mat.node_tree.nodes.get('BAKE_Space_Indirect') or mat.node_tree.nodes.new('ShaderNodeTexImage');n.name='BAKE_Space_Indirect';n.image=im;n.select=True;mat.node_tree.nodes.active=n
bpy.context.view_layer.objects.active=static[0]
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64;scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=6;scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.025;scene.render.threads_mode='FIXED';scene.render.threads=8
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
 if any(d.type=='OPTIX' for d in prefs.devices):
  for d in prefs.devices:d.use=d.type=='OPTIX'
  scene.cycles.device='GPU'
except Exception:pass
if not scene.world:scene.world=bpy.data.worlds.new('Space_Bake_World')
scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.72,.79,.86,1);bg.inputs['Strength'].default_value=.22
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False;scene.render.bake.margin=16;scene.render.bake.use_clear=True
t=time.time();print('FULL_SPACE_INDIRECT_START',len(static),flush=True)
bpy.ops.object.bake(type='DIFFUSE',pass_filter={'INDIRECT'},margin=16)
im.filepath_raw=str(OUT/'space-lightmap.hdr');im.file_format='HDR';im.save()
im.filepath_raw=str(WORK/'space-indirect-linear.exr');im.file_format='OPEN_EXR';im.save()
for o in list(bpy.data.objects):
 if o not in original:bpy.data.objects.remove(o,do_unlink=True)
for o in original:
 o.hide_render=False;o.select_set(True)
 if o.data.uv_layers:o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
bpy.ops.wm.save_as_mainfile(filepath='E:/ArchViz_Resources/exports/space-baked.blend')
bpy.ops.export_scene.gltf(filepath=str(OUT/'space.glb'),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True)
meta=json.loads((OUT/'scene-space.json').read_text());ids={o.name for o in static}
for n in meta['nodes']:n['lightmapped']=n['name'] in ids
meta['lighting']={'type':'cycles-indirect-only','lightmap':'assets/architecture/space-lightmap.hdr','uvChannel':1,'samples':64,'resolution':4096,'bounces':8,'directIncluded':False,'albedoIncluded':False,'movableSourceFurnitureIncluded':False,'runtimeDirectRequired':True}
(OUT/'scene-space.json').write_text(json.dumps(meta,indent=2))
(ROOT/'assets-src/analysis/space_bake_report.json').write_text(json.dumps({'seconds':time.time()-t,'nodes':len(static),'resolution':4096,'samples':64,'pass':'INDIRECT only; no COLOR/DIRECT','sourceFurnitureHiddenDuringBake':True,'centralArchitectureAddedAsTemporaryOccluder':True},indent=2))
print('FULL_SPACE_INDIRECT_READY',time.time()-t,flush=True)
