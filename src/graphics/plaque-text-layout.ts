import {normalizePlaqueLabel} from '../core/plaque-text';

interface PlaqueTextLayout {lines:string[];fontSize:number;lineHeight:number;}
type Measure=(text:string,fontSize:number)=>number;

/** Explicit blank lines stay in the layout. A long word can wrap at a Unicode
 * code point, while ordinary lines wrap at spaces. The stored text is intact. */
function wrapParagraph(paragraph:string,fontSize:number,width:number,measure:Measure):string[] {
 if(!paragraph)return [''];
 const remaining=[...paragraph],lines:string[]=[];
 let line='',space=-1;
 while(remaining.length){
  const character=remaining.shift()!;
  if(line&&measure(line+character,fontSize)>width){
   if(space>0){
    lines.push(line.slice(0,space).trimEnd());
    remaining.unshift(...[...line.slice(space+1)],character);
   }else{lines.push(line);remaining.unshift(character);}
   line='';space=-1;
   while(remaining[0]===' ')remaining.shift();
  }else{line+=character;if(character===' ')space=line.length-1;}
 }
 lines.push(line);
 return lines;
}

/** Fits every paragraph into the real print rectangle; no fixed line cap and
 * no hidden brand header/footer displacing the user's text. */
export function layoutPlaqueText(value:string,width:number,height:number,measure:Measure):PlaqueTextLayout {
 const paragraphs=normalizePlaqueLabel(value).split('\n');
 let fontSize=/^\d{1,3}$/.test(value)?220:128;
 for(let attempt=0;attempt<100;attempt++){
  const lines=paragraphs.flatMap(paragraph=>wrapParagraph(paragraph,fontSize,width,measure)),lineHeight=fontSize*1.18;
  if(lines.length*lineHeight<=height&&lines.every(line=>measure(line,fontSize)<=width+.001))return {lines,fontSize,lineHeight};
  fontSize*=.91;
 }
 const fontSizeFallback=height/Math.max(1,paragraphs.length)/1.18;
 const lines=paragraphs.flatMap(paragraph=>wrapParagraph(paragraph,fontSizeFallback,width,measure));
 return {lines,fontSize:Math.min(fontSizeFallback,height/lines.length/1.18),lineHeight:height/lines.length};
}
