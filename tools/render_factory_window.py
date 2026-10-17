"""Perspective linear HDR projection for window-only backdrop planes."""
import bpy,numpy as np,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/environment';WORK=Path('E:/ArchViz_Resources/factory')
s=bpy.context.scene;c=s.camera;c.data.type='PERSP';c.data.lens=22;c.rotation_euler=Vector((0,1,.015)).to_track_quat('-Z','Y').to_euler()
s.cycles.samples=48;s.cycles.use_denoising=True
try:
 p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='OPTIX';p.get_devices()
 for d in p.devices:d.use=d.type=='OPTIX'
 s.cycles.device='GPU'
except Exception:s.cycles.device='CPU'
s.render.resolution_x=2048;s.render.resolution_y=640;s.render.resolution_percentage=100
s.view_settings.view_transform='Standard';s.view_settings.look='None';s.view_settings.exposure=0;s.render.image_settings.file_format='OPEN_EXR';s.render.image_settings.color_depth='32';s.render.filepath=str(WORK/'factory-window-linear.exr')
bpy.ops.render.render(write_still=True)
source=bpy.data.images.load(str(WORK/'factory-window-linear.exr'),check_existing=False);w,h=source.size;arr=np.empty(w*h*4,dtype=np.float32);source.pixels.foreach_get(arr)
im=bpy.data.images.new('Factory_Window_Linear_HDR',width=w,height=h,float_buffer=True,alpha=False);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(arr);im.file_format='HDR';im.filepath_raw=str(OUT/'factory-window.hdr');im.save()
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.render.image_settings.file_format='JPEG';im.save_render(str(WORK/'factory-window-preview.jpg'),scene=s)
print('FACTORY_WINDOW_PROJECTION_READY')
