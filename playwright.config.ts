import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }], ['json',{outputFile:'test-results/latest.json'}]],
  outputDir: 'test-results/artifacts',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'chromium-desktop', use: { browserName: 'chromium', launchOptions:{args:process.platform==='win32'?['--use-angle=d3d11']:[]}, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'chromium-phone', use: { browserName: 'chromium', launchOptions:{args:process.platform==='win32'?['--use-angle=d3d11']:[]}, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'chromium-landscape', use: { browserName: 'chromium', launchOptions:{args:process.platform==='win32'?['--use-angle=d3d11']:[]}, viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'webkit-tablet', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'firefox-desktop', use: { browserName: 'firefox', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
});
