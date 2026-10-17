"""Genuine scene-linear Cycles HDR backdrop modelled from the factory photo.
Existing corrugated roof/truss geometry is reused in this separate authoring asset.
This is a rendered background reconstruction, not an LDR photo labelled HDR.
"""
import bpy,json,math,time
from pathlib import Path
from mathutils import Vector,Matrix
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/environment';OUT.mkdir(parents=True,exist_ok=True)
WORK=Path('E:/ArchViz_Resources/factory');WORK.mkdir(parents=True,exist_ok=True)
roof=bpy.data.objects['Ceiling_Corrugated_Deck'];roofmesh=roof.data.copy();roofmesh.transform(roof.matrix_world)
truss=bpy.data.objects['Ceiling_Exposed_Steel_Trusses'];trussmesh=truss.data.copy();trussmesh.transform(truss.matrix_world)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene
def mat(n,c,rough=.7,metal=0,emit=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 if emit:bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=emit
 return m
steel=mat('Factory_reference_grey_steel',(.14,.16,.17),.7,.12);deck=mat('Factory_existing_corrugated_deck',(.22,.24,.25),.8)
wall=mat('Factory_grey_wall_panels',(.38,.40,.41),.86);floor=mat('Factory_grey_concrete',(.17,.18,.19),.8)
yellow=mat('Factory_reference_yellow_crane',(.48,.30,.028),.58,.12);dark=mat('Factory_dark_machines',(.035,.045,.052),.6,.12)
white=mat('Factory_luminaire',(1,.97,.90),.4,0,35)
def obj(n,mesh,ma):
 o=bpy.data.objects.new(n,mesh);scene.collection.objects.link(o);o.data.materials.clear();o.data.materials.append(ma);return o
for name,mesh,ma in [('Reused_actual_corrugated_roof',roofmesh,deck),('Reused_actual_industrial_trusses',trussmesh,steel)]:
 for v in mesh.vertices:v.co.y*=3.25;v.co.z+=5
 obj(name,mesh,ma)
def box(n,loc,dim,ma):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(ma);return o
box('Factory_concrete_floor',(0,0,-.1),(51,29,.2),floor)
box('Factory_far_wall',(0,13.7,4.65),(50,.2,9.3),wall)
box('Factory_left_wall',(-24.8,0,4.65),(.2,28,9.3),wall);box('Factory_right_wall',(24.8,0,4.65),(.2,28,9.3),wall)
box('Factory_near_wall',(0,-13.7,4.65),(50,.2,9.3),wall)
# H columns and industrial sidewall ribs; proportions follow the reference hall.
for x in range(-24,25,6):
 for y in (-12.7,12.7):
  for off in (-.19,.19):box(f'H_column_flange_{x}_{y}_{off}',(x+off,y,4.65),(.055,.42,9.3),steel)
  box(f'H_column_web_{x}_{y}',(x,y,4.65),(.40,.065,9.3),steel)
for x in range(-24,25,2):box(f'Panel_rib_{x}',(x,13.56,4.6),(.04,.05,9.2),steel)
# The grey end trusses and yellow bridge beams are the visible evidence in the photo.
for yy in (-1.0,8.5):
 box(f'Yellow_crane_web_{yy}',(0,yy,4.85),(43,.18,.72),yellow)
 box(f'Yellow_crane_top_flange_{yy}',(0,yy,5.22),(43,.62,.075),yellow)
 box(f'Yellow_crane_lower_flange_{yy}',(0,yy,4.48),(43,.62,.075),yellow)
 for xx in (-21.5,21.5):box(f'Crane_end_carriage_{yy}_{xx}',(xx,yy,5.2),(.8,1.3,.4),dark)
 tx=5 if yy<0 else -10;box(f'Crane_trolley_{yy}',(tx,yy,4.35),(1.1,.9,.40),dark)
 box(f'Crane_hoist_cable_{yy}',(tx,yy,3.15),(.025,.025,2.0),dark)
for xx in (-21.5,21.5):box(f'Crane_runway_{xx}',(xx,0,5.15),(.35,27,.45),steel)
# Quiet distant equipment; no invented room architecture is introduced to the live scene.
for x in (-18,-11,12,19):
 box(f'Distant_equipment_{x}',(x,10,.8),(2.5,1.4,1.6),wall)
for x in (-18,-6,6,18):
 for y in (-8,1,10):
  box(f'Factory_highbay_{x}_{y}',(x,y,8.75),(1.4,.28,.04),white)
  ld=bpy.data.lights.new(f'Factory_highbay_area_{x}_{y}','AREA');ld.energy=550;ld.shape='RECTANGLE';ld.size=1.4;ld.size_y=.28;ld.color=(1,.97,.91)
  lo=bpy.data.objects.new(ld.name,ld);scene.collection.objects.link(lo);lo.location=(x,y,8.70)
world=bpy.data.worlds.new('Factory_Overcast_Ambient');world.use_nodes=True;scene.world=world
bg=world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.76,.83,.89,1);bg.inputs['Strength'].default_value=.28
cd=bpy.data.cameras.new('Factory_HDR_Panorama');cd.type='PANO';cd.panorama_type='EQUIRECTANGULAR'
cam=bpy.data.objects.new(cd.name,cd);scene.collection.objects.link(cam);cam.location=(0,-12.1,5.65);cam.rotation_euler=Vector((0,1,0)).to_track_quat('-Z','Y').to_euler();scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64;scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.02;scene.cycles.use_denoising=True;scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=6
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
 if any(d.type=='OPTIX' for d in prefs.devices):
  for d in prefs.devices:d.use=d.type=='OPTIX'
  scene.cycles.device='GPU';print('FACTORY_OPTIX_ENABLED',flush=True)
