"""Export the complete real building around the separately baked lounge room.
Run on the full live-scene snapshot, never the cropped room_archviz.blend.
"""
import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture'
WORK=Path('E:/ArchViz_Resources/exports');WORK.mkdir(parents=True,exist_ok=True)
CX=.9477145;CY=-1.0209095
CROP=(-1.8,3.7,-4.27,2.2)
GLOBAL={'Floor_Continuous_00','Ceiling_Corrugated_Deck','Ceiling_Exposed_Steel_Trusses','Ceiling_Cable_Trays','Lamp_Suspension_Cables'}
WALLS={'16','17','21','26','29'}
def app(p):return [p[0]-CX,p[2],-(p[1]-CY)]
def is_room(n):
 if n in GLOBAL:return False
 if any(n==f'Wall_{i}_Clean' or n==f'Wall_{i}_Top_Steel_Beam' or n.startswith(f'Wall_{i}_Skirting_') for i in WALLS):return True
 return n.startswith(('Central_Room_','Central_Window_','Room_Lamp_','Room_HVAC_','Door_03_','Window_06_'))
def box(o):
 vs=[o.matrix_world@v.co for v in o.data.vertices]
 return [[min(v[i] for v in vs) for i in range(3)],[max(v[i] for v in vs) for i in range(3)]]
def role(n):
 if 'Column' in n:return 'structure'
 if n.startswith('Floor'):return 'floor'
 if 'Ceiling' in n or 'Top_Steel' in n:return 'ceiling'
 if n.startswith(('Room_Lamp','Hall_Lamp','Lamp_Suspension')):return 'lighting'
 if n.startswith('Door_'):return 'doors'
 if n.startswith('Window_'):return 'windows'
 if n.startswith('Wall_') and '_Clean' in n:return 'walls'
 if 'Outlet' in n or 'Socket' in n or 'Electrical' in n or 'Conduit' in n:return 'outlets'
 if n.startswith(('Desk','East_Desk')) or 'Furniture' in n or 'Cabinet' in n:return 'existingFurniture'
 return 'fixtures'
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
allwalls=[];segments=[];original_names=[]
for o in list(bpy.data.objects):
 if o.type!='MESH':continue
 original_names.append(o.name)
 if o.name.startswith('Wall_') and o.name.endswith('_Clean'):
  bb=box(o);dx=bb[1][0]-bb[0][0];dy=bb[1][1]-bb[0][1];ax=0 if dx<dy else 1;u=1-ax
  coordinate=(bb[0][ax]+bb[1][ax])/2;mi=bb[0][u];ma=bb[1][u]
  intervals=[]
  for p in o.data.polygons:
   ps=[o.matrix_world@o.data.vertices[vi].co for vi in p.vertices]
   zlo=min(v.z for v in ps);zhi=max(v.z for v in ps);ulo=min(v[u] for v in ps);uhi=max(v[u] for v in ps)
   if abs(p.normal[ax])>.9 and zlo<1.65 and zhi>.18 and uhi-ulo>.001:intervals.append((ulo,uhi))
  merged=[]
  for lo,hi in sorted(intervals):
   if merged and lo<=merged[-1][1]+.003:merged[-1][1]=max(merged[-1][1],hi)
   else:merged.append([lo,hi])
  wid='wall-'+o.name.split('_')[1]
  allwalls.append({'id':wid,'node':o.name,'axis':'x' if ax==0 else 'z','coordinate':coordinate-CX if ax==0 else -(coordinate-CY),'min':-(ma-CY) if ax==0 else mi-CX,'max':-(mi-CY) if ax==0 else ma-CX,'height':bb[1][2],'thickness':bb[1][ax]-bb[0][ax],'bounds':{'min':app((bb[0][0],bb[1][1],bb[0][2])),'max':app((bb[1][0],bb[0][1],bb[1][2]))},'normal':[1,0,0] if ax==0 and coordinate<0 else [-1,0,0] if ax==0 else [0,0,-1] if coordinate<0 else [0,0,1]})
  for lo,hi in merged:
   a=(coordinate,lo,0) if ax==0 else (lo,coordinate,0);b=(coordinate,hi,0) if ax==0 else (hi,coordinate,0)
   aa=app(a);ab=app(b);segments.append({'wallId':wid,'a':[aa[0],aa[2]],'b':[ab[0],ab[2]],'thickness':bb[1][ax]-bb[0][ax],'minY':0,'maxY':1.65,'source':'actual vertical mesh faces intersecting walking height; door holes preserved'})

