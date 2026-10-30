import {defaultDoorPlaqueLabel} from '../core/door-labels';
import { DEFAULT_LAYERS, PROJECT_ID, type SceneConfig, type SceneObject } from '../core/types';
import { getAsset, getVariant } from './catalog';
import { validatePlacement, wallAnchor } from '../core/placement';
import { hallSigns } from './hall-signs';
import { ROOM } from '../core/room';
import { defaultRegionPresets, objectRegion } from '../core/regions';
import { HALL_LAYOUT, hallWallSurfaces, originalHallTables } from '../core/hall';
import type { RoomDefinition, WallFinish } from '../core/types';
import { getPaintableBounds } from '../core/wall-paint';
import { rearPartitions } from './rear-partitions';
import { hallClocks } from './hall-clocks';
const date='2026-10-16T00:00:00.000Z';
const pi=Math.PI;
function item(id:string,assetId:string,variant:number,x:number,z:number,rotation=0,material?:string,y=0):SceneObject { return {id,assetId,variant,material:material??getAsset(assetId).materials[0].id,position:[x,y,z],rotation}; }
function wall(id:string,assetId:string,variant:number,wallId:string,along:number,height:number,material?:string):SceneObject { return {...item(id,assetId,variant,0,0,0,material),...wallAnchor(wallId,along,height,getVariant(assetId,variant).dimensions[2])}; }
function common(style:number):SceneObject[] {return [wall('ProjectBoard','board',style%3===2?1:style%3+1,'east',.65,1.65),wall('AcousticEast','acousticPanel',style%3+1,'east',-1.2,1.65,style%2?'graphite':'sage'),wall('Artwork','art',style%3+1,'near',-1.15,1.65),wall('RoomClock','clock',style%2+1,'near',.55,2.3,'black'),wall('AcousticWest','acousticPanel',style%3+1,'west',1.25,1.75,style%2?'oat':'blue')];}
function preset(index:number,name:string,objects:SceneObject[]):SceneConfig {return {schemaVersion:2,projectId:PROJECT_ID,roomId:'lounge-room-01',presetId:`builtin-${index}`,name:`${index}: ${name}`,createdAt:date,updatedAt:date,basePresetId:`builtin-${index}`,modified:false,hallDecorRevision:1,doorLabelRevision:1,objects:[...objects,...hallSigns()].map(o=>({...o,regionId:objectRegion(o)})),doorOpen:false,layers:{...DEFAULT_LAYERS},regionPresets:defaultRegionPresets(`builtin-${index}`),wallFinishes:{}};}
function bar(variant:number,material:string):SceneObject[] {const z=variant===2?ROOM.bounds.maxZ-getVariant('windowBar',variant).dimensions[2]/2+.003:2.715,seatZ=1.95+z-2.715;return [item('WindowBar','windowBar',variant,0,z,0,material),item('BarSeatA','barStool',variant,-.83,seatZ,0,'graphite'),item('BarSeatB','barStool',variant,.83,seatZ,0,'oat')];}
function accessory(id:string,x:number,z:number,height:number,variant=1):SceneObject {return item(id,'accessory',variant,x,z,0,'white',height);}
export const BUILTIN_PRESETS:SceneConfig[] = [
 preset(0,'Порожній простір',[]),
 preset(1,'Тепла Скандинавія',[
  item('MainSofa','sofa',1,-.95,-2.45,0,'oat'),item('CoffeeTable','coffeeTable',1,-.95,-1.27,0,'oak'),item('LoungeChair','armchair',2,.65,-.65,-.7,'sage'),item('SideTable','sideTable',1,.15,-2.35,0,'oak'),item('LoungeRug','rug',2,-.75,-1.5,0,'oat'),
  ...bar(1,'oak'),item('Storage','storage',3,-2.15,.15,pi/2,'ash'),item('PlantA','plant',1,2.23,2.32,0,'white'),item('PlantB','plant',3,-2.23,2.45,0,'clay'),item('ReadingLight','floorLamp',1,-2.22,-2.5,0,'black'),accessory('CoffeeBooks',-.95,-1.27,.4),...common(1)]),
 preset(2,'М’який індустріальний',[
  item('MainSofa','sofa',2,-1.94,-1.25,pi/2,'graphite'),item('CoffeeTable','coffeeTable',3,-.78,-1.25,pi/2,'walnut'),item('LoungeChair','armchair',2,.45,-1.25,-pi/2,'clay'),item('LoungeRug','rug',2,-.65,-1.25,pi/2,'graphite'),
  item('MeetingTable','meetingTable',1,.35,1.3,0,'oak'),item('MeetingSeatA','chair',1,-.65,1.3,pi/2,'graphite'),item('MeetingSeatB','chair',1,1.35,1.3,-pi/2,'graphite'),item('Storage','storage',1,-.4,2.78,0,'walnut'),item('PlantA','plant',2,2.23,2.32,0,'black'),item('PlantB','plant',3,-2.23,2.45,0,'clay'),item('ReadingLight','floorLamp',2,-.75,-2.65,0,'black'),accessory('CoffeeBooks',-.78,-1.25,.42),...common(2)]),
 preset(3,'Мінімалістичні технології',[
  item('MainSofa','sofa',4,-1.3,-1.45,pi/2,'blue'),item('CoffeeTable','coffeeTable',2,-.15,-1.45,pi/2,'white'),item('LoungeRug','rug',1,-.25,-1.45,pi/2,'graphite'),
  item('MeetingTable','meetingTable',2,.15,1.35,0,'white'),item('MeetingSeatA','chair',3,-.3,.5,0,'graphite'),item('MeetingSeatB','chair',3,.65,.5,0,'graphite'),item('MeetingSeatC','chair',3,-.3,2.2,pi,'graphite'),item('MeetingSeatD','chair',3,.65,2.2,pi,'graphite'),item('Storage','storage',1,-2.15,1.5,pi/2,'white'),item('PlantA','plant',1,2.23,2.32,0,'black'),item('PlantB','plant',3,-2.22,2.65,0,'white'),accessory('Laptop',.15,1.35,.74,2),...common(3)]),
 preset(4,'Темний преміум · розмова',[
  item('MainSofa','sofa',2,-1.95,-.5,pi/2,'graphite'),item('SecondSofa','sofa',1,1.95,-.5,-pi/2,'blue'),item('CoffeeTable','coffeeTable',2,0,-.5,pi/2,'walnut'),item('LoungeRug','rug',3,0,-.5,0,'graphite'),item('SideTable','sideTable',3,-.95,-2.2,0,'walnut'),
  item('WorkDesk','workDesk',1,-.25,2.65,pi,'walnut'),item('WorkChair','chair',3,-.25,1.73,pi,'graphite'),item('Storage','storage',3,-2.15,1.65,pi/2,'walnut'),item('PlantA','plant',1,2.23,2.32,0,'black'),item('PlantB','plant',3,-2.22,-2.67,0,'black'),item('ReadingLight','floorLamp',1,1.95,1.15,0,'black'),accessory('DeskLaptop',-.25,2.65,.74,2),...common(4)]),
 preset(5,'Світлий преміум · робота біля вікна',[
  item('MainSofa','sofa',3,-1.97,-1.45,pi/2,'oat'),item('CoffeeTable','coffeeTable',2,-.75,-1.45,pi/2,'ash'),item('LoungeChair','armchair',1,.6,-1.25,-pi/2,'oat'),item('SideTable','sideTable',2,.3,.0,0,'ash'),item('LoungeRug','rug',2,-.7,-1.35,pi/2,'oat'),...bar(2,'ash'),item('Storage','storage',3,2.19,.6,-pi/2,'white'),item('PlantA','plant',1,2.23,2.32,0,'white'),item('PlantB','plant',3,-2.22,2.5,0,'white'),item('ReadingLight','floorLamp',2,-.8,-2.6,0,'white'),accessory('BarLaptop',.75,2.72,1.05,2),...common(5)]),
 preset(6,'Біофільний відпочинок',[
  item('MainSofa','sofa',1,-1,.25,pi,'sage'),item('CoffeeTable','coffeeTable',1,-1,-.95,0,'oak'),item('LoungeChair','armchair',3,.65,-.7,-2.17,'sage'),item('LoungeRug','rug',3,-.8,-.6,0,'oat'),item('SideTable','sideTable',1,.2,.35,0,'oak'),
  item('WorkDesk','workDesk',1,.25,2.65,pi,'oak'),item('WorkChair','chair',2,.25,1.73,0,'sage'),item('Storage','storage',2,-2.2,1.5,pi/2,'oak'),item('PlantA','plant',2,2.23,2.32,0,'clay'),item('PlantB','plant',1,-1.9,2.38,0,'white'),item('PlantC','plant',3,2.24,.45,0,'clay'),item('ReadingLight','floorLamp',1,-2.24,-2.5,0,'white'),accessory('WorkLaptop',.25,2.65,.74,2),...common(6)]),
 preset(7,'Творча студія',[
  item('MainSofa','sofa',4,-1.98,-1.6,pi/2,'ochre'),item('CoffeeTable','coffeeTable',3,-.85,-1.6,pi/2,'ash'),item('Pouf','pouf',1,.25,-1.6,0,'clay'),item('LoungeRug','rug',1,-.85,-1.6,pi/2,'blue'),
  item('MeetingTable','meetingTable',2,-.2,1,0,'ash'),item('MeetingSeatA','chair',1,-.65,.15,0,'blue'),item('MeetingSeatB','chair',1,.3,.15,0,'ochre'),item('MeetingSeatC','chair',1,-.65,1.85,pi,'clay'),item('MeetingSeatD','chair',1,.3,1.85,pi,'sage'),item('Storage','storage',3,2.18,.9,-pi/2,'white'),item('PlantA','plant',1,2.23,2.32,0,'white'),item('PlantB','plant',3,-2.2,2.5,0,'clay'),accessory('WorkshopBooks',-.2,1,.74),...common(7)]),
 preset(8,'Сучасний коворкінг',[
  item('MainSofa','sofa',4,-.95,-2.48,0,'blue'),item('CoffeeTable','coffeeTable',3,-.95,-1.33,0,'oak'),item('LoungeChair','armchair',2,.62,-.7,-.65,'graphite'),item('LoungeRug','rug',1,-.8,-1.65,0,'graphite'),...bar(3,'oak'),item('BarSeatC','barStool',3,0,1.95,0,'sage'),item('Storage','storage',2,-2.2,.2,pi/2,'oak'),item('PlantA','plant',2,2.23,2.32,0,'white'),item('PlantB','plant',3,-2.2,2.5,0,'clay'),item('ReadingLight','floorLamp',2,-2.22,-2.5,0,'black'),accessory('CoworkLaptop',0,2.72,1.05,2),...common(8)]),
 preset(9,'Неформальні ділові зустрічі',[
  item('MainSofa','sofa',2,-1.4,-1.35,pi/2,'clay'),item('CoffeeTable','coffeeTable',2,-.25,-1.35,pi/2,'walnut'),item('LoungeChair','armchair',2,1,-.45,-2.195,'graphite'),item('LoungeRug','rug',2,-.1,-1.35,pi/2,'oat'),
  item('MeetingTable','meetingTable',3,.25,1.35,0,'walnut'),item('MeetingSeatA','chair',2,-.95,1.35,pi/2,'graphite'),item('MeetingSeatB','chair',2,1.45,1.35,-pi/2,'graphite'),item('Storage','storage',1,-.25,2.78,0,'walnut'),item('PlantA','plant',1,2.23,2.32,0,'black'),item('PlantB','plant',3,-2.22,2.45,0,'black'),item('ReadingLight','floorLamp',1,-.8,-2.65,0,'black'),accessory('ExecutiveBooks',-.25,-1.35,.39),...common(9)]),
 preset(10,'Гнучка співпраця',[
  item('MainSofa','sofa',4,-.95,-2.48,0,'sage'),item('CoffeeTable','coffeeTable',1,-.95,-1.3,0,'white'),item('PoufA','pouf',1,.2,-1.3,0,'ochre'),item('PoufB','pouf',1,-2.1,-1.3,0,'blue'),item('LoungeRug','rug',1,-.95,-1.65,0,'oat'),
  item('MeetingTable','meetingTable',1,.15,1.15,0,'white'),item('MeetingSeatA','chair',2,-.9,1.15,pi/2,'sage'),item('MeetingSeatB','chair',2,1.2,1.15,-pi/2,'sage'),item('Bench','bench',1,.15,2.45,pi,'oat'),item('Storage','storage',3,-2.15,.3,pi/2,'ash'),item('PlantA','plant',1,2.23,2.32,0,'white'),item('PlantB','plant',3,-2.22,2.4,0,'white'),accessory('CollabBooks',.15,1.15,.74),...common(10)]),
 preset(11,'Кав’ярня для роботи',[
  item('MainSofa','sofa',1,-.9,-2.45,0,'clay'),item('CoffeeTable','coffeeTable',1,-.9,-1.25,0,'walnut'),item('LoungeChair','armchair',1,.65,-.8,-.7,'ochre'),item('LoungeRug','rug',3,-.75,-1.5,0,'oat'),...bar(1,'walnut'),item('Storage','storage',1,-2.15,.4,pi/2,'walnut'),item('PlantA','plant',2,2.23,2.32,0,'clay'),item('PlantB','plant',3,-2.22,2.45,0,'clay'),item('ReadingLight','floorLamp',2,-2.22,-2.5,0,'black'),accessory('CafeTray',-.9,-1.25,.4,3),...common(11)]),
 preset(12,'Акустична зосередженість',[
  item('MainSofa','sofa',1,-1.95,-1.55,pi/2,'graphite'),item('CoffeeTable','coffeeTable',1,-.8,-1.55,0,'oak'),item('LoungeChair','armchair',3,.45,-1.45,-pi/2,'blue'),item('LoungeRug','rug',2,-.7,-1.5,pi/2,'graphite'),
  item('WorkDesk','workDesk',3,-.85,2.65,pi,'oak'),item('WorkChair','chair',3,-.85,1.75,pi,'graphite'),item('Separator','separator',2,.35,1.4,pi/2,'sage'),item('Storage','storage',3,2.18,.9,-pi/2,'oak'),item('PlantA','plant',1,2.23,2.32,0,'black'),item('PlantB','plant',3,-2.22,2.45,0,'white'),item('ReadingLight','floorLamp',1,-.65,-2.65,0,'black'),accessory('FocusLaptop',-.85,2.65,.74,2),...common(12),wall('AcousticWestB','acousticPanel',1,'west',-.4,1.75,'graphite')]),
 preset(13,'Медіазона та презентації',[
  item('MainSofa','sofa',3,1.3,-.25,-pi/2,'blue'),item('CoffeeTable','coffeeTable',2,.05,-.25,pi/2,'black'),item('PoufA','pouf',2,-1.05,-1,0,'ochre'),item('PoufB','pouf',2,-1.05,.5,0,'graphite'),item('LoungeRug','rug',2,.05,-.25,pi/2,'graphite'),
  item('WorkDesk','workDesk',1,.2,2.65,pi,'black'),item('WorkChair','chair',3,.2,1.73,0,'blue'),item('Storage','storage',1,-2.15,1.3,pi/2,'black'),item('PlantA','plant',1,2.23,2.32,0,'black'),item('PlantB','plant',3,-2.23,2.45,0,'white'),item('ReadingLight','floorLamp',2,-1,-2.7,0,'black'),accessory('MediaLaptop',.2,2.65,.74,2),...common(13)]),
 preset(14,'Тепла бібліотека',[
  item('MainSofa','sofa',4,-.9,-2.48,0,'ochre'),item('CoffeeTable','coffeeTable',2,-.9,-1.35,0,'walnut'),item('LoungeChair','armchair',2,.65,-.6,-.7,'oat'),item('SideTable','sideTable',1,.15,-2.4,0,'walnut'),item('LoungeRug','rug',1,-.75,-1.65,0,'clay'),...bar(2,'walnut'),item('Storage','storage',2,-2.2,.15,pi/2,'walnut'),item('PlantA','plant',1,2.23,2.32,0,'clay'),item('PlantB','plant',3,-2.22,2.45,0,'clay'),item('ReadingLight','floorLamp',1,-2.23,-2.45,0,'black'),accessory('LibraryBooks',-.9,-1.35,.39),...common(14)]),
 preset(15,'Відкритий форум',[
  item('MainSofa','sofa',4,-1.98,-1.55,pi/2,'sage'),item('CoffeeTable','coffeeTable',1,-.85,-1.55,0,'ash'),item('Pouf','pouf',1,.25,-1.55,0,'ochre'),item('LoungeRug','rug',1,-.9,-1.55,pi/2,'oat'),
  item('MeetingTable','meetingTable',1,.05,1.15,0,'ash'),item('MeetingSeatA','chair',1,-1,1.15,pi/2,'sage'),item('MeetingSeatB','chair',1,1.1,1.15,-pi/2,'blue'),item('Bench','bench',2,.05,2.45,pi,'sage'),item('Storage','storage',3,2.18,-.3,-pi/2,'ash'),item('PlantA','plant',2,2.23,2.32,0,'white'),item('PlantB','plant',3,-2.23,2.45,0,'white'),item('ReadingLight','floorLamp',2,-.8,-2.65,0,'white'),accessory('ForumBooks',.05,1.15,.74),...common(15)]),
];
function deepFreeze<T>(value:T):T { if(value&&typeof value==='object') {Object.freeze(value); Object.values(value).forEach(v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v))deepFreeze(v);});}return value; }
for(const p of BUILTIN_PRESETS){
 const index=Number(p.presetId.slice(8));
 if([3,6,13].includes(index))p.objects.push({...wall('MarkerBoard','board',1,index===13?'east':'west',index===13?1.2:-1.15,1.75,'white'),regionId:'meeting'});
 if([1,4,7,9,10].includes(index))p.objects.push({...wall('MarkerBoard','board',1,[4,7,10].includes(index)?'east':'west',[4,7,10].includes(index)?1.95:-1.15,1.75,'white'),regionId:'meeting'});
 const mediaWall={3:['east',-1.45],6:['near',-1],9:['east',-1.35],13:['west',-.25]}[index] as [string,number]|undefined;
 if(mediaWall){
  const board=p.objects.find(o=>o.id==='ProjectBoard')!;Object.assign(board,wall('ProjectBoard','television',3,mediaWall[0],mediaWall[1],1.45,'graphite'));
  if(index===3||index===9)Object.assign(p.objects.find(o=>o.id==='AcousticEast')!,wall('AcousticEast','acousticPanel',index%3+1,'east',1.65,1.75,index%2?'graphite':'sage'));
  if(index===6)Object.assign(p.objects.find(o=>o.id==='Artwork')!,wall('Artwork','art',1,'east',.65,1.65));
 }
 if([5,7,14].includes(index)){const art=p.objects.find(o=>o.id==='Artwork')!;Object.assign(art,wall('Artwork','edsSignage',6,'near',-1.15,1.85,'original'));}
 if([5,9].includes(index)){const table=p.objects.find(o=>o.id==='CoffeeTable')!;table.variant=4;const books=p.objects.find(o=>o.id==='ExecutiveBooks');if(books)books.position[1]=.4;}
 if(index===11){const table=p.objects.find(o=>o.id==='CoffeeTable')!;table.variant=5;const tray=p.objects.find(o=>o.id==='CafeTray');if(tray)tray.position[1]=.39;}
 if([7,11,13].includes(index)){const storage=p.objects.find(o=>o.id==='Storage')!;p.objects.push(item('CoffeeMachine','coffeeMachine',1,storage.position[0],storage.position[2],0,'steel',getVariant(storage.assetId,storage.variant).dimensions[1]));}
 // Production assets and proxies share +Z as their forward direction. Keep
 // chairs facing their usable surface instead of presenting their backs to it.
 const face=(object:SceneObject,target:SceneObject)=>object.rotation=Math.atan2(target.position[0]-object.position[0],target.position[2]-object.position[2]);
 const coffee=p.objects.find(o=>o.id==='CoffeeTable'),desk=p.objects.find(o=>o.id==='WorkDesk'),workChair=p.objects.find(o=>o.id==='WorkChair');
 const windowBar=p.objects.find(o=>o.assetId==='windowBar'&&o.variant===2);
 if(windowBar)for(const object of p.objects.filter(o=>o.assetId==='accessory'&&o.position[1]===1.05))object.position[2]+=windowBar.position[2]-2.715;
 if(desk&&workChair)face(workChair,desk);
 if(coffee&&index!==6){const chair=p.objects.find(o=>o.id==='LoungeChair');if(chair)face(chair,coffee);}
 for(const object of p.objects){
  if(object.assetId==='storage'&&object.position[2]>2.6)object.rotation=pi;
  if(object.assetId==='accessory'&&object.variant===2){const seats=p.objects.filter(o=>o.assetId==='chair'||o.assetId==='barStool').sort((a,b)=>Math.hypot(a.position[0]-object.position[0],a.position[2]-object.position[2])-Math.hypot(b.position[0]-object.position[0],b.position[2]-object.position[2]));if(seats[0])face(object,seats[0]);}
 }
}
const hallWallRoom:RoomDefinition={...ROOM,walls:hallWallSurfaces()};
const doorNames:Record<string,string>={
 'door-02':'Кімната команди','door-03':'Переговорна','door-04':'Проєктний відділ',
 'door-05':'Інженерний відділ','door-06':'Керівник проєктів','door-07':'Робочий кабінет',
 'door-08':'Технічне приміщення','door-09':'Комерційний відділ','door-10':'Кабінет команди',
 'door-11':'Архів','door-12':'Сервісна кімната','door-13':'Склад','door-14':'Сходи','door-15':'Вхід',
};
const corporate=['eds-blue','eds-lavender','eds-lime','eds-black'];
function hallItem(id:string,assetId:string,variant:number,x:number,z:number,rotation=0,material?:string,y=0):SceneObject {
 return {...item(`hall-${id}`,assetId,variant,x,z,rotation,material,y),regionId:'hall'};
}
function hallDoorObjects(style:number):SceneObject[]{
 return HALL_LAYOUT.doors.flatMap((door,index)=>{
  const surface=hallWallRoom.walls.find(w=>w.id===door.wallId)!;
  const along=(p:number[])=>p[surface.axis==='x'?2:0];
  const plaqueVariant=style%3+1,panelVariant=style%3+1;
  const plaque=wallAnchor(door.wallId,along(door.colorElementPosition),1.55,getVariant('doorPlaque',plaqueVariant).dimensions[2],hallWallRoom);
  const panelDimensions=getVariant('brandDoorPanel',panelVariant).dimensions;
  const panel=wallAnchor(door.wallId,along(door.colorElementPosition),(surface.height??3.6)-panelDimensions[1]/2,panelDimensions[2],hallWallRoom);
  const number=door.id.slice(-2),label=doorNames[door.id]??door.label;
  return [
   {id:`hall-${door.id}-plaque`,assetId:'doorPlaque',variant:plaqueVariant,material:style%3===2?'eds-lavender':'eds-white',...plaque,regionId:'hall' as const,label:defaultDoorPlaqueLabel(door.id)},
   {id:`hall-${door.id}-brand`,assetId:'brandDoorPanel',variant:panelVariant,material:corporate[(index+style)%corporate.length],...panel,regionId:'hall' as const},
  ];
 });
}
function beanPair(prefix:string,x:number,z:number,variant:number,colors:[string,string]=['eds-blue','eds-lime']):SceneObject[]{
 const table=hallItem(`${prefix}-coffee`,'coffeeTable',variant%5+1,x,z,0,'oak');
 const seats=[hallItem(`${prefix}-bean-a`,'beanBag',variant,-1.35+x,z-.75,0,colors[0]),hallItem(`${prefix}-bean-b`,'beanBag',variant,1.35+x,z-.75,0,colors[1])];
 for(const seat of seats)seat.rotation=Math.atan2(x-seat.position[0],z-seat.position[2]);
 return [table,...seats,hallItem(`${prefix}-rug`,'rug',2,x,z-.2,0,'oat')];
}
function sofaNook(prefix:string,x:number,z:number,style:number):SceneObject[]{
 const sofa=hallItem(`${prefix}-sofa`,'sofa',style%4+1,x,z+1.15,pi,style%2?'blue':'oat');
 return [...beanPair(prefix,x,z,style%3+1),sofa,hallItem(`${prefix}-light`,'floorLamp',style%2+1,x-2.15,z+1.25,0,'black')];
}
function meetingSet(prefix:string,x:number,z:number,variant:number):SceneObject[]{
 const table=hallItem(`${prefix}-table`,'meetingTable',variant,x,z,0,'oak');
 const seats=[[-1,0],[1,0],[0,-.95],[0,.95]].map(([dx,dz],i)=>hallItem(`${prefix}-seat-${i}`,'chair',i%3+1,x+dx,z+dz,Math.atan2(-dx,-dz),i%2?'blue':'graphite'));
 return [table,...seats];
}
const hallPlants=(style:number)=>[
 hallItem('plant-west','plant',style%2+1,-12.2,1.8,0,style%2?'white':'black'),
 hallItem('plant-east','plant',style%2+1,21.8,1.95,0,style%2?'clay':'white'),
];
/** A few hall designs use the existing sculptural logo as an additional accent.
 * Positions are clear measured wall38 spans; they never replace either sign. */
