import './browser-path.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Run against an existing static deployment. No build, server, repository write,
// scene export or GitHub operation is performed by this tool.
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node tools/check-deployment-interactions.mjs [--url=https://host/project/] [--landscape]');
  process.exit(0);
}
const unknown = args.filter(arg => !arg.startsWith('--url=') && arg !== '--landscape');
if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(' ')}`);
const base = new URL(args.find(arg => arg.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:4174/');
assert(['http:', 'https:'].includes(base.protocol), 'The deployment URL must use HTTP or HTTPS.');
base.hash = '';
if (!base.pathname.endsWith('/') && !base.pathname.endsWith('.html')) base.pathname += '/';
const editorURL = new URL(base);
editorURL.searchParams.set('mode', 'editor');
// Never use page.goto('/'): it would silently discard a GitHub Pages subpath.
const root = path.resolve(import.meta.dirname, '..');
const reportRoot = path.join(root, 'test-results', 'deployment-interactions');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(reportRoot, runId);
await mkdir(output, { recursive: true });
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), baseURL: base.href,
  editorURL: editorURL.href, status: 'running', preflight: {}, profiles: [] };
let browser;
const message = error => error instanceof Error ? error.stack || error.message : String(error);
const state = page => page.evaluate(() => window.__ROOM_ATELIER__.store.state);
const preview = page => page.evaluate(() => window.__ROOM_ATELIER__.view.getLibraryPlacement());
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function library(page, category) {
  if (await page.evaluate(() => matchMedia('(pointer:coarse)').matches && !document.querySelector('.atelier').classList.contains('drawer-open'))) {
    await page.locator('.mobile-dock [data-action="drawer"]').click();
  }
  await page.getByTestId('library-tab').click();
  if (category) await page.getByRole('button', { name: category, exact: true }).click();
}

async function preset(page, index) {
  await library(page);
  await page.getByTestId('preset-select').selectOption(`builtin-${index}`);
  await expect.poll(async () => (await state(page)).presetId).toBe(`builtin-${index}`);
  await settle(page);
}

async function mode(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__ROOM_ATELIER__.getMode())).toBe(name.toLowerCase());
  await settle(page);
}

async function editorCamera(page) {
  await page.evaluate(() => {
    const view = window.__ROOM_ATELIER__.view;
    view.camera.position.set(4.8, 7, -6);
    view.controls.target.set(0, .25, 0);
    view.controls.update();
  });
  await settle(page);
}

async function project(page, point) {
  const result = await page.evaluate(point => {
    const view = window.__ROOM_ATELIER__.view;
    view.camera.updateMatrixWorld();
    const p = view.camera.position.clone().set(...point).project(view.camera);
    const r = view.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height,
      inside: p.z >= -1 && p.z <= 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
  }, point);
  assert(result.inside, `World target ${point.join(',')} must be inside the visible canvas.`);
  return result;
}

async function startMouse(page, assetId = 'sofa') {
  const card = page.getByTestId(`add-${assetId}`);
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  assert(box, `Missing library card: ${assetId}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 9, box.y + box.height / 2, { steps: 2 });
  await expect(page.getByTestId('library-drag-label')).toBeVisible();
}

async function cleanPreview(page) {
  assert.equal(await preview(page), null, 'No library placement must remain active.');
  await expect(page.getByTestId('library-drag-label')).toHaveCount(0);
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('library-placing')), false);
  assert.equal(await page.evaluate(() => !!window.__ROOM_ATELIER__.view.scene.getObjectByName('Library_Placement_Preview')), false);
}

