"""Crop the actual Blender reconstruction non-destructively for the web room.
Run with Blender --background assets-src/room_archviz.blend --python tools/export_room.py.
The live full-room source is never cropped or replaced.
"""
import bpy, bmesh, json, math, sys, hashlib
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/architecture';OUT.mkdir(parents=True,exist_ok=True)
CX=.9477145;CY=-1.0209095
X0=-1.654103;X1=3.549532;Y0=-4.0698;Y1=2.027981
W=X1-X0;D=Y1-Y0
def app(v): return [round(v[0]-CX,7),round(v[2],7),round(-(v[1]-CY),7)]
def bounds(o):
 p=[o.matrix_world@v.co for v in o.data.vertices]
 return [[min(v[i] for v in p) for i in range(3)],[max(v[i] for v in p) for i in range(3)]]
wallids=['16','17','21','26','29']
global_meshes=['Floor_Continuous_00','Ceiling_Corrugated_Deck','Ceiling_Exposed_Steel_Trusses','Ceiling_Cable_Trays','Lamp_Suspension_Cables']
def keep(o):
 n=o.name
 if n.startswith('Central_Window_Wall_Panel_Joint'):return False
 if n in global_meshes:return True
 if any(n==f'Wall_{i}_Clean' or n==f'Wall_{i}_Top_Steel_Beam' or n.startswith(f'Wall_{i}_Skirting_') for i in wallids):return True
 return n.startswith(('Central_Room_','Central_Window_','Room_Lamp_','Room_HVAC_','Door_03_','Window_06_'))
for o in list(bpy.data.objects):
 if not keep(o):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene
for o in list(bpy.data.objects):
 if o.type=='MESH':
  # Apply the source matrix only to this independent export copy.
  o.data=o.data.copy();o.data.transform(o.matrix_world);o.parent=None;o.matrix_world=Matrix.Identity(4)
  bm=bmesh.new();bm.from_mesh(o.data)
  for co,no in [((-1.80,0,0),(-1,0,0)),((3.70,0,0),(1,0,0)),((0,-4.27,0),(0,-1,0)),((0,2.20,0),(0,1,0))]:
   bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=co,plane_no=no,clear_outer=True,clear_inner=False)
  if o.name=='Ceiling_Corrugated_Deck':
   # Disconnected sheet quads have no closed volume: generic "outside" normal
   # recalculation flips a subset upward. Preserve inward/downward sheet winding.
   for f in bm.faces:
    f.normal_update()
    if f.normal.z>0:f.normal_flip()
  else:bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
  bm.to_mesh(o.data);bm.free();o.data.update()
  if not len(o.data.polygons):bpy.data.objects.remove(o,do_unlink=True);continue
  o.hide_select=False;o.hide_viewport=False;o.hide_render=False
  o.lock_location=(False,)*3;o.lock_rotation=(False,)*3;o.lock_scale=(False,)*3
  o['sourceObject']=o.name;o['protected']=True
  if 'Ceiling' in o.name or 'Top_Steel' in o.name or o.name.startswith(('Room_Lamp','Room_HVAC','Lamp_Suspension')):group='ceiling'
  elif 'Column' in o.name:group='structure'
  elif o.name.startswith('Wall_') and 'Skirting' not in o.name:group='walls'
  elif o.name.startswith('Floor'):group='floor'
  elif o.name.startswith('Window'):group='windows'
  elif o.name.startswith('Door'):group='doors'
  elif 'Outlet' in o.name:group='outlets'
  else:group='fixtures'
  if o.name=='Central_Room_SW_Steel_Column':group='structure'
  o['protectedGroup']=group
  if o.name.startswith('Wall_'):o['wallId']='wall-'+o.name.split('_')[1]
  # Physically scaled UV0, a separate UV1 will carry the shared Cycles bake.
  while o.data.uv_layers:o.data.uv_layers.remove(o.data.uv_layers[0])
  uv=o.data.uv_layers.new(name='UVMap')
  for p in o.data.polygons:
   axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
   for li in p.loop_indices:
    co=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
  o.data.uv_layers.new(name='Lightmap')
  o['lightmapped']=not o.name.startswith('Door_03_') and 'Pane' not in o.name
  if o.name.startswith('Door_03_') and ('Leaf' in o.name or 'Hardware' in o.name):o['lightmapped']=False
  elif o.name.startswith('Door_03_'):o['lightmapped']=True
  o.data.transform(Matrix.Translation((-CX,-CY,0)))
 elif o.type=='LIGHT':o.location.x-=CX;o.location.y-=CY

# Correct leaf pivot: handle is at source x3.244, hinge at x2.449.
hinge=Vector((2.449091434-CX,2.07798075-CY,0))
door=bpy.data.objects.new('Interactive_Door_03',None);scene.collection.objects.link(door);door.location=hinge
door['interaction']='hinged-door';door['protected']=True;door['assetId']='architecture.door03'
leafnames=[];framenames=[]
for o in list(bpy.data.objects):
 if o.name.startswith('Door_03_') and o.type=='MESH':
  if 'Leaf' in o.name or 'Hardware' in o.name:
   o.data.transform(Matrix.Translation(-hinge));o.data.update()
   o.parent=door;o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=Matrix.Identity(4);leafnames.append(o.name)
  else:framenames.append(o.name)