except Exception:pass
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=4096;scene.render.resolution_y=2048;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'factory_environment.blend'))
t=time.time()
# Blender 5.2 background Render Result exposes zero pixel data. Persist a true
# scene-linear 32-bit EXR first, then read that data to generate Radiance HDR.
scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='32';scene.render.image_settings.color_mode='RGB';scene.render.filepath=str(WORK/'factory-render-linear.exr')
bpy.ops.render.render(write_still=True)
rr=bpy.data.images.load(str(WORK/'factory-render-linear.exr'),check_existing=False);w,h=rr.size;arr=np.empty(w*h*4,dtype=np.float32);rr.pixels.foreach_get(arr)
im=bpy.data.images.new('Factory_Linear_HDR',width=w,height=h,float_buffer=True,alpha=False);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(arr)
maxval=float(np.max(arr.reshape(-1,4)[:,:3]));minval=float(np.min(arr.reshape(-1,4)[:,:3]));positive=arr.reshape(-1,4)[:,:3];percentile99=float(np.percentile(positive,99))
im.file_format='OPEN_EXR';im.filepath_raw=str(WORK/'factory-linear.exr');im.save()
im.file_format='HDR';im.filepath_raw=str(OUT/'factory.hdr');im.save()
im.scale(2048,1024);im.filepath_raw=str(OUT/'factory-2k.hdr');im.save()
im.scale(1024,512);im.filepath_raw=str(OUT/'factory-1k.hdr');im.save()
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=90
im.save_render(str(WORK/'factory-panorama-preview.jpg'),scene=scene)
manifest={'schemaVersion':1,'type':'genuine scene-linear Cycles render, not LDR promotion','source':'Actual office corrugated deck and steel truss geometry reused in a separate photo-derived industrial factory backdrop; grey hall trusses and yellow crane beams follow supplied reference. Factory exterior dimensions are a background reconstruction, never an edit of the measured room.','referencePhoto':'codex-clipboard-150ced87-85c5-42c2-9bfe-69830e75ea65.png','projection':'equirectangular','high':'assets/environment/factory.hdr','medium':'assets/environment/factory-2k.hdr','low':'assets/environment/factory-1k.hdr','dimensions':[w,h],'linearRGBRange':[minval,maxval],'percentile99':percentile99,'samples':64,'bounces':8,'renderSeconds':time.time()-t,'frontUV':[.5,.5],'recommendedInitialBackgroundRotationY':-math.pi/2,'authoringFile':'E:/ArchViz_Resources/factory/factory_environment.blend'}
(OUT/'factory.json').write_text(json.dumps(manifest,indent=2));(WORK/'factory-render-report.json').write_text(json.dumps(manifest,indent=2))
print('GENUINE_FACTORY_HDR_READY',maxval,time.time()-t,flush=True)
