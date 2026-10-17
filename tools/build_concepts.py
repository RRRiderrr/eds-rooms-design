"""Import the shipped production GLBs into real, editable Blender design collections.
The render configuration is the same versioned preset JSON used by the website.
"""
import bpy,json,math,re,time
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1];PRE=ROOT/'assets-src/previews/concepts';PRE.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
if Path(bpy.data.filepath).resolve() != (ROOT/'assets-src/room_archviz.blend').resolve():
 raise RuntimeError('Concept authoring requires the prepared, centered assets-src/room_archviz.blend. Use reexport_room.py --concepts; never render concepts directly from the live source.')
source_mapping_path=ROOT/'assets-src/catalog/blender-sources.json'
source_mapping=json.loads(source_mapping_path.read_text()) if source_mapping_path.exists() else {}
cache_path=ROOT/'assets-src/materials/material-cache.json'
material_cache=json.loads(cache_path.read_text()).get('resourceRoot') if cache_path.exists() else None
presets=json.loads((ROOT/'assets-src/concepts/presets.json').read_text(encoding='utf8'))
catalog={a['id']:a for a in json.loads((ROOT/'assets-src/catalog/catalog.json').read_text(encoding='utf8'))}
sources=json.loads((ROOT/'assets-src/materials/sources.json').read_text(encoding='utf8'))['materials'];sources={m['id']:m for m in sources}
override_path=ROOT/'assets-src/materials/overrides.json'
if override_path.exists():
 for override in json.loads(override_path.read_text(encoding='utf8')).get('materials',[]):
  if override['id'] in sources:sources[override['id']].update(override)
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def color(hex):return tuple(linear(int(hex[i:i+2],16)/255) for i in (1,3,5))+(1,)
def pbr(m,mid,tint=None):
 meta=sources[mid];p=(Path(material_cache)/mid/'processed/medium') if material_cache else ROOT/'assets-src/materials'/mid/'processed/medium'
 if not p.exists():p=(Path(material_cache)/mid/'processed/high') if material_cache else ROOT/'assets-src/materials'/mid/'processed/high'
 if not m.use_nodes:m.use_nodes=True
 tree=m.node_tree;bs=tree.nodes.get('Principled BSDF');uv=tree.nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
 tile=meta.get('tileMeters',1);tile=tile if isinstance(tile,(list,tuple)) else (tile,tile)
 mapping=tree.nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(1/tile[0],1/tile[1],1);tree.links.new(uv.outputs['UV'],mapping.inputs[0])
 for name in ['baseColor','normal','orm']:
  path=p/(name+'.png')
  if not path.exists():continue
  tex=tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path),check_existing=True)
  if name!='baseColor':tex.image.colorspace_settings.name='Non-Color'
  tree.links.new(mapping.outputs['Vector'],tex.inputs['Vector'])
  if name=='baseColor' and meta.get('baseColorMode') in ('tint','solid'):
   if tint:bs.inputs['Base Color'].default_value=tint
   continue
  if name=='baseColor':
   if tint:
    mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=tint;tree.links.new(tex.outputs['Color'],mix.inputs[1]);tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
   else:tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
  elif name=='normal':
   no=tree.nodes.new('ShaderNodeNormalMap');no.inputs['Strength'].default_value=meta.get('normalStrength',.2);tree.links.new(tex.outputs['Color'],no.inputs['Color']);tree.links.new(no.outputs[0],bs.inputs['Normal'])
  else:
   sep=tree.nodes.new('ShaderNodeSeparateColor');tree.links.new(tex.outputs['Color'],sep.inputs[0]);tree.links.new(sep.outputs['Green'],bs.inputs['Roughness'])
   # Reflective metal maps are curated; painted steel remains predominantly dielectric.
   bs.inputs['Metallic'].default_value=meta.get('metalness',0)
for m in bpy.data.materials:
 if m.name.startswith('01_WALLS'):pbr(m,'wall-painted')
 elif m.name.startswith('02_FLOOR'):pbr(m,'floor-commercial-grey')
 elif m.name.startswith(('07_CEILING','08_CEILING','03_DOOR','04_DOOR')):pbr(m,'metal-painted')

lib=bpy.data.collections.new('ArchViz_Assets_Production_Library');scene.collection.children.link(lib);lib.hide_render=True;lib.hide_viewport=True
templates={};used={(o['assetId'],o['variant']) for p in presets for o in p['objects'] if o['variant']>0}
for aid,vi in sorted(used):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=source_mapping.get(f'{aid}-{vi}',str(ROOT/f'public/assets/models/{aid}-{vi}.glb')),import_pack_images=False)
 imported=list(set(bpy.data.objects)-before)
 for o in imported:
  for c in list(o.users_collection):c.objects.unlink(o)
  lib.objects.link(o);o.hide_render=False;o.hide_viewport=False
 templates[(aid,vi)]=imported
 print('IMPORTED',aid,vi,len(imported),flush=True)