for o in list(bpy.data.objects):
 if o.type=='EMPTY' and o!=door:bpy.data.objects.remove(o,do_unlink=True)

def wall(i,axis,coord,mi,ma,normal,openings=None):
 return {'id':i,'axis':axis,'coordinate':coord,'min':mi,'max':ma,'height':3.6,'normal':normal,'openings':openings or []}
windows={'id':'window-06','wallId':'wall-16','center':app((.9580135,-4.0698,2.00661)),'width':3.774115,'height':1.163207,'sillY':1.367507,'minX':-.954044-CX,'maxX':2.870071-CX,'planeZ':-(Y0-CY),'nodePrefix':'Window_06_'}
doorinfo={'id':'door-03','node':'Interactive_Door_03','wallId':'wall-21','hinge':app((2.449091434,2.07798075,0)),'closedAngle':0,'openAngle':-math.radians(95),'width':.9000015,'height':2.045,'openingMin':2.399092-CX,'openingMax':3.399093-CX,'openingHeight':2.1,'leafNames':leafnames,'frameNames':framenames,'swing':{'center':app((2.449091434,2.07798075,0)),'radius':1.05,'angleMin':-math.radians(95),'angleMax':0},'hingeEvidence':'Handle x=3.244, opposite hinge x=2.449; inward swing avoids both adjacent walls.'}
nodes=[]
for o in bpy.data.objects:
 if o.type=='MESH':nodes.append({'name':o.name,'category':o.get('protectedGroup'),'wallId':o.get('wallId'),'lightmapped':bool(o.get('lightmapped')),'vertices':len(o.data.vertices),'polygons':len(o.data.polygons)})
outlets=[]
for o in bpy.data.objects:
 if 'Outlet' in o.name and 'Conduit' not in o.name:
  bb=bounds(o);c=[(bb[0][i]+bb[1][i])/2 for i in range(3)]
  outlets.append({'id':o.name,'position':[c[0],c[2],-c[1]],'size':[bb[1][0]-bb[0][0],bb[1][2]-bb[0][2],bb[1][1]-bb[0][1]]})
room={'schemaVersion':1,'id':'polycam-central-lounge','architectureId':'reconstruction-central-v1','sourceFile':'reconstructed_room.blend','units':'meter','coordinateSystem':'right-handed Y-up, source Blender (x-cx,z,-(y-cy))','sourceCenter':[CX,CY,0],'dimensions':{'width':W,'depth':D,'height':4.32},'bounds':{'min':[-W/2,0,-D/2],'max':[W/2,4.32,D/2]},'floorY':0,'walls':[wall('wall-17','x',-W/2,-D/2,D/2,[1,0,0]),wall('wall-26','x',W/2,-D/2,D/2,[-1,0,0]),wall('wall-21','z',-D/2,-W/2,W/2,[0,0,1],[{'type':'door','min':doorinfo['openingMin'],'max':doorinfo['openingMax'],'bottom':0,'top':2.1}]),wall('wall-16','z',D/2,-W/2,W/2,[0,0,-1],[{'type':'window','min':-.929044-CX,'max':2.845071-CX,'bottom':1.425007,'top':2.588214}])],'window':windows,'door':doorinfo,'columns':[{'id':'column-sw','center':[-1.54-CX,1.8,-(-3.95-CY)],'size':[.19,3.6,.22]}],'outlets':outlets,'protectedGroups':['ceiling','walls','floor','windows','doors','structure','outlets','fixtures'],'nodes':nodes,'lighting':{'type':'cycles-baked-diffuse-irradiance','lightmap':'assets/architecture/lightmap.hdr','uvChannel':1,'intensity':1,'probes':'assets/architecture/probes.json','environment':'assets/architecture/environment.hdr'},'assets':{'production':'assets/architecture/room.meshopt.glb','editor':'assets/architecture/room-editor.meshopt.glb','fallback':'assets/architecture/fallback.jpg'}}
room['id']='lounge-room-01';room['architectureId']='polycam-current-room-v1'
(OUT/'room.json').write_text(json.dumps(room,indent=2),encoding='utf8')

# Assign logical collections without renaming critical nodes.
for name in ['Architecture_Static','Architecture_Door','Bake','Export']:
 if name not in bpy.data.collections:c=bpy.data.collections.new(name);scene.collection.children.link(c)
for o in bpy.data.objects:
 c=bpy.data.collections['Architecture_Door' if o==door or o.parent==door else 'Architecture_Static']
 if o.name not in c.objects:c.objects.link(o)

# Save crop as independent source before atlas/bake so export is available immediately.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-src/room_archviz.blend'))
def export(path):
 for o in bpy.data.objects:o.select_set(o.type in ('MESH','EMPTY'))
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True)
export(OUT/'room.glb')
export(OUT/'room-editor.glb')
(ROOT/'assets-src/analysis/export_stage1.json').write_text(json.dumps({'nodes':len(nodes),'vertices':sum(n['vertices'] for n in nodes),'room':room['dimensions'],'originalGeometryNeverCropped':True},indent=2))
print('ROOM_EXPORT_STAGE1_READY',flush=True)

