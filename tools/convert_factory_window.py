import bpy,numpy as np,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/environment';WORK=Path('E:/ArchViz_Resources/factory')
source=bpy.data.images.load(str(WORK/'factory-window-linear.exr'),check_existing=False);w,h=source.size;arr=np.empty(w*h*4,dtype=np.float32);source.pixels.foreach_get(arr)
im=bpy.data.images.new('Factory_Window_Linear_HDR',width=w,height=h,float_buffer=True,alpha=False);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(arr);im.file_format='HDR';im.filepath_raw=str(OUT/'factory-window.hdr');im.save()
s=bpy.context.scene;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.render.image_settings.file_format='JPEG';im.save_render(str(WORK/'factory-window-preview.jpg'),scene=s)
meta=json.loads((OUT/'factory.json').read_text());meta['windowProjection']={'url':'assets/environment/factory-window.hdr','projection':'perspective planar','resolution':[w,h],'linearRGBRange':[float(np.min(arr.reshape(-1,4)[:,:3])),float(np.max(arr.reshape(-1,4)[:,:3]))],'anchors':'assets/architecture/runtime-lighting.json.windowBackdrops'};(OUT/'factory.json').write_text(json.dumps(meta,indent=2))
print('FACTORY_WINDOW_HDR_READY')
