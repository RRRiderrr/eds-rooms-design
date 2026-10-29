import './browser-path.mjs';
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
const source=await fs.readFile('C:/Users/kakuc/Downloads/Telegram Desktop/EDS_RGB_design_elements (2).svg','utf8');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();await page.setContent(source.replace(/<\?xml[^>]+\?>/,''));
console.log(JSON.stringify(await page.locator('svg').evaluate(svg=>[...svg.children].filter(e=>e.tagName.toLowerCase()==='g').map((group,index)=>{const b=group.getBBox();return{index,x:b.x,y:b.y,width:b.width,height:b.height,elements:group.children.length,preview:group.outerHTML.slice(0,150)};})),null,2));
await browser.close();
