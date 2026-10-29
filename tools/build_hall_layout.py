"""Derive hall tables, door-facing surfaces and mounting anchors from live inventory."""
import json, math, re, collections
from pathlib import Path
import numpy as np
from shapely.geometry import box, Point, Polygon
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[1]
CX=.9477145; CY=-1.0209095
def app(p):return [float(p[0]-CX),float(p[2]),float(-(p[1]-CY))]
def app_bounds(b):return {'min':app([b['min'][0],b['max'][1],b['min'][2]]),'max':app([b['max'][0],b['min'][1],b['max'][2]])}
def clean(value):
 if isinstance(value,float):return round(value,9)
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items()}
 if isinstance(value,list):return [clean(v) for v in value]
 return value
def build():
 data=json.loads((ROOT/'assets-src/main-hall/live-inventory.json').read_text(encoding='utf8'));objects={o['name']:o for o in data['objects']}
 walls=[o for o in objects.values() if re.fullmatch(r'Wall_\d+_Clean',o['name'])]
 leaves=[o for o in objects.values() if re.fullmatch(r'Door_\d+_CLOSED_Leaf',o['name'])]
 floor=objects['Floor_Continuous_00']['bounds']; lo=floor['min'];hi=floor['max']
 # An exact 2D arrangement is used in addition to the independently sampled flood
 # fill. A 0.2 mm closure joins harmless float seams in the scanned wall junctions.
 barriers=unary_union([box(o['bounds']['min'][0],o['bounds']['min'][1],o['bounds']['max'][0],o['bounds']['max'][1]).buffer(.0002,join_style=2) for o in walls+leaves])
 free=box(lo[0],lo[1],hi[0],hi[1]).difference(barriers)
 regions=list(free.geoms) if hasattr(free,'geoms') else [free]
 hall=next(p for p in regions if p.contains(Point(0,3)))
 assert hall.contains(Point(-6.5,1.45)) and hall.contains(Point(10,-1.45)),'Both original table banks must share the main hall'
 roots=sorted([o for o in objects.values() if o['type']=='EMPTY' and (re.fullmatch(r'Desk_\d+',o['name']) or o['name'].startswith('East_Desk_'))],key=lambda o:(o['name'].startswith('East_'),int(re.search(r'Desk_(\d+)',o['name'])[1])))
 tables=[];all_meshes=[]
 for root in roots:
  east=root['name'].startswith('East_');number=int(re.search(r'Desk_(\d+)',root['name'])[1]);children=[objects[n] for n in root['children'] if n in objects and objects[n]['type']=='MESH'];all_meshes.extend(c['name'] for c in children)
  bb={'min':[min(c['bounds']['min'][i] for c in children) for i in range(3)],'max':[max(c['bounds']['max'][i] for c in children) for i in range(3)]}
  tables.append({'id':f'source-desk-{"east" if east else "west"}-{number:02d}','assetId':'hallDesk','variant':(3 if root['rotation'][2]>0 else 2) if east else 1,'material':'original',
   'position':app([root['matrix'][0][3],root['matrix'][1][3],root['matrix'][2][3]]),'rotation':root['rotation'][2],
   'dimensions':[1.4,.75,.8] if east else [1.6,.75,1.6],'sourceRoot':root['name'],'sourceMeshes':[c['name'] for c in children],
   'sourceWorldMatrix':root['matrix'],'worldBounds':app_bounds(bb),'regionId':'hall'})
 doors=[];excluded=[];hall_walls={};opening_map={}
 for leaf in sorted(leaves,key=lambda o:o['name']):
  number=int(leaf['name'].split('_')[1]);root=objects[f'Door_{number:02d}_CLOSED'];b=leaf['bounds'];center=(np.array(b['min'])+b['max'])/2
  axis=0 if b['max'][0]-b['min'][0]<b['max'][1]-b['min'][1] else 1;along_axis=1-axis
  side=[]
  for sign in [-1,1]:
   point=center.copy();point[axis]+=.22*sign
   if hall.contains(Point(point[0],point[1])):side.append(sign)
  if len(side)!=1:
   excluded.append({'id':f'door-{number:02d}','sourceRoot':root['name'],'reason':'Neither face belongs to the connected main hall','hallFacingSides':side});continue
  sign=side[0];wall_num=re.search(r'Wall_(\d+)',root['properties']['source_wall'])[1];wall=objects[f'Wall_{wall_num}_Clean'];wb=wall['bounds'];face=wb['max'][axis] if sign>0 else wb['min'][axis]
  normal=[sign,0,0] if axis==0 else [0,0,-sign];rotation=math.pi/2 if normal[0]>0 else -math.pi/2 if normal[0]<0 else math.pi if normal[2]<0 else 0
  along=float(center[along_axis]-CX) if axis==1 else float(-(center[along_axis]-CY));coordinate=float(face-CX) if axis==0 else float(-(face-CY));wall_id='wall-'+wall_num
  wi={'id':wall_id,'sourceNode':wall['name'],'axis':'x' if axis==0 else 'z','coordinate':coordinate,
      'min':float(-(wb['max'][1]-CY)) if axis==0 else float(wb['min'][0]-CX),'max':float(-(wb['min'][1]-CY)) if axis==0 else float(wb['max'][0]-CX),
      'normal':normal,'height':wb['max'][2],'thickness':wb['max'][axis]-wb['min'][axis],'surface':'hall-facing actual mesh plane','openings':[]}
  if wall_id not in hall_walls:hall_walls[wall_id]=wi
  opening={'id':f'door-{number:02d}','min':along-.5,'max':along+.5,'bottom':0,'top':float(root['properties'].get('opening_height_m',2.1)),'kind':'door'}
  hall_walls[wall_id]['openings'].append(opening);opening_map.setdefault(wall_id,[]).append((along-.5,along+.5))
  doors.append({'id':f'door-{number:02d}','sourceRoot':root['name'],'leafName':leaf['name'],'sourceMeshes':[n for n in root['children'] if objects.get(n,{}).get('type')=='MESH'],
   'wallId':wall_id,'label':'Переговорна' if number==3 else 'Сходи' if number==14 else 'Вхід' if number==15 else f'Двері {number:02d}',
   'position':app(center),'along':along,'normal':normal,'rotation':rotation,'wallSurfaceCoordinate':coordinate,
   'leafWidth':b['max'][along_axis]-b['min'][along_axis],'leafHeight':b['max'][2]-b['min'][2],
   'opening':opening,'interactive':number==3,'regionId':'hall',
   'classification':'Exactly one face is in the connected main hall polygon; all closed door leaves were barriers'})
 occupied={k:[] for k in hall_walls}
 for door in doors:
  wall=hall_walls[door['wallId']];center=door['along'];choice=None
  for side in [-1,1]:
   # Plaque nearest to the jamb, colour strip beside it. Both stay beside the
   # frame, not on its moving leaf, and avoid neighbouring door openings.
   plaque=center+side*(.5+.08+.190/2);panel=center+side*(.5+.08+.190+.07+.24/2)
   intervals=[(plaque-.095,plaque+.095),(panel-.12,panel+.12)]
   clear=all(a>=wall['min']+.025 and b<=wall['max']-.025 and all(b+.02<=lo or a-.02>=hi for lo,hi in opening_map[door['wallId']]+occupied[door['wallId']]) for a,b in intervals)
   if clear:choice=(side,plaque,panel,intervals);break
  assert choice,f'No verified adjacent wall space for {door["id"]}'
  side,plaque,panel,intervals=choice;occupied[door['wallId']].extend(intervals)
  def anchor(along,y,depth):
   n=door['normal'];c=door['wallSurfaceCoordinate'];offset=depth/2+.008
   return [c+n[0]*offset,y,along] if wall['axis']=='x' else [along,y,c+n[2]*offset]
  door['plaquePosition']=anchor(plaque,1.55,.034);door['colorElementPosition']=anchor(panel,1.06,.018);door['anchorSide']=side
  door['plaque']={'assetId':'doorPlaque','variant':1,'position':door['plaquePosition'],'rotation':door['rotation'],'dimensions':[.190,.145,.034]}
  door['colorElement']={'assetId':'brandDoorPanel','variant':1,'position':door['colorElementPosition'],'rotation':door['rotation'],'dimensions':[.24,2.12,.018]}
 # The previous lounge is measured independently from its actual interior faces.
 west=objects['Wall_17_Clean']['bounds']['max'][0]-CX;east=objects['Wall_26_Clean']['bounds']['min'][0]-CX
 near=-(objects['Wall_21_Clean']['bounds']['min'][1]-CY);far=-(objects['Wall_16_Clean']['bounds']['max'][1]-CY)
 meeting_walls=[{'id':'west','sourceWallId':'wall-17','axis':'x','coordinate':west,'min':near,'max':far,'normal':[1,0,0],'height':3.6},
  {'id':'east','sourceWallId':'wall-26','axis':'x','coordinate':east,'min':near,'max':far,'normal':[-1,0,0],'height':3.6},
  {'id':'near','sourceWallId':'wall-21','axis':'z','coordinate':near,'min':west,'max':east,'normal':[0,0,1],'height':3.6},
  {'id':'far','sourceWallId':'wall-16','axis':'z','coordinate':far,'min':west,'max':east,'normal':[0,0,-1],'height':3.6}]
 frames=[o for o in objects.values() if o['name'].startswith('Window_06_Frame')]
 win={'min':[min(o['bounds']['min'][i] for o in frames) for i in range(3)],'max':[max(o['bounds']['max'][i] for o in frames) for i in range(3)]}
 door3=next(d for d in doors if d['id']=='door-03')
 previous=json.loads((ROOT/'public/assets/architecture/room.json').read_text())
 meeting={'id':'meeting','sourceRoomId':'lounge-room-01','architectureId':'polycam-current-room-v1','bounds':{'min':[west,0,near],'max':[east,4.32,far]},
  'dimensions':{'width':east-west,'depth':far-near,'height':4.32},'walls':meeting_walls,
  'window':{'wallId':'far','sourceId':'Window_06','min':win['min'][0]-CX,'max':win['max'][0]-CX,'sill':win['min'][2],'height':win['max'][2]-win['min'][2],'frameBounds':app_bounds(win)},
  'door':{'wallId':'near','id':'door-03','center':door3['along'],'width':door3['leafWidth'],'height':door3['leafHeight'],'openingMin':door3['opening']['min'],'openingMax':door3['opening']['max'],'openingHeight':door3['opening']['top'],
   'hinge':previous['door']['hinge'],'openAngle':previous['door']['openAngle'],'node':'Interactive_Door_03','hallAnchorWallId':'wall-21'}}
 def ring(coords):return [[float(p[0]-CX),float(-(p[1]-CY))] for p in coords]
 hall_polygon={'outer':ring(hall.exterior.coords),'holes':[ring(i.coords) for i in hall.interiors],'numericalClosureTolerance':.0002,'source':'Actual floor rectangle minus actual closed wall/leaf mesh bounds; no furniture blockers'}
 minx,miny,maxx,maxy=hall.bounds
 output={'schemaVersion':1,'sourceFile':Path(data['file']).name,'sourceCenter':[CX,CY,0],'units':'metres','upAxis':'Y','regionId':'hall',
  'originalTables':tables,'doors':doors,'excludedDoors':excluded,'hallWalls':list(hall_walls.values()),
  'hallBounds':{'min':[minx-CX,0,-(maxy-CY)],'max':[maxx-CX,4.32,-(miny-CY)]},'hallFloorPolygon':hall_polygon,'hallAreaSquareMetres':hall.area,
  'meetingRoom':meeting,'staticFurnitureNodes':['Space_existingFurniture'],'staticSourceMeshes':all_meshes,
  'tableAssets':{'manifest':'assets/architecture/hall-desk-manifest.json','editorProxyData':'assets-src/main-hall/editor-proxies.json'},
  'lightingNote':'Existing source furniture was excluded from the architecture Cycles bake; hiding static nodes does not leave baked furniture shadows',
  'validation':{'tables':len(tables),'hallFacingDoors':len(doors),'excludedDoors':[d['id'] for d in excluded],'allAnchorsOffDoorLeaves':True,'allPairsAvoidOtherDoorOpenings':True}}
 output=clean(output);dest=ROOT/'public/assets/architecture/hall-layout.json';dest.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf8')
 (ROOT/'assets-src/main-hall/layout-readable.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({'path':str(dest),'bytes':dest.stat().st_size,'tables':len(tables),'doors':len(doors),'excluded':[d['id'] for d in excluded],'area':hall.area},ensure_ascii=False))
 return output
if __name__=='__main__':build()
