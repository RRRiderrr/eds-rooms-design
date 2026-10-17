import './browser-path.mjs';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test',...process.argv.slice(2)],{cwd:root,env:process.env,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1;});
