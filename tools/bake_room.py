"""Cycles architecture-only irradiance atlas, probe lattice and reflection panorama.
All mutable furniture is deliberately excluded. Run after export_room.py.
"""
import bpy, json, math, os, time
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture'
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU'
scene.cycles.samples=64;scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.025
scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=6;scene.cycles.glossy_bounces=4
scene.cycles.transmission_bounces=6;scene.cycles.use_denoising=True
scene.render.threads_mode='AUTO'
world=bpy.data.worlds.new('Room_Studio_Environment') if not scene.world else scene.world
scene.world=world;world.use_nodes=True
bg=world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.72,.79,.86,1);bg.inputs['Strength'].default_value=.22
for m in bpy.data.materials:
 if m.use_nodes and 'WINDOW_PANES' in m.name:
  n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(.68,.77,.79,1)
  n.inputs['Transmission Weight'].default_value=.65;n.inputs['Roughness'].default_value=.12
  n.inputs['IOR'].default_value=1.5
static=[o for o in bpy.data.objects if o.type=='MESH' and o.get('lightmapped')]
vertices=[];faces=[];cursor=0
for o in static:
 o.hide_set(False);o.hide_select=False
 verts=[o.matrix_world@v.co for v in o.data.vertices]
 vertices.extend(verts)
 faces.extend([[vi+cursor for vi in p.vertices] for p in o.data.polygons]);cursor+=len(verts)
mesh=bpy.data.meshes.new('Atlas_Packing_Temporary');mesh.from_pydata(vertices,[],faces);mesh.update()
atlas=bpy.data.objects.new('Atlas_Packing_Temporary',mesh);scene.collection.objects.link(atlas)
mesh.uv_layers.new(name='Lightmap')
bpy.ops.object.select_all(action='DESELECT');atlas.select_set(True);bpy.context.view_layer.objects.active=atlas
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.0035,area_weight=.3,correct_aspect=True,scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
uvs=[tuple(d.uv) for d in mesh.uv_layers.active.data];cursor=0
for o in static:
 uv=o.data.uv_layers.get('Lightmap') or o.data.uv_layers.new(name='Lightmap')
 for i,d in enumerate(uv.data):d.uv=uvs[cursor+i]
 cursor+=len(uv.data);o.data.uv_layers.active_index=1
bpy.data.objects.remove(atlas,do_unlink=True)
image=bpy.data.images.new('Architecture_Irradiance_2K',width=2048,height=2048,float_buffer=True,alpha=False)
image.colorspace_settings.name='Non-Color'
def targets(objects,image):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:
  o.select_set(True)
  for slot in o.material_slots:
   m=slot.material
   if not m:continue
   m.use_nodes=True
   for n in m.node_tree.nodes:n.select=False
   n=m.node_tree.nodes.get('BAKE_Irradiance_Target') or m.node_tree.nodes.new('ShaderNodeTexImage')
   n.name='BAKE_Irradiance_Target';n.image=image;n.select=True;m.node_tree.nodes.active=n
 bpy.context.view_layer.objects.active=objects[0]
scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False
scene.render.bake.margin=12;scene.render.bake.use_clear=True
targets(static,image)
start=time.time();print('CYCLES_ARCHITECTURE_BAKE_START',len(static),flush=True)
bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT','INDIRECT'},margin=12)
image.filepath_raw=str(OUT/'lightmap.hdr');image.file_format='HDR';image.save()
image.filepath_raw=str(ROOT/'assets-src/bake/lightmap-linear.exr');image.file_format='OPEN_EXR';image.save()
print('CYCLES_ARCHITECTURE_BAKE_READY',round(time.time()-start,2),flush=True)

# Dedicated UV2 reference makes TEXCOORD_1 unambiguously exported by glTF.
for m in bpy.data.materials:
 if not m.use_nodes:continue
 tree=m.node_tree
 tex=tree.nodes.get('BAKE_Irradiance_Target')
 if tex:
  uv=tree.nodes.new('ShaderNodeUVMap');uv.uv_map='Lightmap';uv.name='Baked_Lightmap_UV2'
  tree.links.new(uv.outputs['UV'],tex.inputs['Vector'])
for o in static:o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
# Save the image and UV2 in Blender source. Runtime applies atlas separately, so
# source PBR basecolor is not multiplied or baked into the geometry export.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-src/room_archviz.blend'))
for o in bpy.data.objects:o.select_set(o.type in ('MESH','EMPTY'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'room.glb'),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True)

def camera(name,loc,target,lens=23):
 d=bpy.data.cameras.new(name);d.lens=lens
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
 o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();scene.camera=o
 return o
