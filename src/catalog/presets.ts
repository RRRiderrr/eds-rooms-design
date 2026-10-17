import { DEFAULT_LAYERS, PROJECT_ID, type SceneConfig, type SceneObject } from '../core/types';
import { getAsset, getVariant } from './catalog';
import { wallAnchor } from '../core/placement';
import { hallSigns } from './hall-signs';
import { ROOM } from '../core/room';
const date='2026-10-16T00:00:00.000Z';
const pi=Math.PI;
function item(id:string,assetId:string,variant:number,x:number,z:number,rotation=0,material?:string,y=0):SceneObject { return {id,assetId,variant,material:material??getAsset(assetId).materials[0].id,position:[x,y,z],rotation}; }
function wall(id:string,assetId:string,variant:number,wallId:string,along:number,height:number,material?:string):SceneObject { return {...item(id,assetId,variant,0,0,0,material),...wallAnchor(wallId,along,height,getVariant(assetId,variant).dimensions[2])}; }
function common(style:number):SceneObject[] {return [wall('ProjectBoard','board',style%3+1,'east',.65,1.65),wall('AcousticEast','acousticPanel',style%3+1,'east',-1.2,1.65,style%2?'graphite':'sage'),wall('Artwork','art',style%3+1,'near',-1.15,1.65),wall('RoomClock','clock',style%2+1,'near',.55,2.3,'black'),wall('AcousticWest','acousticPanel',style%3+1,'west',1.25,1.75,style%2?'oat':'blue')];}
function preset(index:number,name:string,objects:SceneObject[]):SceneConfig {return {schemaVersion:1,projectId:PROJECT_ID,roomId:'lounge-room-01',presetId:`builtin-${index}`,name:`${index}: ${name}`,createdAt:date,updatedAt:date,basePresetId:`builtin-${index}`,modified:false,objects:[...objects,...hallSigns()],doorOpen:false,layers:{...DEFAULT_LAYERS}};}
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
BUILTIN_PRESETS.forEach(deepFreeze);
export function clonePreset(preset:SceneConfig|string|number):SceneConfig {const source=typeof preset==='number'?BUILTIN_PRESETS[preset]:typeof preset==='string'?BUILTIN_PRESETS.find(p=>p.presetId===preset):preset;if(!source)throw new Error('Пресет не знайдено');return JSON.parse(JSON.stringify(source));}