function hallVolumeLogo(style:number):SceneObject[] {
 const placements:Record<number,[number,number]>={1:[15.3,2.15],4:[-15.4,2.25],6:[-9.25,2.35],7:[21.7,2.2]};
 const placement=placements[style];if(!placement)return[];
 return [{id:'HallVolumeLogo',assetId:'edsSignage',variant:6,material:'original',regionId:'hall',...wallAnchor('wall-38',placement[0],placement[1],getVariant('edsSignage',6).dimensions[2],hallWallRoom)}];
}
/** Artwork on the hall-facing entrance wall seen in the Blender viewport.
 * Leave the door and its painted wayfinding strip clear. Each piece remains an
 * independent editable wall graphic, so its placement and layers can be changed. */
function hallEntranceGraphics(style:number):SceneObject[]{
 // The wall is shared with door 03. Keep every painted shape to the left of
 // its plaque, while changing both the visual rhythm and hierarchy per preset.
 // Tuples: artwork, wall X, height, width, height, angle in degrees, colour, opacity.
 type Accent=[number,number,number,number,number,number,string,number];
 const blue='#0b30c1',lavender='#a2b8fe',black='#1e2420',lime='#a0ff3d';
 const compositions:Accent[][]=[
  [[11,-1.58,2.53,1.60,.37,-8,blue,.88],[6,-2.10,1.72,.64,.64,15,black,.9],[9,-.76,1.76,1.00,.65,12,lavender,.8],[5,-1.63,.88,.49,.49,-32,blue,.88],[4,-.56,.78,.58,.58,45,lime,.68],[7,-1.14,1.27,.32,.32,-15,black,.72]],
  [[10,-1.55,2.52,1.76,.52,9,black,.88],[2,-1.98,1.65,.90,.90,-12,lavender,.75],[5,-.72,1.75,.62,.62,36,blue,.92],[6,-1.60,.78,.48,.48,0,black,.84],[3,-.60,.76,.43,.43,-35,lime,.74],[7,-1.12,1.18,.28,.28,20,blue,.82],[4,-2.29,.77,.32,.32,45,lavender,.75]],
  [[1,-1.62,2.50,1.75,.31,-13,blue,.85],[12,-1.91,1.62,.96,.65,8,lime,.68],[7,-.66,1.76,.57,.57,-30,black,.9],[4,-1.46,.82,.60,.60,45,lavender,.8],[3,-.45,.82,.48,.48,18,blue,.88],[5,-1.05,1.23,.30,.30,-20,black,.76]],
  [[11,-1.66,2.54,1.68,.39,12,black,.85],[2,-2.08,1.67,.75,.75,16,lavender,.78],[3,-.77,1.78,.72,.72,-22,blue,.92],[9,-1.56,.84,.88,.50,-8,lime,.7],[6,-.48,.76,.42,.42,45,black,.84],[7,-1.13,1.27,.28,.28,30,blue,.8],[5,-2.22,.74,.34,.34,-25,lavender,.85]],
  [[10,-1.56,2.53,1.71,.49,-8,blue,.85],[9,-1.90,1.70,.92,.61,-18,lavender,.8],[6,-.70,1.78,.70,.70,22,black,.9],[4,-1.58,.82,.52,.52,45,lime,.7],[5,-.52,.78,.46,.46,-25,blue,.85],[3,-1.07,1.20,.31,.31,20,black,.8]],
  [[1,-1.57,2.52,1.69,.34,10,black,.85],[8,-2.03,1.70,.79,.79,-15,lavender,.78],[7,-.73,1.77,.69,.69,30,blue,.9],[12,-1.55,.82,.95,.48,7,lime,.65],[5,-.49,.75,.42,.42,-35,black,.85],[6,-1.05,1.22,.29,.29,45,blue,.8],[3,-2.26,.81,.30,.30,20,lavender,.8]],
  [[11,-1.60,2.53,1.74,.39,-10,blue,.9],[12,-1.96,1.67,.91,.67,14,lime,.66],[5,-.71,1.77,.65,.65,-28,black,.88],[9,-1.58,.82,.84,.48,12,lavender,.8],[4,-.50,.78,.46,.46,45,blue,.85],[7,-1.08,1.22,.31,.31,-20,black,.8]],
  [[10,-1.58,2.52,1.72,.50,11,black,.85],[2,-2.04,1.68,.81,.81,-15,lavender,.78],[6,-.73,1.78,.67,.67,30,blue,.9],[3,-1.58,.83,.53,.53,-25,lime,.7],[5,-.51,.76,.45,.45,25,black,.85],[9,-1.09,1.23,.39,.27,-12,blue,.8],[4,-2.25,.78,.30,.30,45,lavender,.78]],
 ];
 return compositions[style%compositions.length].map(([variant,along,y,width,height,degrees,color,opacity],i)=>({
  id:`hall-entrance-graphic-${i+1}`,assetId:'corporateMotif',variant,material:'eds-blue',regionId:'hall',
  ...wallAnchor('wall-21',along,y,getVariant('corporateMotif',variant).dimensions[2],hallWallRoom),
  graphic:{width,height,angle:degrees*pi/180,opacity,layer:i,color},
 }));
}
function hallPreset(index:number,name:string,decor:SceneObject[],finishes:Record<string,WallFinish>={}):SceneConfig{
 const id=`hall-preset-${index}`,config=preset(0,name,[]);
 config.presetId=config.basePresetId=id;config.name=`${index}: ${name}`;
 config.objects=[...originalHallTables(),...hallDoorObjects(index),...hallSigns(index),...hallClocks(index),...hallVolumeLogo(index),...hallEntranceGraphics(index),...decor,...rearPartitions(index)];
 config.regionPresets.hall={presetId:id,basePresetId:id,modified:false};config.wallFinishes=finishes;
 return config;
}
const finish=(motif:WallFinish['motif'],accent='#0b30c1',color:string|null=null):WallFinish=>({color,motif,accent});
/** Independent main-hall designs use the real source desk transforms unchanged.
 * Service-room names are proposed design labels, not a survey of room use. */
