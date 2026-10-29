"""Headless-only extraction of original desk assemblies, from a safe .blend copy.
Never run this script in the live GUI file. See extract_existing_hall.py.
"""
import bpy, json, re, math, hashlib
from pathlib import Path
from mathutils import Matrix, Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets';META=ROOT/'assets-src/main-hall';META.mkdir(parents=True,exist_ok=True)
assert bpy.app.background,'Run only in the private background snapshot, not the live Blender GUI'
CX=.9477145;CY=-1.0209095
layout=json.loads((OUT/'architecture/hall-layout.json').read_text(encoding='utf8'))
roots=[bpy.data.objects[t['sourceRoot']] for t in layout['originalTables']]
deps=bpy.context.evaluated_depsgraph_get()
def nodes(root):return sorted([o for o in root.children_recursive if o.type=='MESH'],key=lambda o:o.name)
def suffix(name,root):return name[len(root.name):].lstrip('_')
def canon(root):
 inv=root.matrix_world.inverted();result=[]
 for o in nodes(root):
  transform=inv@o.matrix_world
  result.append({'part':suffix(o.name,root),'points':[[round(float(v),5) for v in transform@p.co] for p in o.data.vertices],
    'faces':[(list(p.vertices),p.material_index) for p in o.data.polygons],'materials':[m.name if m else '' for m in o.data.materials]})
 return hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()
families={}
for root in roots:
 family=(3 if root.rotation_euler.z>0 else 2) if root.name.startswith('East_') else 1
 families.setdefault(family,[]).append(root)
# Different world rotations introduce a few micrometres of float32 cancellation.
# Validate actual matching topology/local coordinates instead of rounded hashes
# whose half-way bins can differ despite sub-pixel numerical equivalence.
for family,group in families.items():
 prototype=group[0]
 for root in group:
  assert len(nodes(root))==len(nodes(prototype))
  for a,b in zip(nodes(prototype),nodes(root)):
   assert len(a.data.vertices)==len(b.data.vertices) and [list(p.vertices) for p in a.data.polygons]==[list(p.vertices) for p in b.data.polygons]
   ta=prototype.matrix_world.inverted()@a.matrix_world;tb=root.matrix_world.inverted()@b.matrix_world
   error=max(((ta@va.co)-(tb@vb.co)).length for va,vb in zip(a.data.vertices,b.data.vertices))
   assert error<.00002,f'Non-equivalent source family {family}: {root.name}, error {error}'
def app_local(v):return [float(v.x),float(v.z),float(-v.y)]
def srgb(v):return 12.92*v if v<=.0031308 else 1.055*(v**(1/2.4))-.055
def material_info(material):
 bs=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if material.use_nodes and material.node_tree else None
 color=list(bs.inputs['Base Color'].default_value)[:3] if bs else list(material.diffuse_color)[:3]
 rough=float(bs.inputs['Roughness'].default_value) if bs else .7;metal=float(bs.inputs['Metallic'].default_value) if bs else 0
 return {'name':material.name,'color':color,'colorHex':'#'+''.join(f'{round(max(0,min(1,srgb(v)))*255):02x}' for v in color),
   'roughness':rough,'metalness':metal,'surface':'metal' if 'FRAME' in material.name or 'Black' in material.name else 'plastic','sourcePbr':True}
materials={};source_materials={}
for root in roots:
 for o in nodes(root):
  for m in o.data.materials:
   if m and m.name not in materials:
    info=material_info(m);materials[m.name]=info;copy=m.copy();copy.name='HallDesk_'+m.name
    copy['sourcePbr']=True;copy['preserveOriginal']=True;copy['surface']=info['surface'];copy['partColor']=info['colorHex'];copy['colorVariant']='original' if 'TOP' in m.name else 'original-'+m.name
    source_materials[m.name]=copy
def clone_mesh(o,root,evaluated):
 mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps) if evaluated else o.data.copy()
 mesh.transform(root.matrix_world.inverted()@o.matrix_world);mesh.update()
 mesh.materials.clear()
 for material in o.data.materials:
  if material:mesh.materials.append(source_materials[material.name])
 while mesh.uv_layers:mesh.uv_layers.remove(mesh.uv_layers[0])
 uv=mesh.uv_layers.new(name='UVMap')
 for polygon in mesh.polygons:
  ax=max(range(3),key=lambda i:abs(polygon.normal[i]));axes=[i for i in range(3) if i!=ax]
  for li in polygon.loop_indices:
   p=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(p[axes[0]],p[axes[1]])
 return mesh
prepared={}
for family,group in families.items():
 root=group[0];prepared[family]={mode:[(o.name,clone_mesh(o,root,mode=='production')) for o in nodes(root)] for mode in ['production','proxy']}