function assertEmpty(config) {
  assert.equal(config.objects.length, 5, 'Preset 0 contains only the five fixed hall signs.');
  assert(config.objects.every(o => o.assetId === 'edsSignage' && o.wallId === 'wall-38'));
  assert.deepEqual(config.objects.map(o => o.variant).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
}

async function runProfile(name, options, exercise) {
  const result = { name, viewport: options.viewport, status: 'running', steps: [], screenshots: [],
    consoleErrors: [], pageErrors: [], httpErrors: [], requestFailures: [], warnings: [] };
  report.profiles.push(result);
  const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  let auditing = true;
  page.on('pageerror', error => { if (auditing) result.pageErrors.push(message(error)); });
  page.on('console', event => {
    if (!auditing) return;
    if (event.type() === 'error') result.consoleErrors.push(event.text());
    else if (event.type() === 'warning') result.warnings.push(event.text());
  });
  page.on('response', response => {
    if (auditing && response.status() >= 400) result.httpErrors.push({ status: response.status(), url: response.url() });
  });
  page.on('requestfailed', request => {
    if (auditing) result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  const screenshot = async label => {
    const file = `${name}-${label}.png`;
    await page.screenshot({ path: path.join(output, file) });
    result.screenshots.push(file);
  };
  const step = async (label, fn) => {
    const started = Date.now();
    try {
      const evidence = await fn();
      result.steps.push({ name: label, status: 'passed', durationMs: Date.now() - started, evidence });
      console.log(`PASS ${name}: ${label}`);
    } catch (error) {
      result.steps.push({ name: label, status: 'failed', durationMs: Date.now() - started, error: message(error) });
      throw error;
    }
  };
  try {
    await step('Compiled deployment boots in Editor', async () => {
      const response = await page.goto(editorURL.href, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `Entry document HTTP ${response?.status()}`);
      await page.waitForFunction(() => window.__ROOM_ATELIER__?.ready === true, undefined, { timeout: 120_000 });
      await expect(page.locator('canvas')).toBeVisible();
      await expect(page.locator('.limited, .fallback-notice')).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.__ROOM_ATELIER__.getMode()), 'editor');
      assert.equal(new URL(page.url()).pathname, editorURL.pathname, 'Navigation must retain the deployment subpath.');
      await page.locator('[data-property="quality"]').selectOption('medium');
      return { url: page.url(), title: await page.title() };
    });
    await exercise({ page, result, step, screenshot });
    await step('No HTTP, console, runtime or network failures', async () => {
      await settle(page);
      assert.deepEqual(result.consoleErrors, [], 'console.error must remain empty.');
      assert.deepEqual(result.pageErrors, [], 'Uncaught browser errors must remain empty.');
      assert.deepEqual(result.httpErrors, [], 'No requested resource may return HTTP 4xx/5xx.');
      assert.deepEqual(result.requestFailures, [], 'No resource request may fail.');
      return await page.evaluate(() => {
        const view = window.__ROOM_ATELIER__.view;
        return { canvas: [view.renderer.domElement.width, view.renderer.domElement.height],
          drawCalls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles,
          geometries: view.renderer.info.memory.geometries, textures: view.renderer.info.memory.textures };
      });
    });
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed';
    result.error = message(error);
    console.error(`FAIL ${name}: ${message(error)}`);
    await screenshot('failure').catch(() => {});
    result.failedState = await state(page).catch(() => null);
  } finally {
    // Closing a context deliberately aborts pending requests; do not confuse
    // browser teardown with an application network error.
    auditing = false;
    await context.close();
  }
}

async function desktop({ page, step, screenshot }) {
  await step('Preset 0 remains empty apart from five unique hall signs', async () => {
    await preset(page, 0);
    assertEmpty(await state(page));
    await editorCamera(page);
    await screenshot('preset-0-editor');
  });
  await step('Preset 6 has its furnished layout and 85-inch wall TV', async () => {
    await preset(page, 6);
    const config = await state(page), tv = config.objects.find(o => o.assetId === 'television');
    assert(config.objects.filter(o => o.wallId !== 'wall-38' && o.variant > 0).length >= 12);
    assert(tv, 'Preset 6 must contain its wall TV.');
    assert.equal(tv.variant, 3);
    assert.equal(tv.wallId, 'near');
    await editorCamera(page);
    await screenshot('preset-6-editor');
    return { objects: config.objects.length, television: tv };
  });
  await step('ArchViz loads production TV and returns to Editor', async () => {
    await mode(page, 'ArchViz');
    await page.waitForFunction(() => {
      const { view, store } = window.__ROOM_ATELIER__;
      return view.environmentReady === true && store.state.objects.filter(o => o.variant > 0).every(object => {
        const visual = view.visuals.get(object.id);
        return visual?.mode === 'archviz' && !visual.disposed && visual.root.children.some(child => child.type === 'Group');
      });
    }, undefined, { timeout: 120_000 });
    const tv = await page.evaluate(() => {
      const { store, view } = window.__ROOM_ATELIER__;
      const object = store.state.objects.find(o => o.assetId === 'television');
      const visual = view.visuals.get(object.id);
      let meshes = 0;
      visual.root.traverse(child => { if (child.isMesh && child.visible) meshes++; });
      view.camera.position.set(-1, 1.45, .25);
      view.controls.target.set(...object.position);
      view.camera.lookAt(view.controls.target);
      view.navigation.syncFromCamera();
      return { id: object.id, meshes, productionLoaded: visual.root.children.some(child => child.type === 'Group') };
    });
    assert(tv.meshes > 0 && tv.productionLoaded, 'Production television must have real visible meshes.');
    await settle(page);
    await screenshot('preset-6-archviz-tv');
    await mode(page, 'Editor');
    assert.equal((await state(page)).presetId, 'builtin-6');
    await mode(page, 'ArchViz');
    return tv;
  });
  await step('Door button animates the actual leaf open and closed', async () => {
    assert.equal((await state(page)).doorOpen, false);
    await page.getByTestId('door').click();
    await expect.poll(async () => (await state(page)).doorOpen).toBe(true);
    await page.waitForFunction(() => {
      const a = window.__ROOM_ATELIER__.view.architecture;
      return !!a.door && Math.abs(a.door.rotation.y - a.manifest.door.openAngle) < .025;
    });
    const openAngle = await page.evaluate(() => window.__ROOM_ATELIER__.view.architecture.door.rotation.y);
    await page.getByTestId('door').click();
    await expect.poll(async () => (await state(page)).doorOpen).toBe(false);
    await page.waitForFunction(() => {
      const a = window.__ROOM_ATELIER__.view.architecture;
      return Math.abs(a.door.rotation.y - a.manifest.door.closedAngle) < .025;
    });
    return { openAngle };
  });
  await step('A real pointer click on the closed door opens its leaf', async () => {
    await preset(page, 0);
    const target = await page.evaluate(() => {
      const view = window.__ROOM_ATELIER__.view, door = view.architecture.manifest.door;
      const h = door.hinge;
      view.camera.position.set(h[0] - 1.2, 1.65, h[2] + 1.8);
      view.controls.target.set(h[0] + door.width * .5, door.height * .48, h[2]);
      view.camera.lookAt(view.controls.target);
      view.navigation.syncFromCamera();
      return view.controls.target.toArray();
    });
    await settle(page);
    const point = await project(page, target);
    await page.mouse.click(point.x, point.y);
    await expect.poll(async () => (await state(page)).doorOpen).toBe(true);
    await page.waitForFunction(() => {
      const a = window.__ROOM_ATELIER__.view.architecture;
      return Math.abs(a.door.rotation.y - a.manifest.door.openAngle) < .025;
    });
    await screenshot('door-open-pointer');
    await mode(page, 'Editor');
    await preset(page, 0);
    await editorCamera(page);
  });
  await step('Actual card drag previews at the chosen floor position, commits once and supports Undo', async () => {
    await library(page, 'Дивани та крісла');
    const before = (await state(page)).objects.length;
    await startMouse(page);
    const first = await project(page, [-.73, 0, -.48]);
    await page.mouse.move(first.x, first.y, { steps: 8 });
    await expect.poll(async () => (await preview(page))?.valid).toBe(true);
    assert.equal((await state(page)).objects.length, before, 'Pointer movement must not mutate the configuration.');
    assert(Math.abs((await preview(page)).object.position[0] + .75) < .001);
    const target = await project(page, [-.47, 0, .27]);
    await page.mouse.move(target.x, target.y, { steps: 5 });
    await expect.poll(async () => (await preview(page))?.object?.position[2]).toBe(.25);
    await screenshot('mouse-floor-preview');
    await page.mouse.up();
    await expect.poll(async () => (await state(page)).objects.length).toBe(before + 1);
    await settle(page);
    const sofas = (await state(page)).objects.filter(o => o.assetId === 'sofa');
    assert.equal(sofas.length, 1, 'Drag release must not also trigger click-to-add.');
    assert.deepEqual(sofas[0].position.map(n => Math.round(n * 1000) / 1000), [-.5, 0, .25]);
    await cleanPreview(page);
    await screenshot('mouse-floor-committed');
    await page.getByTestId('undo').click();
    assertEmpty(await state(page));
    return { placedPosition: sofas[0].position };
  });
  await step('Escape and invalid release discard previews without adding furniture', async () => {
    await library(page, 'Дивани та крісла');
    const before = (await state(page)).objects.length;
    await startMouse(page);
    const target = await project(page, [-.5, 0, -.25]);
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await expect.poll(async () => (await preview(page))?.valid).toBe(true);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal((await state(page)).objects.length, before);
    await cleanPreview(page);
    await startMouse(page);
    const invalid = await project(page, [2.35, 0, 2.7]);
    await page.mouse.move(invalid.x, invalid.y, { steps: 6 });
    await expect.poll(async () => (await preview(page))?.valid).toBe(false);
    await expect(page.getByTestId('library-drag-label')).toHaveAttribute('data-valid', 'false');
    await screenshot('mouse-invalid-preview');
    await page.mouse.up();
    assert.equal((await state(page)).objects.length, before);
    await cleanPreview(page);
  });
}

async function phone({ page, step, screenshot }) {
  await preset(page, 0);
  await editorCamera(page);
  await library(page, 'Дивани та крісла');
  const before = (await state(page)).objects.length;
  const session = await page.context().newCDPSession(page);
  try {
    await step('Native touch scroll on the card body does not add furniture', async () => {
      const card = page.getByTestId('add-sofa');
      await card.scrollIntoViewIfNeeded();
      const initial = await page.locator('#panel-content').evaluate(el => el.scrollTop);
      const box = await card.boundingBox(), panel = await page.locator('#panel-content').boundingBox();
      assert(box && panel);
      const x = box.x + box.width / 2, y = Math.max(panel.y + 15, Math.min(panel.y + panel.height - 15, box.y + 45));
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (let i = 1; i <= 6; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 16, id: 1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => page.locator('#panel-content').evaluate(el => el.scrollTop)).toBeGreaterThan(initial);
      assert.equal((await state(page)).objects.length, before);
      await cleanPreview(page);
      await screenshot('touch-catalog-scrolled');
      return { initialScroll: initial, finalScroll: await page.locator('#panel-content').evaluate(el => el.scrollTop) };
    });
    await step('Native touch grip drags a live preview and commits only on release', async () => {
      const card = page.getByTestId('add-sofa');
      await page.locator('#panel-content').evaluate(el => { el.scrollTop = 0; });
      await card.scrollIntoViewIfNeeded();
      const box = await card.locator('[data-drag-handle]').boundingBox();
      assert(box);
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 10, y, id: 2 }] });
      await expect(page.getByTestId('library-drag-label')).toBeVisible();
      // The mobile drawer moves out of the way while the pointer remains held.
      await page.waitForTimeout(300);
      const target = await project(page, [-.5, 0, -.25]);
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x, y: target.y, id: 2 }] });
      await expect.poll(async () => (await preview(page))?.valid).toBe(true);
      assert.equal((await state(page)).objects.length, before);
      await screenshot('touch-floor-preview');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => (await state(page)).objects.length).toBe(before + 1);
      assert.equal((await state(page)).objects.filter(o => o.assetId === 'sofa').length, 1);
      await cleanPreview(page);
      await screenshot('touch-floor-committed');
    });
  } finally { await session.detach(); }
}