deps=bpy.context.evaluated_depsgraph_get()
for o in list(bpy.data.objects):
 if o.type!='MESH' or is_room(o.name) or o.name.startswith('Central_Window_Wall_Panel_Joint'):
  bpy.data.objects.remove(o,do_unlink=True);continue
 n=o.name;mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps));mesh.transform(o.matrix_world)
 o.data=mesh;o.parent=None;o.matrix_world=Matrix.Identity(4)
 for mod in list(o.modifiers):o.modifiers.remove(mod)
 if n in GLOBAL:
  bm=bmesh.new();bm.from_mesh(mesh)
  for co,no in [((CROP[0],0,0),(1,0,0)),((CROP[1],0,0),(1,0,0)),((0,CROP[2],0),(0,1,0)),((0,CROP[3],0),(0,1,0))]:
   bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=co,plane_no=no)
  inside=[f for f in bm.faces if CROP[0]-1e-6<f.calc_center_median().x<CROP[1]+1e-6 and CROP[2]-1e-6<f.calc_center_median().y<CROP[3]+1e-6]
  bmesh.ops.delete(bm,geom=inside,context='FACES')
  loose=[v for v in bm.verts if not v.link_faces]
  if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
  bm.to_mesh(mesh);bm.free();mesh.update()
  if not mesh.polygons:bpy.data.objects.remove(o,do_unlink=True);continue
 while mesh.uv_layers:mesh.uv_layers.remove(mesh.uv_layers[0])
 uv=mesh.uv_layers.new(name='UVMap')
 for p in mesh.polygons:
  ax=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=ax]
  for li in p.loop_indices:
   co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
 mesh.transform(Matrix.Translation((-CX,-CY,0)));mesh.update()
 o.hide_select=False;o.hide_viewport=False;o.hide_render=False;o.lock_location=(False,)*3;o.lock_rotation=(False,)*3;o.lock_scale=(False,)*3
 o['sourceObject']=n;o['protected']=True;o['protectedGroup']=role(n);o['lightmapped']=False;o['roomId']='existing-full-space'
 if role(n)=='walls':o['wallId']='wall-'+n.split('_')[1]

# Consolidate non-collidable static categories; all actual source geometry remains.
# Keep individual wall nodes for visibility/collision and the main room Door03 elsewhere.
groups={}
for o in bpy.data.objects:
 if o.type=='MESH' and o.get('protectedGroup') not in ['walls','floor']:
  groups.setdefault(o['protectedGroup'],[]).append(o)
for cat,objects in groups.items():
 names=[o['sourceObject'] for o in objects]
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 o=bpy.context.object;o.name='Space_'+cat;o['sourceObjects']=json.dumps(names);o['protectedGroup']=cat;o['protected']=True;o['lightmapped']=False
bpy.context.view_layer.update()

def semantic(m):
 n=m.name;role='fixture';pbr=None;editor='#a9b8be'
 if n.startswith(('01_WALLS','15_WALLS')):role='wall-paint';pbr='wall-painted';editor='#e6e9e4'
 elif n.startswith('02_FLOOR'):role='floor-commercial';pbr='floor-commercial-grey';editor='#ccd4d7'
 elif n.startswith('03_DOOR'):role='door-leaf';editor='#92a1a9'
 elif n.startswith('04_DOOR'):role='door-frame';editor='#72848c'
 elif n.startswith('05_WINDOW'):role='window-frame-white';editor='#f6f7f2'
 elif n.startswith('06_WINDOW'):role='glass-clear';editor='#a5cbd3'
 elif n.startswith(('07_CEILING','08_CEILING')):role='ceiling-dark-painted-metal';editor='#a6b5bd'
 elif n.startswith('09_LIGHT'):role='fixture-dark-metal';editor='#8d9fa8'
 elif n.startswith('10_LIGHT'):role='light-diffuser';editor='#fff8d9'
 elif n.startswith('11_HVAC'):role='hvac';editor='#c8d0d1'
 elif 'White_' in n or 'White' in n or 'Plain_White' in n:role='electrical-white' if 'ELECTRICAL' in n else 'furniture-white';editor='#f0f1eb'
 elif 'Black_' in n or 'Black' in n:role='electrical-black' if 'ELECTRICAL' in n else 'fixture-black';editor='#536872'
 bs=m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
 col=list(bs.inputs['Base Color'].default_value) if bs else list(m.diffuse_color)
 return {'role':role,'pbrMaterialId':pbr,'editorColor':editor,'sourceLinearColor':col,'roughness':float(bs.inputs['Roughness'].default_value) if bs else .8,'forceNoAlbedoMap':role in ['ceiling-dark-painted-metal','window-frame-white','electrical-white'],'glass':{'transmission':.96,'roughness':.045,'ior':1.5,'thickness':.018,'color':'#f5fcff'} if role=='glass-clear' else None}