export const HALL_PRESETS:SceneConfig[]=[
 hallPreset(0,'EDS · робота та відпочинок',[
  ...beanPair('west',-16,.35,1),...beanPair('east',18.7,.7,2),...hallPlants(0),
 ]),
 hallPreset(1,'Корпоративний діалог',[
  ...sofaNook('west',-16,.35,1),...meetingSet('east',18.4,.45,1),
  hallItem('east-bean','beanBag',3,21.5,-.5,-pi/2,'eds-lavender'),...hallPlants(1),
 ],{'wall-38':finish(1)}),
 hallPreset(2,'М’який індастріал',[
  ...beanPair('west',-16,.3,2,['eds-black','eds-lime']),hallItem('west-bench','bench',2,-16,1.8,pi,'graphite'),
  ...sofaNook('east',18.5,.6,2),hallItem('west-shelf','storage',2,-18.8,1.8,pi,'walnut'),...hallPlants(0),
 ],{'wall-38':finish(3,'#a0ff3d')}),
 hallPreset(3,'Біофільний простір',[
  ...beanPair('west',-16,.35,3,['eds-lavender','eds-blue']),...sofaNook('east',18.5,.6,0),
  hallItem('west-planter','separator',3,-16,2.05,0,'sage'),hallItem('west-green','plant',3,-18.4,1.7,0,'clay'),
  hallItem('east-green','plant',2,21.9,-1.1,0,'white'),...hallPlants(1),
 ],{'wall-23':finish(2,'#a2b8fe')}),
 hallPreset(4,'Кавова пауза',[
  ...meetingSet('west',-16,.4,1),hallItem('west-bean','beanBag',1,-12.8,.1,-pi/2,'eds-lime'),
  ...beanPair('east',18.5,.5,2),hallItem('east-cafe','workDesk',2,18.5,2.35,pi,'walnut'),
  hallItem('east-coffee-machine','coffeeMachine',2,18.5,2.35,0,'steel',.74),...hallPlants(0),
 ],{'wall-38':finish(1,'#a2b8fe')}),
 hallPreset(5,'Тиха робота',[
  hallItem('west-work','workDesk',2,-16,1.85,pi,'oak'),hallItem('west-work-chair','chair',3,-16,.9,0,'blue'),
  hallItem('west-laptop','accessory',2,-16,1.85,pi,'white',.74),hallItem('west-separator','separator',2,-17.6,1.05,pi/2,'sage'),
  hallItem('west-bean-a','beanBag',2,-18.8,.1,.8,'eds-blue'),hallItem('west-bean-b','beanBag',3,-13.5,.1,-.8,'eds-lavender'),
  ...beanPair('east',18.7,.6,1),hallItem('east-shelf','storage',2,18.7,2.45,pi,'ash'),...hallPlants(1),
 ],{'wall-13':finish(2,'#0b30c1')}),
 hallPreset(6,'Командна співпраця',[
  ...meetingSet('west',-16,.3,2),...meetingSet('east',18.4,.45,3),
  hallItem('west-bean-a','beanBag',3,-18.8,.2,.9,'eds-lime'),hallItem('west-bean-b','beanBag',2,-12.8,.2,-.9,'eds-blue'),
  hallItem('east-bean-a','beanBag',1,21.4,-.8,-1,'eds-lavender'),...hallPlants(0),
 ],{'wall-38':finish(3,'#0b30c1'),'wall-13':finish(1,'#a0ff3d')}),
 hallPreset(7,'Відкриті зустрічі',[
  ...sofaNook('west',-16,.35,3),...beanPair('east',18.5,.55,3),
  hallItem('east-bench','bench',2,18.5,2.05,pi,'blue'),hallItem('east-side','sideTable',1,21.1,1.75,0,'oak'),...hallPlants(1),
 ],{'wall-38':finish(2,'#a2b8fe'),'wall-23':finish(3,'#0b30c1')}),
];
// One full-wall statement composition per furnished design. The opposite
// surfaces remain quiet; no furniture or television placement is changed.
const mural=(index:NonNullable<WallFinish['mural']>,color='#f0f0f0'):WallFinish=>({...finish(0,'#0b30c1',color),mural:index});
const meetingFinishes:Record<number,Record<string,WallFinish>>={
 1:{west:mural(7)},2:{west:mural(5)},
 3:{west:mural(8)},4:{east:mural(3)},
 5:{west:mural(2)},6:{east:mural(7)},
 7:{west:mural(4)},8:{east:mural(11)},
 9:{west:mural(16)},10:{west:mural(13)},
 11:{east:mural(9)},12:{east:mural(12)},
 13:{east:mural(14)},14:{east:mural(15)},
 15:{west:mural(10)},
};
/** Built-ins reserve a whole painted feature wall instead of placing a board
 * through the corporate logotype. This only reanchors mounted items; saved
 * user configs and all floor furniture keep their exact transforms. */