try {
  const response = await fetch(base, { signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `Deployment entry HTTP ${response.status}: ${base.href}`);
  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => new URL(match[1], base).href);
  assert(scripts.length > 0, 'Deployment index must reference a compiled JavaScript entry.');
  assert(!scripts.some(url => /\/src\/|\.tsx?(?:$|\?)/.test(url)), 'This URL serves source files rather than the built dist. Publish the compiled dist artifact.');
  assert(scripts.some(url => /\.js(?:$|\?)/.test(url)), 'Compiled .js entry is missing.');
  report.preflight = { status: response.status, scripts };
  browser = await chromium.launch({ headless: true, args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] });
  report.browserVersion = browser.version();
  await runProfile('desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, desktop);
  await runProfile('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, phone);
  if (args.includes('--landscape')) await runProfile('phone-landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, phone);
  report.status = report.profiles.every(profile => profile.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  report.status = 'failed';
  report.error = message(error);
  console.error(message(error));
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  report.stats = { profiles: report.profiles.length, passed: report.profiles.flatMap(p => p.steps).filter(s => s.status === 'passed').length,
    failed: report.profiles.flatMap(p => p.steps).filter(s => s.status === 'failed').length,
    httpErrors: report.profiles.reduce((n, p) => n + p.httpErrors.length, 0),
    consoleErrors: report.profiles.reduce((n, p) => n + p.consoleErrors.length + p.pageErrors.length, 0) };
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Deployment interactions</title><style>body{font:15px system-ui;background:#f3f5f4;color:#23312a;max-width:1180px;margin:auto;padding:32px}h1{font-size:28px}.passed{color:#147741}.failed{color:#b32b32}article{background:white;padding:20px;margin:20px 0;border-radius:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#e9eeeb;padding:12px}img{width:100%;max-width:560px;vertical-align:top;margin:8px 8px 0 0;border:1px solid #ccd6cf}li{margin:8px 0}a{color:#17664b}</style><h1>Deployment interactions: <span class="${escape(report.status)}">${escape(report.status)}</span></h1><p><a href="${escape(base.href)}">${escape(base.href)}</a></p><p>${escape(report.startedAt)} · ${escape(JSON.stringify(report.stats))}</p>${report.error ? `<pre>${escape(report.error)}</pre>` : ''}${report.profiles.map(p => `<article><h2>${escape(p.name)}: <span class="${escape(p.status)}">${escape(p.status)}</span></h2><ul>${p.steps.map(s => `<li class="${escape(s.status)}">${escape(s.status)} — ${escape(s.name)} (${s.durationMs} ms)${s.error ? `<pre>${escape(s.error)}</pre>` : ''}</li>`).join('')}</ul>${p.error ? `<pre>${escape(p.error)}</pre>` : ''}<details><summary>Browser diagnostics</summary><pre>${escape(JSON.stringify({ consoleErrors: p.consoleErrors, pageErrors: p.pageErrors, httpErrors: p.httpErrors, requestFailures: p.requestFailures, warnings: p.warnings }, null, 2))}</pre></details>${p.screenshots.map(file => `<a href="${escape(file)}"><img src="${escape(file)}" alt="${escape(file)}"></a>`).join('')}</article>`).join('')}`;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile(path.join(output, 'report.html'), html, 'utf8');
  await writeFile(path.join(reportRoot, 'latest.json'), JSON.stringify({ ...report, reportPath: path.join(output, 'report.html') }, null, 2) + '\n', 'utf8');
  await writeFile(path.join(reportRoot, 'index.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./${runId}/report.html"><a href="./${runId}/report.html">Latest deployment interactions report</a>`, 'utf8');
  console.log(`${report.status.toUpperCase()}: ${report.stats.passed} checks passed, ${report.stats.failed} failed; ${report.stats.httpErrors} HTTP errors, ${report.stats.consoleErrors} console/runtime errors.\nReport: ${path.join(output, 'report.html')}`);
  if (report.status !== 'passed') process.exitCode = 1;
}
