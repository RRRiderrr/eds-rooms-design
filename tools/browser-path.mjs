import {existsSync} from 'node:fs';
const localCache='E:/ArchViz_Resources/tools/playwright';
if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&existsSync(localCache))process.env.PLAYWRIGHT_BROWSERS_PATH=localCache;
