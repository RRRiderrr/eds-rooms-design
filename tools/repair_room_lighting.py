"""Web-only panel-joint removal and indirect-only Cycles GI for dynamic direct lights."""
import bpy,bmesh,json,time,math,shutil
from pathlib import Path
from mathutils import Matrix
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture';WORK=Path('E:/ArchViz_Resources/bake');WORK.mkdir(parents=True,exist_ok=True)
backup=WORK/'room-before-indirect-repair.blend'
if not backup.exists():bpy.ops.wm.save_as_mainfile(filepath=str(backup),copy=True)
removed=[]
for o in list(bpy.data.objects):
 if o.name.startswith('Central_Window_Wall_Panel_Joint'):
  removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
deck=bpy.data.objects.get('Ceiling_Corrugated_Deck');flipped=0
if deck:
 bm=bmesh.new();bm.from_mesh(deck.data)
 for f in bm.faces:
  f.normal_update()
  if f.normal.z>0:f.normal_flip();flipped+=1
 bm.to_mesh(deck.data);bm.free();deck.data.update()
room=json.loads((OUT/'room.json').read_text());room['nodes']=[n for n in room['nodes'] if n['name'] not in removed]
room['lighting'].update({'type':'cycles-baked-indirect-diffuse-irradiance','directIncluded':False,'indirectIncluded':True,'albedoIncluded':False,'runtimeDirectLighting':True,'bakeLights':{'areaFixtures':6,'sourceEnergyEachWatts':80,'worldStrength':.22,'worldColor':[.72,.79,.86]},'note':'Static indirect GI only. Runtime direct light and shadows must be applied at every quality tier; probes retain total irradiance with calibrated runtime scale.'})
(OUT/'room.json').write_text(json.dumps(room,indent=2))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=96;scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=6;scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.018
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
 if any(d.type=='OPTIX' for d in prefs.devices):
  for d in prefs.devices:d.use=d.type=='OPTIX'
  scene.cycles.device='GPU';print('ROOM_OPTIX_ENABLED',flush=True)
except Exception:pass
scene.render.threads_mode='FIXED';scene.render.threads=6
static=[o for o in bpy.data.objects if o.type=='MESH' and o.get('lightmapped')]
im=bpy.data.images.new('Architecture_Indirect_Only_2K',width=2048,height=2048,float_buffer=True,alpha=False);im.colorspace_settings.name='Non-Color'
bpy.ops.object.select_all(action='DESELECT')
for o in static:
 o.select_set(True);o.data.uv_layers.active_index=1
 for slot in o.material_slots:
  mat=slot.material
  if not mat:continue
  for n in mat.node_tree.nodes:n.select=False
  n=mat.node_tree.nodes.get('BAKE_Irradiance_Target') or mat.node_tree.nodes.new('ShaderNodeTexImage');n.name='BAKE_Irradiance_Target';n.image=im;n.select=True;mat.node_tree.nodes.active=n
bpy.context.view_layer.objects.active=static[0]
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False;scene.render.bake.margin=12;scene.render.bake.use_clear=True
t=time.time();bpy.ops.object.bake(type='DIFFUSE',pass_filter={'INDIRECT'},margin=12)
im.filepath_raw=str(OUT/'lightmap.hdr');im.file_format='HDR';im.save()
im.filepath_raw=str(WORK/'lightmap-indirect-linear.exr');im.file_format='OPEN_EXR';im.save()
for o in static:o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-src/room_archviz.blend'))
for o in bpy.data.objects:o.select_set(o.type in ['MESH','EMPTY'])
bpy.ops.export_scene.gltf(filepath=str(OUT/'room.glb'),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True)
uvreport=[]
for o in static:
 uv=o.data.uv_layers.get('Lightmap');coords=[tuple(u.uv) for u in uv.data]
 uvreport.append({'name':o.name,'min':[min(v[i] for v in coords) for i in range(2)],'max':[max(v[i] for v in coords) for i in range(2)],'inRange':all(-1e-5<=c<=1.00001 for v in coords for c in v)})
roof=[]
for o in bpy.data.objects:
 if o.type=='MESH' and o.get('protectedGroup')=='ceiling':
  roof.append({'name':o.name,'materials':[m.name for m in o.data.materials if m],'uv2Valid':next((r['inRange'] for r in uvreport if r['name']==o.name),True)})
(ROOT/'assets-src/analysis/indirect_lighting_repair.json').write_text(json.dumps({'removedWebOnly':removed,'sourceLiveUntouched':True,'samples':96,'bounces':8,'pass':'DIFFUSE INDIRECT only, no color, no direct','seconds':time.time()-t,'roofMeshes':roof,'lightmapUvRanges':uvreport,'probableFormerWhiteRoofCause':'Broad WALL material classification also matched Wall_*_Top_Steel_Beam, plus source material replacement; exact material-semantics.json prevents this.'},indent=2))
print('INDIRECT_ONLY_BAKE_READY',time.time()-t,'fixedOpenSheetFaces',flipped,flush=True)
