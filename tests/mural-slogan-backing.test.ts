import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('EDS wall compositions after removing the slogans',()=>{
 it('does not leave the coloured backing rectangles behind removed words',()=>{
  const removed:Record<number,string[]>={
   1:['x="1870" y="700" width="1010" height="150"','x="2540" y="2090" width="1395" height="130"'],
   2:['x="275" y="2040" width="1540" height="165"'],
   3:['x="2310" y="1940" width="1500" height="190"'],
  };
  for(const [id,rectangles] of Object.entries(removed)){
   const svg=readFileSync(new URL(`../public/assets/brand/murals/mural-${id}.svg`,import.meta.url),'utf8');
   for(const rectangle of rectangles)expect(svg).not.toContain(rectangle);
   expect(svg).not.toMatch(/<text\b/i);
   // The composition still embeds the exact EDS wordmark artwork.
   const wordmark=readFileSync(new URL('../public/assets/brand/eds-wordmark-original.svg',import.meta.url),'utf8');
   expect(svg).toContain(wordmark.match(/viewBox="([^"]+)"/)![0]);
  }
 });
});