# Neutral panorama of precisely this immutable architecture for PMREM reflections.
cam=camera('Bake_Reflection_Center',(0,-.2,1.5),(0,-2,1.5))
cam.data.type='PANO';cam.data.panorama_type='EQUIRECTANGULAR'
scene.render.resolution_x=1024;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.cycles.samples=32;scene.render.image_settings.file_format='HDR';scene.render.filepath=str(OUT/'environment.hdr')
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0
bpy.ops.render.render(write_still=True)
cam.data.type='PERSP';cam.data.lens=20
cam.location=(2.15,1.65,1.65);cam.rotation_euler=(Vector((-.1,-2.1,1.65))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.render.resolution_x=1440;scene.render.resolution_y=1000
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=90
scene.render.filepath=str(OUT/'fallback.jpg');scene.cycles.samples=48
bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(cam,do_unlink=True)

# Six orthogonal, microscopic diffuse receiver faces at each sample point.
# These measure actual Cycles incident irradiance without radiance from furniture.
probe_image=bpy.data.images.new('Probe_Axis_Irradiance',width=256,height=256,float_buffer=True,alpha=False)
probe_image.colorspace_settings.name='Non-Color'
mat=bpy.data.materials.new('Probe_Receiver');mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Roughness'].default_value=1
dirs=[Vector((1,0,0)),Vector((-1,0,0)),Vector((0,1,0)),Vector((0,-1,0)),Vector((0,0,1)),Vector((0,0,-1))]
verts=[];faces=[];pinfo=[]
positions=[(x,y,z) for z in (.75,1.6) for x in (-1.8,0,1.8) for y in (-2.15,0,2.15)]
for pi,pos in enumerate(positions):
 for di,no in enumerate(dirs):
  # Blender vectors corresponding to app PX,NX,PY,NY,PZ,NZ.
  no=Vector((no.x,-no.z,no.y))
  u=no.cross(Vector((0,0,1)) if abs(no.z)<.8 else Vector((0,1,0))).normalized()*.001
  v=no.cross(u).normalized()*.001
  c=Vector(pos);base=len(verts);verts.extend([c-u-v,c+u-v,c+u+v,c-u+v]);faces.append([base,base+1,base+2,base+3])
pm=bpy.data.meshes.new('Irradiance_Probe_Axis_Receivers');pm.from_pydata(verts,[],faces);pm.materials.append(mat)
po=bpy.data.objects.new('Irradiance_Probe_Axis_Receivers',pm);scene.collection.objects.link(po)
po.visible_shadow=False;po.visible_glossy=False;po.visible_transmission=False
uv=pm.uv_layers.new(name='UVMap')
for fi,p in enumerate(pm.polygons):
 col=fi%12;row=fi//12;x0=(col+.12)/12;y0=(row+.12)/12;x1=(col+.88)/12;y1=(row+.88)/12
 for li,co in zip(p.loop_indices,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)]):uv.data[li].uv=co
targets([po],probe_image);scene.cycles.samples=48
bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT','INDIRECT'},margin=1)
pixels=list(probe_image.pixels);probes=[];keys=['px','nx','py','ny','pz','nz']
for pi,pos in enumerate(positions):
 vals=[]
 for di in range(6):
  fi=pi*6+di;px=int((fi%12+.5)/12*256);py=int((fi//12+.5)/12*256)
  vals.append([max(0,pixels[(py*256+px)*4+c]) for c in range(3)])
 # SH l=0 and l=1 fit (Three.js IrradianceConvolution constants).
 avg=[sum(v[c] for v in vals)/6 for c in range(3)]
 sh=[[v/.886227 for v in avg]]+[[0.,0.,0.] for _ in range(8)]
 # Three SphericalHarmonics3 basis order: y,z,x for coefficients 1,2,3.
 for ci,(a,b) in zip((3,1,2),((0,1),(2,3),(4,5))):
  sh[ci]=[(vals[a][c]-vals[b][c])/(2*1.023327) for c in range(3)]
 probes.append({'position':[pos[0],pos[2],-pos[1]],'irradiance':dict(zip(keys,vals)),'sh':sh})
(OUT/'probes.json').write_text(json.dumps({'schemaVersion':1,'coordinateSystem':'Y-up','encoding':'linear-rgb-irradiance','method':'Cycles 48 sample, diffuse direct+indirect, six-axis receiver bake, architecture only','grid':[3,2,3],'probes':probes},indent=2))
probe_image.filepath_raw=str(ROOT/'assets-src/bake/probes-linear.exr');probe_image.file_format='OPEN_EXR';probe_image.save()
bpy.data.objects.remove(po,do_unlink=True)
report={'engine':'Cycles','samples':64,'bounces':8,'diffuseBounces':6,'resolution':2048,'pass':'DIFFUSE direct+indirect; color disabled','mutableFurnitureIncluded':False,'uniqueUvSet':'Lightmap/TEXCOORD_1','probeCount':len(probes),'atlasPixels':2048**2,'bakeSeconds':round(time.time()-start,2)}
(ROOT/'assets-src/analysis/bake_report.json').write_text(json.dumps(report,indent=2))
print('ALL_BAKE_ASSETS_READY',flush=True)
