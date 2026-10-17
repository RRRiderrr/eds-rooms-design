import './browser-path.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Exercise the already built static preview. This runner never builds, changes
// dist, starts an extra dev server, or overwrites the main regression reports.
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const urlArg=args.find(arg=>arg.startsWith('--url=')),baseURL=urlArg?urlArg.slice(6):'http://127.0.0.1:4174';
const list=args.includes('--list'),all=args.includes('--all'),forward=args.filter(arg=>!arg.startsWith('--url=')&&arg!=='--all');
if(!list){
  let response;try{response=await fetch(baseURL);}catch{throw new Error(`Start the final production preview at ${baseURL} before reviewing enhancements. This tool does not rebuild it.`);}
  if(!response.ok)throw new Error(`Preview HTTP ${response.status} at ${baseURL}`);
}
const reportRoot=path.join(root,'test-results','enhancements');await mkdir(reportRoot,{recursive:true});
const configPath=path.join(reportRoot,'review.config.ts');
const settings={testDir:path.join(root,'tests','e2e'),testMatch:'enhancements.spec.ts',outputDir:path.join(reportRoot,'artifacts'),baseURL,html:path.join(reportRoot,'report'),json:path.join(reportRoot,'latest.json')};
await writeFile(configPath,`import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';
const settings=${JSON.stringify(settings)};
export default defineConfig({...base,testDir:settings.testDir,testMatch:settings.testMatch,outputDir:settings.outputDir,webServer:undefined,use:{...base.use,baseURL:settings.baseURL},reporter:[['list'],['html',{open:'never',outputFolder:settings.html}],['json',{outputFile:settings.json}]]});
`);
const projects=all||forward.some(arg=>arg.startsWith('--project'))?[]:['--project=chromium-desktop','--project=chromium-phone','--project=chromium-landscape'];
const child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','--config',configPath,...projects,...forward],{cwd:root,env:process.env,stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
