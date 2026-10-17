"""Offline scene-linear OIDN cleanup of irradiance, never a runtime GI effect."""
import bpy,json,os,shutil,time,hashlib
from pathlib import Path
if not bpy.app.background:raise RuntimeError('Run this tool headlessly on an export copy, never the live MCP scene')
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/architecture'
WORK=Path(os.environ.get('ARCHVIZ_RESOURCES','E:/ArchViz_Resources'))/'bake/denoising'
WORK.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
for obj in list(bpy.data.objects):
 if obj.type!='CAMERA':bpy.data.objects.remove(obj,do_unlink=True)
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.device='CPU'
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='32';scene.render.image_settings.exr_codec='ZIP'
scene.view_settings.view_transform='Raw';scene.render.resolution_percentage=100
report=[]
report_path=ROOT/'assets-src/analysis/irradiance-denoising.json'
previous={x['asset']:x for x in json.loads(report_path.read_text())} if report_path.exists() else {}
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
for name in ('lightmap','space-lightmap'):
 source=OUT/f'{name}.hdr';raw=WORK/f'{name}.raw.hdr'
 if not raw.exists() or (previous.get(name,{}).get('outputHash') and digest(source)!=previous[name]['outputHash']):shutil.copy2(source,raw)
 image=bpy.data.images.load(str(raw),check_existing=False);image.colorspace_settings.name='Non-Color'
 scene.render.resolution_x=image.size[0];scene.render.resolution_y=image.size[1]
 tree=bpy.data.node_groups.new(f'Offline_Irradiance_Denoise_{name}','CompositorNodeTree')
 tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
 node=tree.nodes.new('CompositorNodeImage');node.image=image
 denoise=tree.nodes.new('CompositorNodeDenoise');denoise.inputs['HDR'].default_value=True
 denoise.inputs['Prefilter'].default_value='Accurate'
 output=tree.nodes.new('NodeGroupOutput');tree.links.new(node.outputs['Image'],denoise.inputs['Image']);tree.links.new(denoise.outputs['Image'],output.inputs['Image'])
 scene.compositing_node_group=tree;scene.render.use_compositing=True
 exr=WORK/f'{name}.denoised.exr';scene.render.filepath=str(exr)
 start=time.time();bpy.ops.render.render(write_still=True)
 cleaned=bpy.data.images.load(str(exr),check_existing=False);_ = tuple(cleaned.size);cleaned.colorspace_settings.name='Non-Color';_ = cleaned.pixels[0];cleaned.file_format='HDR'
 cleaned.filepath_raw=str(WORK/f'{name}.denoised.hdr');cleaned.save()
 staging=OUT/f'.{name}.staging.hdr';shutil.copy2(cleaned.filepath_raw,staging);os.replace(staging,source)
 report.append({'asset':name,'method':'OpenImageDenoise offline scene-linear HDR compositor','guides':'none; static UV atlas has 12/16px gutters','size':list(image.size),'seconds':time.time()-start,'rawSource':str(raw),'rawHash':digest(raw),'outputHash':digest(source)})
 bpy.data.images.remove(image);bpy.data.images.remove(cleaned)
(ROOT/'assets-src/analysis/irradiance-denoising.json').write_text(json.dumps(report,indent=2))
print('OFFLINE_IRRADIANCE_DENOISED',flush=True)