matcache={};collections=[]
for preset in presets:
 pi=int(preset['presetId'].split('-')[-1]);col=bpy.data.collections.new(f'Concept_{pi:02d}_{preset["name"].split(":",1)[-1].strip()}');scene.collection.children.link(col)
 col['presetId']=preset['presetId'];col['readOnlyBuiltin']=True;col.hide_render=True;col.hide_viewport=True;collections.append(col)
 for obj in preset['objects']:
  if obj['variant']==0:continue
  aid=obj['assetId'];vi=obj['variant'];wrapper=bpy.data.objects.new(f'{pi:02d}__{obj["id"]}',None);col.objects.link(wrapper)
  wrapper.location=(obj['position'][0],-obj['position'][2],obj['position'][1]);wrapper.rotation_euler.z=obj['rotation']
  wrapper['assetId']=aid;wrapper['variant']=vi;wrapper['sceneObjectId']=obj['id'];wrapper['materialVariant']=obj['material']
  originals=templates[(aid,vi)];copies={o:o.copy() for o in originals}
  for source,clone in copies.items():
   col.objects.link(clone);clone.name=f'{pi:02d}__{obj["id"]}__{source.name}'
   clone.parent=copies.get(source.parent,wrapper)
   clone.matrix_parent_inverse=source.matrix_parent_inverse.copy()
   clone.matrix_basis=source.matrix_basis.copy()
   if clone.type=='MESH':
    variant=next((v for v in catalog[aid]['materials'] if v['id']==obj['material']),None)
    for slot in clone.material_slots:
     default=catalog[aid]['materials'][0]
     if not variant or slot.material.get('colorVariant')!=default['id'] or slot.material.get('surface')!=default['surface']:continue
     surf=variant['surface']
     key=(slot.material.name,variant['id'],surf)
     if key not in matcache:
      mat=slot.material.copy();mat.name=f'Furniture_{aid}_{surf}_{variant["id"]}';bs=mat.node_tree.nodes.get('Principled BSDF');tint=color(variant['color']);bs.inputs['Base Color'].default_value=tint
      mid={'fabric':'fabric-woven','wood':'wood-oak','metal':'metal-painted'}.get(surf)
      if mat.get('sourcePbr'):
       # Preserve the real scan's UV atlas, normal/roughness and leaf transparency.
       # Only explicitly tintable upholstery/ceramic receives a curated colour.
       if mat.get('tintable'):
        incoming=list(bs.inputs['Base Color'].links)
        if incoming:
         source_socket=incoming[0].from_socket;mat.node_tree.links.remove(incoming[0]);mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=tint;mat.node_tree.links.new(source_socket,mix.inputs[1]);mat.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
        else:bs.inputs['Base Color'].default_value=tint
      elif mid:
       if surf=='wood':
        base=color(default['color']);tint=tuple(min(2,tint[i]/max(.01,base[i])) for i in range(3))+(1,)
       pbr(mat,mid,tint)
      matcache[key]=mat
     slot.link='OBJECT';slot.material=matcache[key]

scene.render.engine='CYCLES'
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
 for device in prefs.devices:device.use=device.type=='OPTIX'
 scene.cycles.device='GPU' if any(device.type=='OPTIX' for device in prefs.devices) else 'CPU'
except Exception:scene.cycles.device='CPU'
scene.cycles.samples=20;scene.cycles.use_denoising=True;scene.cycles.max_bounces=8
scene.render.resolution_x=1000;scene.render.resolution_y=750;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=88
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
cd=bpy.data.cameras.new('Concept_Review');cd.lens=19
cam=bpy.data.objects.new('Concept_Review',cd);scene.collection.objects.link(cam);scene.camera=cam
views=[('window',(2.20,1.68,1.68),(-.15,-1.75,1.3)),('door',(-2.20,-2.30,1.70),(.10,.9,1.3))]
report=[]
for p,col in zip(presets,collections):
 pi=int(p['presetId'].split('-')[-1]);col.hide_render=False;col.hide_viewport=False
 for vid,eye,target in views:
  cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
  scene.render.filepath=str(PRE/f'preset-{pi:02d}-{vid}.jpg');bpy.ops.render.render(write_still=True)
  check=bpy.data.images.load(scene.render.filepath,check_existing=False);pixels=check.pixels;stride=max(4,len(pixels)//4096//4*4);values=[sum(pixels[i:i+3])/3 for i in range(0,len(pixels)-3,stride)];bpy.data.images.remove(check)
  if not values or max(values)<.03:raise RuntimeError(f'Black/empty concept render: {pi} {vid}; inspect source, camera and lighting before accepting QA')
 report.append({'presetId':p['presetId'],'name':p['name'],'objects':len(p['objects']),'views':[f'preset-{pi:02d}-{v[0]}.jpg' for v in views]})
 col.hide_render=True;col.hide_viewport=True
 print('PRESET_QC_RENDERED',pi,flush=True)
collections[1].hide_render=False;collections[1].hide_viewport=False
cam.location=views[0][1];cam.rotation_euler=(Vector(views[0][2])-cam.location).to_track_quat('-Z','Y').to_euler()
# Keep all models linked by stable IDs, with exactly one preset collection visible.
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-src/lounge_concepts.blend'))
(ROOT/'assets-src/concepts/blender-visual-review.json').write_text(json.dumps({'source':'production web GLBs, same asset IDs and preset JSON','conceptCollections':len(collections),'renderEngine':'Cycles','samples':20,'viewsPerPreset':2,'presets':report},indent=2))
print('ALL_BLENDER_CONCEPTS_READY',flush=True)
