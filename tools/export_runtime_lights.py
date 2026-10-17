"""Measured current Blender fixture light sources in the shared web coordinates."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture';lights=[]
def pos(v):return [v.x-.9477145,v.z,-(v.y+1.0209095)]
def direction(v):return [v.x,v.z,-v.y]
for o in bpy.data.objects:
 if o.type!='LIGHT':continue
 d=o.data;mat=o.matrix_world.to_3x3();p=o.matrix_world.translation;u=(mat@Vector((1,0,0))).normalized();v=(mat@Vector((0,1,0))).normalized();n=(mat@Vector((0,0,-1))).normalized()
 sx=float(getattr(d,'size',0));sy=float(getattr(d,'size_y',sx)) if getattr(d,'shape',None) in ['RECTANGLE','ELLIPSE'] else sx
 lights.append({'id':o.name,'type':d.type,'position':pos(p),'direction':direction(n),'tangentU':direction(u),'tangentV':direction(v),'lengthDirection':direction(u if sx>=sy else v),'size':[sx,sy],'length':max(sx,sy),'width':min(sx,sy),'colorLinear':list(d.color),'sourceEnergyWatts':float(d.energy),'sourceShape':getattr(d,'shape',None),'group':'central-room' if o.name.startswith('Room_') else 'hall','castsSourceShadows':d.use_shadow,'estimatedLumensAt80lmPerW':float(d.energy)*80,'conversionNote':'Source value is Blender radiometric area-light power. Browser candela/photometric intensity needs one shared exposure calibration, not a literal 80cd.'})
windows={}
for o in bpy.data.objects:
 if o.type!='MESH' or not o.name.startswith('Window_') or '_Pane_' not in o.name:continue
 key='_'.join(o.name.split('_')[:2]);vs=[o.matrix_world@p.co for p in o.data.vertices];windows.setdefault(key,[]).extend(vs)
backdrops=[]
for key,vs in windows.items():
 lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)];c=Vector([(lo[i]+hi[i])/2 for i in range(3)]);p=pos(c)
 backdrops.append({'id':key,'center':p,'planePosition':[p[0],p[1],p[2]+.24],'planeSize':[hi[0]-lo[0]+.9,hi[2]-lo[2]+.55],'normal':[0,0,-1],'rotationY':math.pi,'hdr':'assets/environment/factory-window.hdr','rendering':'Linear HDR front projection on an unlit toneMapped plane, positioned outside real wall, glass remains reflective in front. Architecture occludes the extra margin.'})
data={'schemaVersion':1,'coordinateSystem':'same centered Y-up metres as room/space','lights':lights,'bakeIndirectOnly':True,'windowBackdrops':backdrops}
(OUT/'runtime-lighting.json').write_text(json.dumps(data,indent=2));print('RUNTIME_LIGHTS_READY',len(lights),len(backdrops))