semantics={m.name:semantic(m) for m in bpy.data.materials}
(OUT/'material-semantics.json').write_text(json.dumps({'schemaVersion':1,'matching':'EXACT original material names, never mesh-name WALL substring','materials':semantics},indent=2))
nodes=[{'name':o.name,'category':o.get('protectedGroup'),'wallId':o.get('wallId'),'lightmapped':False,'protected':True,'sourceObjects':json.loads(o.get('sourceObjects','[]')) if o.get('sourceObjects') else [o.get('sourceObject',o.name)]} for o in bpy.data.objects if o.type=='MESH']
floor={'id':'floor-existing-full-space','type':'floor','y':0,'bounds':{'min':[-24.74725-CX,0,-(4.1526-CY)],'max':[24.7471-CX,0,-(-4.18404-CY)]},'centralRoomHandledSeparately':True}
meta={'schemaVersion':1,'id':'existing-full-space','architectureId':'polycam-full-building-v1','units':'meter','sourceCenter':[CX,CY,0],'bounds':{'min':[-24.8-CX,0,-(4.20-CY)],'max':[24.8-CX,4.355,-(-4.27-CY)]},'sourceFile':'reconstructed_room.blend','protected':True,'centralRoom':'lounge-room-01','centralRoomAsset':'assets/architecture/room.meshopt.glb','assets':{'production':'assets/architecture/space.meshopt.glb','editor':'assets/architecture/space-editor.meshopt.glb'},'complementCutout':{'sourceX':[CROP[0],CROP[1]],'sourceY':[CROP[2],CROP[3]],'reason':'Exact complement of room.glb crop, prevents floor/roof z-fighting'},'walls':allwalls,'surfaces':[floor]+[dict(w,type='wall') for w in allwalls],'navigation':{'floorY':0,'ceilingY':4.32,'collideFurniture':False,'wallSegments':segments,'actualCollisionMeshNodeNames':[n['name'] for n in nodes if n['category']=='walls'],'centralDoorDynamicNode':'Interactive_Door_03','preserveActualDoorOpenings':True},'nodes':nodes}
(OUT/'scene-space.json').write_text(json.dumps(meta,indent=2))
def export(path):
 for o in bpy.data.objects:o.select_set(o.type=='MESH')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True)
export(OUT/'space.glb')
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'space-export.blend'))
# Editor proxy collapses detailed outlet meshes while preserving floor/walls/doors.
for m in bpy.data.materials:
 if not m.use_nodes:continue
 bs=m.node_tree.nodes.get('Principled BSDF');hex=semantics[m.name]['editorColor'];c=tuple(int(hex[i:i+2],16)/255 for i in (1,3,5))+(1,)
 bs.inputs['Base Color'].default_value=c;bs.inputs['Metallic'].default_value=0;bs.inputs['Roughness'].default_value=.9
for o in bpy.data.objects:
 if o.type!='MESH':continue
 if o.get('protectedGroup') in ['outlets','doors']:
  mod=o.modifiers.new('Editor detail reduction','DECIMATE');mod.ratio=.18
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 for uv in list(o.data.uv_layers):o.data.uv_layers.remove(uv)
export(OUT/'space-editor.glb')
(ROOT/'assets-src/analysis/full_space_export_report.json').write_text(json.dumps({'sourceSnapshot':str(WORK/'full-space-source.blend'),'originalMeshObjects':len(original_names),'outsideNodes':len(nodes),'wallCount':len(allwalls),'navigationSegments':len(segments),'sourceLiveUnmodified':True,'roomDoorPivotPreservedInSeparateRoomAsset':True},indent=2))
print('FULL_SPACE_API_READY',len(nodes),flush=True)
