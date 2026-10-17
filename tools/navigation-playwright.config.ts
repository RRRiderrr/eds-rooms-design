import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 testDir:'../tests/e2e',testMatch:'navigation.spec.ts',workers:1,retries:0,
 outputDir:'../test-results/navigation',reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:5186',browserName:'chromium',viewport:{width:1280,height:800},
  launchOptions:{args:process.platform==='win32'?['--use-angle=d3d11']:[]}},
 webServer:{cwd:fileURLToPath(new URL('../',import.meta.url)),command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5186 --strictPort',url:'http://127.0.0.1:5186',reuseExistingServer:true},
});