scene=bpy.data.scenes.new('Hall_Desk_Export_Only');scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.context.window.scene=scene
manifest={'schemaVersion':1,'sourceFile':Path(bpy.data.filepath).name,'generator':'Direct copied current Blender source desks; no reconstructed substitute','units':'metres','upAxis':'Y','assets':[]}
proxy_data={'schemaVersion':1,'assetId':'hallDesk','units':'metres','upAxis':'Y','variants':{}}
report={'sourceFile':bpy.data.filepath,'families':[],'worldReconstructionMaxErrorMetres':0,'sourceCount':len(roots)}
for family,group in families.items():
 root=group[0];family_meshes=prepared[family]['production'];points=[v.co.copy() for _,mesh in family_meshes for v in mesh.vertices]
 mi=[min(p[i] for p in points) for i in range(3)];ma=[max(p[i] for p in points) for i in range(3)]
 dimensions=[ma[0]-mi[0],ma[2]-mi[2],ma[1]-mi[1]]
 bounds={'min':[mi[0],mi[2],-ma[1]],'max':[ma[0],ma[2],-mi[1]]}
 entry={'assetId':'hallDesk','variant':family,'label':'Кутовий · 3 шухляди' if family==1 else 'Прямий · правий ряд' if family==2 else 'Прямий · лівий ряд','dimensions':dimensions,
  'production':f'assets/models/hallDesk-{family}.glb','proxy':f'assets/proxies/hallDesk-{family}.glb','productionOverride':True,
  'quality':{level:f'assets/models/hallDesk-{family}.glb' for level in ['low','medium','high']},'bounds':bounds,
  'sourceRoots':[o.name for o in group],'prototypeRoot':root.name,'canonicalHash':canon(root),'materials':[{'id':'original','label':'Оригінальні кольори','color':'#eeeeea','surface':'plastic'}]}
 proxy_parts=[]
 for mode in ['production','proxy']:
  for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
  parent=bpy.data.objects.new(f'HallDesk_{family:02d}',None);scene.collection.objects.link(parent)
  parent['assetId']='hallDesk';parent['variant']=family;parent['sourceRoot']=root.name;parent['sourcePbr']=True;parent['sourceUnits']='metres';parent['editable']=True
  for name,mesh in prepared[family][mode]:
   o=bpy.data.objects.new(suffix(name,root),mesh);scene.collection.objects.link(o);o.parent=parent;o['sourceObject']=name;o['assetId']='hallDesk';o['variant']=family
   if mode=='proxy':
    mesh.calc_loop_triangles();groups={}
    for triangle in mesh.loop_triangles:
     material=mesh.materials[triangle.material_index];mname=next(k for k,v in source_materials.items() if v==material)
     part=groups.setdefault(mname,{'name':suffix(name,root),'material':materials[mname],'positions':[],'normals':[],'uvs':[]})
     for li in triangle.loops:
      vi=mesh.loops[li].vertex_index;part['positions'].extend(app_local(mesh.vertices[vi].co));part['normals'].extend(app_local(mesh.corner_normals[li].vector));part['uvs'].extend(list(mesh.uv_layers[0].data[li].uv))
    proxy_parts.extend(groups.values())
  scene.view_layers[0].update();bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=parent
  target=OUT/(entry['production'] if mode=='production' else entry['proxy']).removeprefix('assets/')
  target.parent.mkdir(parents=True,exist_ok=True)
  # glTF otherwise exports selected objects in OTHER scenes too. The source GUI
  # selection (e.g. a ceiling vent) is intentionally preserved in the snapshot.
  bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,use_active_scene=True,export_texcoords=True,export_normals=True,
   export_cameras=False,export_lights=False,export_animations=False,export_extras=True,export_yup=True)
  entry.setdefault('bytes',{})[mode]=target.stat().st_size
 proxy_data['variants'][str(family)]={'dimensions':dimensions,'bounds':bounds,'parts':proxy_parts,'sourceRoot':root.name}
 # Prove that template instancing reconstructs the original world vertices.
 reference=nodes(root)
 maximum=0
 for instance in group:
  for prototype,actual in zip(reference,nodes(instance)):
   p_transform=root.matrix_world.inverted()@prototype.matrix_world
   for a,b in zip(prototype.data.vertices,actual.data.vertices):
    predicted=instance.matrix_world@(p_transform@a.co);expected=actual.matrix_world@b.co;maximum=max(maximum,(predicted-expected).length)
 report['worldReconstructionMaxErrorMetres']=max(report['worldReconstructionMaxErrorMetres'],maximum)
 report['families'].append({'variant':family,'instances':len(group),'prototype':root.name,'dimensions':dimensions,'maximumWorldVertexErrorMetres':maximum})
 manifest['assets'].append(entry)
 for table in layout['originalTables']:
  if table['variant']==family:table['dimensions']=dimensions;table['production']=entry['production'];table['proxy']=entry['proxy']
def rounded(value):
 if isinstance(value,float):return round(value,8)
 if isinstance(value,list):return [rounded(v) for v in value]
 if isinstance(value,dict):return {k:rounded(v) for k,v in value.items()}
 return value
(META/'editor-proxies.json').write_text(json.dumps(rounded(proxy_data),ensure_ascii=False,separators=(',',':')),encoding='utf8')
(META/'export-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'architecture/hall-desk-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(OUT/'architecture/hall-layout.json').write_text(json.dumps(rounded(layout),ensure_ascii=False,separators=(',',':')),encoding='utf8')
(META/'layout-readable.json').write_text(json.dumps(rounded(layout),ensure_ascii=False,indent=2),encoding='utf8')
(META/'export-validation.json').write_text(json.dumps(report,indent=2),encoding='utf8')
assert report['worldReconstructionMaxErrorMetres']<.00002,report
print('HALL_DESKS_EXPORTED',json.dumps(report),flush=True)