function clearStatementWall(config:SceneConfig):void {
 const statement=Object.entries(config.wallFinishes).find(([,f])=>f.mural)?.[0];
 if(!statement)return;
 const room:RoomDefinition={...ROOM,walls:ROOM.walls.map(w=>({...w,height:Math.min(w.height??ROOM.height,getPaintableBounds(w.id)?.maxY??ROOM.height),...(w.id==='west'?{max:Math.min(w.max,ROOM.obstacles[0].minZ-.04)}:{})}))};
 const quiet=statement==='west'?'east':'west';
 const pending=config.objects.filter(o=>o.wallId===statement&&getAsset(o.assetId).placement==='wall'&&o.variant>0).sort((a,b)=>(getAsset(a.assetId).category==='boards'?0:1)-(getAsset(b.assetId).category==='boards'?0:1));
 for(const object of pending){
  const [width,,depth]=getVariant(object.assetId,object.variant).dimensions;
  const original=ROOM.walls.find(w=>w.id===statement)!;
  const along=object.position[original.axis==='x'?2:0];
  let placed=false;
  // Keep working surfaces at their original useful height before trying
  // another row. All candidates use the same measured aperture validation.
  for(const height of [...new Set([object.position[1],1.65,1.75,2.3,2.7])]){
   for(const wallId of [quiet,'near','far']){
    const surface=room.walls.find(w=>w.id===wallId)!;
    const inset=width/2+.1;
    for(const center of [...new Set([along,-2.2,2.2,-1.6,1.6,0,-.8,.8,surface.min+inset,surface.max-inset])]){
     const candidate={...object,...wallAnchor(wallId,center,height,depth,room)};
     if(validatePlacement(candidate,config.objects,room).valid){Object.assign(object,candidate);placed=true;break;}
    }
    if(placed)break;
   }
   if(placed)break;
  }
  if(!placed)throw new Error(`Немає вільної тихої стіни для ${config.presetId}:${object.id}`);
 }
}
for(const config of BUILTIN_PRESETS){
 config.wallFinishes=meetingFinishes[Number(config.presetId.slice(8))]??{};
 clearStatementWall(config);
 const meeting=config.objects.filter(o=>objectRegion(o)==='meeting').map(o=>({...o,regionId:'meeting' as const}));
 config.objects=[...meeting,...JSON.parse(JSON.stringify(HALL_PRESETS[0].objects))];
}
[...BUILTIN_PRESETS,...HALL_PRESETS].forEach(deepFreeze);
export const MEETING_PRESETS=BUILTIN_PRESETS;
export function clonePreset(preset:SceneConfig|string|number):SceneConfig {const source=typeof preset==='number'?BUILTIN_PRESETS[preset]:typeof preset==='string'?[...BUILTIN_PRESETS,...HALL_PRESETS].find(p=>p.presetId===preset):preset;if(!source)throw new Error('Пресет не знайдено');return JSON.parse(JSON.stringify(source));}

