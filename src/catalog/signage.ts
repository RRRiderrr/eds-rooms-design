import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import tracedData from '../../assets-src/signage/signage-data.json';

/** Photo-matched, layered wall objects. Local XY is the wall plane; +Z faces the room. */
export const SIGNAGE_MODELS = [
  { id: 'eds-timeline', name: 'EDS · Хронологія', dimensions: [1.68, 1.82, .035] },
  { id: 'eds-corporate', name: 'EDS · Структура групи', dimensions: [3.30, 1.72, .025] },
  { id: 'eds-world-map', name: 'Дерев’яна карта світу', dimensions: [3.20, 1.84, .028] },
  { id: 'eds-sales-plan', name: 'EDS · План продажів', dimensions: [3.00, 1.25, .040] },
  { id: 'eds-ukraine', name: 'Україна · Відвантаження', dimensions: [3.20, 1.32, .040] },
  { id: 'eds-logo', name: 'EDS · Об’ємний логотип', dimensions: [1.45, .455, .075] },
] as const;
export type SignageModel = typeof SIGNAGE_MODELS[number]['id'];
type Contour = { outer: number[][]; holes: number[][][]; area: number; layer?: number };
type MapTrace = { imageSize: number[]; bounds: number[]; shapes: Contour[]; reliefPieces: Contour[]; printUri: string };
type Glyph = { advance: number; commands: (string | number)[][] };
type Font = { capHeight: number; glyphs: Record<string, Glyph> };
const data = tracedData as unknown as { maps: Record<string, MapTrace>; logo: { bounds: number[]; shapes: Contour[] }; fonts: Record<string, Font> };

function makeShape(contour: Contour, point: (p: number[]) => THREE.Vector2): THREE.Shape {
  const shape = new THREE.Shape(contour.outer.map(point));
  for (const hole of contour.holes) shape.holes.push(new THREE.Path(hole.map(point)));
  return shape;
}

/** Synchronous and renderer-independent, so the very same geometry is exportable in Node. */
export function createSignageObject(model: SignageModel | string, proxy = false, printGeometry = false): THREE.Group {
  const definition = SIGNAGE_MODELS.find(entry => entry.id === model);
  if (!definition) throw new Error(`Unknown signage model: ${model}`);
  const group = new THREE.Group();
  group.name = model;
  group.userData = { assetId: model, model, sourcePbr: true, photoMatched: true, placement: 'wall', mode: proxy ? 'editor' : 'archviz' };
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function standard(name: string, color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ name, color, roughness, metalness, side: THREE.DoubleSide });
    material.userData = { surface: metalness > .2 ? 'metal' : 'plastic', partColor: color, colorVariant: name, sourcePbr: true, preserveOriginal: true };
    return material;
  }
  const ink = standard('sign-print-black', proxy ? '#354550' : '#202326', .82);
  const orange = standard('eds-orange', '#f17435', .54);
  const aluminum = standard('anodized-aluminum', '#9da5a8', .36, .78);
  const letters = standard('brushed-metal-letters', '#747b7f', .34, .85);
  const charcoal = standard('graphite-logo', '#34383b', .48, .6);
  const wood = standard('map-natural-plywood-edge', '#946d47', .72);
  wood.userData.surface = 'wood';
  const acrylic: THREE.Material = proxy ? standard('acrylic-proxy', '#b5d1d4', .8) : new THREE.MeshPhysicalMaterial({
    name: 'clear-acrylic', color: '#eff9f8', roughness: .09, metalness: 0, transmission: .36,
    transparent: true, opacity: .19, clearcoat: 1, clearcoatRoughness: .06, ior: 1.49, thickness: .003,
    depthWrite: false, side: THREE.DoubleSide,
  });
  acrylic.userData = { surface: 'glass', partColor: '#eff9f8', colorVariant: 'clear-acrylic', sourcePbr: true, preserveOriginal: true };
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rz = 0): void {
    geometry.rotateZ(rz); geometry.translate(x, y, z);
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.clearGroups();
    const list = batches.get(material) ?? []; list.push(geometry); batches.set(material, list);
  }
  function box(width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material): void {
    add(new THREE.BoxGeometry(width, height, depth), material, x, y, z);
  }
  function text(value: string, x: number, y: number, cap: number, material = ink, opts: { maxWidth?: number; align?: 'left' | 'center' | 'right'; depth?: number; rotation?: number; regular?: boolean; z?: number } = {}): void {
    const font = data.fonts[opts.regular ? 'regular' : 'bold'];
    const naturalScale = cap / font.capHeight;
    const advance = [...value].reduce((sum, character) => sum + (font.glyphs[character]?.advance ?? .3), 0);
    const scale = Math.min(naturalScale, opts.maxWidth ? opts.maxWidth / Math.max(.001, advance) : naturalScale);
    const offset = opts.align === 'center' ? -advance * scale / 2 : opts.align === 'right' ? -advance * scale : 0;
    if (proxy) {
      // Small printed text is a line in the editor; silhouettes and physical
      // mounting parts stay accurate without tessellating thousands of glyphs.
      add(new THREE.BoxGeometry(Math.max(.005, advance * scale), cap * .68, .001), material,
        x + (offset + advance * scale / 2) * Math.cos(opts.rotation ?? 0) - cap * .35 * Math.sin(opts.rotation ?? 0),
        y + (offset + advance * scale / 2) * Math.sin(opts.rotation ?? 0) + cap * .35 * Math.cos(opts.rotation ?? 0), opts.z ?? .016, opts.rotation ?? 0);
      return;
    }
    const shapes: THREE.Shape[] = []; let cursor = 0;
    for (const character of value) {
      const glyph = font.glyphs[character];
      if (!glyph) { cursor += .3; continue; }
      const path = new THREE.ShapePath();
      for (const command of glyph.commands) {
        const c = command as [string, ...number[]]; const p = (index: number) => (c[index] as number);
        if (c[0] === 'M') path.moveTo((cursor + p(1)) * scale + offset, p(2) * scale);
        else if (c[0] === 'L') path.lineTo((cursor + p(1)) * scale + offset, p(2) * scale);
        else if (c[0] === 'Q') path.quadraticCurveTo((cursor + p(1)) * scale + offset, p(2) * scale, (cursor + p(3)) * scale + offset, p(4) * scale);
        else if (c[0] === 'C') path.bezierCurveTo((cursor + p(1)) * scale + offset, p(2) * scale, (cursor + p(3)) * scale + offset, p(4) * scale, (cursor + p(5)) * scale + offset, p(6) * scale);
        else if (c[0] === 'Z') path.currentPath?.closePath();
      }
      shapes.push(...path.toShapes(false)); cursor += glyph.advance;
    }
    if (!shapes.length) return;
    const segments = cap < .025 ? 2 : 5;
    const geometry = opts.depth ? new THREE.ExtrudeGeometry(shapes, { depth: opts.depth, bevelEnabled: false, curveSegments: segments }) : new THREE.ShapeGeometry(shapes, segments);
    add(geometry, material, x, y, opts.z ?? .016, opts.rotation ?? 0);
  }
  function rail(x: number, y: number, width: number, depth = .026): void {
    box(width, .014, depth, x, y, depth / 2, aluminum);
    if (!proxy) box(width, .004, .007, x, y - .007, depth + .002, aluminum);
  }
  function card(x: number, y: number, width: number, height: number, value: string, cap = .076): void {
    box(width - .002, height, .003, x, y, .017, acrylic);
    if (!proxy) text(value, x, y - cap / 2, cap, ink, { align: 'center', maxWidth: width * .88, z: .019 });
  }
  function line(x1: number, y1: number, x2: number, y2: number, width = .005, material = ink): void {
    const length = Math.hypot(x2 - x1, y2 - y1); const angle = Math.atan2(y2 - y1, x2 - x1);
    add(new THREE.BoxGeometry(length, width, .002), material, (x1 + x2) / 2, (y1 + y2) / 2, .009, angle);
  }
  function arc(x: number, y: number, radius: number, start: number, end: number, material = ink, width = .005): void {
    const shape = new THREE.Shape(); const count = proxy ? 16 : 36;
    for (let i = 0; i <= count; i++) { const a = start + (end - start) * i / count; const px = Math.cos(a) * (radius + width / 2), py = Math.sin(a) * (radius + width / 2); if (!i) shape.moveTo(px, py); else shape.lineTo(px, py); }
    for (let i = count; i >= 0; i--) { const a = start + (end - start) * i / count; shape.lineTo(Math.cos(a) * (radius - width / 2), Math.sin(a) * (radius - width / 2)); }
    shape.closePath(); add(new THREE.ExtrudeGeometry(shape, { depth: .0025, bevelEnabled: false }), material, x, y, .009);
  }
  function map(key: 'world' | 'ukraine', x: number, y: number, width: number, height: number): void {
    const traced = data.maps[key]; const [minX, minY, maxX, maxY] = traced.bounds;
    const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
    const point = (p: number[]) => new THREE.Vector2((p[0] - (minX + maxX) / 2) * scale, ((minY + maxY) / 2 - p[1]) * scale);
    const printed = proxy ? wood : standard(`${key}-printed-wood-top`, '#ffffff', .74);
    printed.userData = { ...printed.userData, surface: 'wood', printUri: traced.printUri, sourcePbr: true, preserveOriginal: true };
    function piece(contour: Contour, baseZ: number, depth: number): void {
      const shape = makeShape(contour, point); const extruded = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 3 });
      const position = extruded.getAttribute('position'), uv = extruded.getAttribute('uv');
      for (let i = 0; i < position.count; i++) {
        const sourceX = position.getX(i) / scale + (minX + maxX) / 2;
        const sourceY = (minY + maxY) / 2 - position.getY(i) / scale;
        uv.setXY(i, sourceX / traced.imageSize[0], 1 - sourceY / traced.imageSize[1]);
      }
      // Split caps and edges before batching; a flat photo is never applied to the sides.
      const nonIndexed = extruded.index ? extruded.toNonIndexed() : extruded;
      for (const geometryGroup of extruded.groups) {
        const part = new THREE.BufferGeometry();
        for (const attribute of ['position', 'normal', 'uv']) {
          const source = nonIndexed.getAttribute(attribute); const values = new Float32Array(geometryGroup.count * source.itemSize);
          for (let i = 0; i < geometryGroup.count; i++) for (let j = 0; j < source.itemSize; j++) values[i * source.itemSize + j] = source.getComponent(geometryGroup.start + i, j);
          part.setAttribute(attribute, new THREE.BufferAttribute(values, source.itemSize));
        }
        add(part, geometryGroup.materialIndex === 0 ? printed : wood, x, y, baseZ);
      }
      if (nonIndexed !== extruded) nonIndexed.dispose(); extruded.dispose();
    }
    for (const contour of traced.shapes) {
      if (proxy && contour.area < 600) continue;
      const simplified = proxy ? { ...contour, outer: contour.outer.filter((_point, i) => i % Math.max(1, Math.ceil(contour.outer.length / 48)) === 0), holes: [] } : contour;
      piece(simplified, .003, .010);
    }
    if (!proxy) for (const contour of traced.reliefPieces) piece(contour, .0128, .0025 + (contour.layer ?? 0) * .0021);
  }
  function logo(x: number, y: number, width: number, height: number, depth: number, material = charcoal, bevel = .0015): void {
    const [minX, minY, maxX, maxY] = data.logo.bounds;
    const point = (p: number[]) => new THREE.Vector2((p[0] - (minX + maxX) / 2) / (maxX - minX) * width, ((minY + maxY) / 2 - p[1]) / (maxY - minY) * height);
    function smoothPath(points: number[][], target: THREE.Path): void {
      const vectors = points.map(point), last = vectors[vectors.length - 1], first = vectors[0];
      target.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
      for (let i = 0; i < vectors.length; i++) {
        const previous = vectors[(i + vectors.length - 1) % vectors.length], current = vectors[i], next = vectors[(i + 1) % vectors.length];
        const incoming = current.clone().sub(previous).normalize(), outgoing = next.clone().sub(current).normalize();
        const mid = current.clone().add(next).multiplyScalar(.5);
        if (incoming.dot(outgoing) > .73) target.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
        else { target.lineTo(current.x, current.y); target.lineTo(mid.x, mid.y); }
      }
      target.closePath();
    }
    for (const contour of data.logo.shapes) {
      const shape = new THREE.Shape(); smoothPath(contour.outer, shape);
      for (const hole of contour.holes) { const path = new THREE.Path(); smoothPath(hole, path); shape.holes.push(path); }
      add(new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: !proxy && bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: proxy ? 2 : 8 }), material, x, y, bevel);
    }
  }

  if (model === 'eds-logo') {
    logo(0, 0, 1.447, .452, .075);
  } else if (model === 'eds-world-map') {
    map('world', 0, 0, 3.20, 1.84);
  } else if (model === 'eds-ukraine') {
    map('ukraine', -.79, -.02, 1.59, 1.17);
    const labelX = .20;
    text('ВІДВАНТАЖЕНО, од.', labelX, .53, .056, letters, { maxWidth: 1.38, depth: .0035 });
    const labels = ['КТП', 'БЛОК ВРП', 'РЗіА', 'MVC (КСО)', 'ВРП X-LINE', 'ВРШ POWERLINE', 'ГРЩ STREEMLINE'];
    const values = ['563', '380', '1420', '3211', '652', '473', '145'];
    const top = .37, step = .143, right = 1.58, railWidth = .55;
    for (let i = 0; i <= labels.length; i++) rail(right - railWidth / 2, top + .071 - i * step, railWidth);
    for (let i = 0; i < labels.length; i++) {
      const yy = top - i * step;
      text(labels[i], labelX, yy - .035, .056, letters, { maxWidth: .71, depth: .0035 });
      const cw = .078, total = cw * values[i].length;
      for (let j = 0; j < values[i].length; j++) card(right - total + (j + .5) * cw, yy, cw, .126, values[i][j], .086);
    }
  } else if (model === 'eds-sales-plan') {
    const left = -1.48, header = .079;
    for (const [lineValue, yy] of [
      ['ПЛАН ПРОДАЖІВ НА', .50], ['ПОТОЧНИЙ РІК, грн', .39],
      ['ПРОДАНО У ПОТОЧНОМУ', .13], ['РОЦІ, грн', .02],
      ['ВІДСОТОК ВИКОНАННЯ ПЛАНУ', -.25],
      ['ВІДВАНТАЖЕНО ОБЛАДНАННЯ', -.48], ['У ПОТОЧНОМУ РОЦІ, од.', -.59],
    ] as const) text(lineValue, left, yy, header, letters, { maxWidth: 1.83, depth: .004 });
    const rx = 1.01, rw = .95;
    for (const yy of [.58, .425, .27, .10, -.07, -.24, -.41, -.58]) rail(rx, yy, rw, .032);
    function numberRow(value: string, y: number, label: string): void {
      const cw = .102;
      for (let i = 0; i < value.length; i++) card(rx - .31 + (i + .5) * cw, y, cw, .139, value[i], .092);
      card(rx + .278, y, .39, .139, 'млн', .092);
      if (!proxy) text(label, rx + .27, y - .058, .023, ink, { align: 'center', maxWidth: .35, z: .020 });
    }
    numberRow('1200', .502, 'EDS-POWER'); numberRow('400', .347, 'EDS-TRANSFORMER');
    card(rx + .30, -.155, .25, .151, '+%', .095);
  } else if (model === 'eds-corporate') {
    text('ІНФРАСТРУКТУРА КРАЇНИ СВІТОВОГО РІВНЯ', 0, .76, .065, letters, { align: 'center', maxWidth: 2.58, depth: .0035 });
    text('ЕЛЕКТРОЕНЕРГЕТИКА, ДОРОГИ, БУДІВЛІ', 0, .64, .065, letters, { align: 'center', maxWidth: 2.58, depth: .0035 });
    const center = [.15, -.19], nodes: [string, number, number, number][] = [
      ['Engineering', -1.10, .22, .18], ['Project', .07, .40, .135], ['Logistic', .39, .20, .117],
      ['Development', 1.30, .26, .18], ['Infratech', .64, -.19, .12], ['Power', 1.03, -.66, .14],
      ['Construction', .39, -.66, .177], ['Service', -.06, -.64, .132],
    ];
    for (const [label, x, y, radius] of nodes) {
      const dx = x - center[0], dy = y - center[1], distance = Math.hypot(dx, dy), ux = dx / distance, uy = dy / distance;
      line(center[0] + ux * .16, center[1] + uy * .16, x - ux * radius, y - uy * radius, .005);
      arc(x, y, radius, .2, 5.75, ink, .005); arc(x, y, radius + .029, 1.05, 4.65, letters, .005);
      text(label, x, y - .008, label === 'Construction' ? .033 : .037, orange, { align: 'center', maxWidth: radius * 1.78, z: .014, depth: .0015 });
    }
    arc(center[0], center[1], .162, 0, 5.92, ink, .006); arc(center[0], center[1], .183, -.75, 4.95, orange, .006);
    logo(center[0], center[1] + .016, .259, .080, .004, orange, 0);
    // QR fragments are the actual photographed black ink outlines, not invented links.
    const qrTrace = (tracedData as unknown as { corporateQRTrace?: { bounds: number[]; shapes: Contour[]; node: string }[] }).corporateQRTrace ?? [];
    for (const qr of proxy ? [] : qrTrace) {
      const node = qr.node === 'EDS' ? ['EDS', center[0], center[1], .16] : nodes.find(n => n[0] === qr.node);
      if (!node) continue;
      const qx = Number(node[1]), qy = Number(node[2]) - .075, size = .065;
      const [x0, y0, x1, y1] = qr.bounds;
      for (const contour of qr.shapes) {
        const point = (p: number[]) => new THREE.Vector2((p[0] - (x0 + x1) / 2) / (x1 - x0) * size, ((y0 + y1) / 2 - p[1]) / (y1 - y0) * size);
        add(new THREE.ShapeGeometry(makeShape(contour, point), 2), ink, qx, qy, .015);
      }
    }
    const legend = [
      'До складу енергетичної', 'групи EDS Ukraine входять:',
      '#EDS_Development - девелопер', '#EDS_Project - проектно-дизайнерська компанія',
      '#EDS_Engineering - EPC - контрактор в енергетичній сфері',
      '#EDS_Power - виробник енергетичного обладнання', '#EDS_Service - сервіс об’єктів енергетики',
      '#EDS_Construction - будівельний провайдер', '#EDS_Logistic - транспортно-логістична компанія',
      '#EDS_Infratech - провайдер з будівництва доріг',
    ];
    for (let i = 0; i < legend.length; i++) text(legend[i], -1.65, -.11 - i * .070, i < 2 ? .033 : .029, ink, { maxWidth: 1.53 });
  } else if (model === 'eds-timeline') {
    const cols = 3, rows = 5, width = 1.68, height = 1.82, cw = width / cols, ch = height / rows;
    for (let r = 0; r <= rows; r++) rail(0, height / 2 - r * ch, width, .032);
    const years = ['2009', '2010', '2011–2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2023', '2024', '2024', '2025', '2025'];
    const history: string[][] = [
      ['Заснований будівельний', 'напрямок групи EDS'],
      ['Засновані енергетична та', 'інжинірингова ланки групи EDS'],
      ['Становлення групи EDS та початок співпраці з такими', 'великими гравцями ринку, як: ДТЕК, МХП, мережа', 'АТБ, ІНТЕРПАЙП, Українська залізниця.'],
      ['Зібрана перша одиниця', 'електрощитового обладнання', 'торгової марки EDS.'],
      ['Вхід групи EDS в бізнес', 'відновлюваної енергетики.'],
      ['Утворено нову ланку, що займається орендою', 'спеціальної техніки – EDS-LOGISTIC.', 'Сумарний обсяг виробництва електрощитового', 'обладнання досяг 1500 одиниць.', 'Побудована і запущена перша промислова', 'сонячна електростанція «Сан Енерджі» 2 МВт', 'у м. Підгородне, Дніпропетровська область.', 'EDS-ENGINEERING став учасником', 'Дніпропетровської торгово-промислової палати.'],
      ['Започатковано новий напрямок діяльності –', 'EDS-DEVELOPMENT.', 'Річний обсяг побудованих групою EDS об’єктів', 'ВДЕ (відновлювані джерела енергії) досяг 40 МВт.'],
      ['Вихід на ринок вітрової енергетики та укладання', 'першого міжнародного контракту з іспанським', 'системним інвестором PowerChina.', 'EDS-PROJECT посів 1-е місце рейтингу', 'проектувальників СЕС за версією GetMarket.', 'Річний оборот EDS перевищив 1 млрд грн.', 'Група EDS отримала вищий рівень сертифікації', 'EPC-контракторів від Укргазбанку.'],
      ['Реалізовано наймасштабніший проект групи –', 'високовольтну електричну підстанцію', 'ЦПС 330/35 кВ «Наддніпрянська»', 'для Запорізької ВЕС потужністю 500 МВт.', 'Збільшено виробничо-логістичний хаб', 'EDS-POWER, що спеціалізується на створенні', 'сучасного електрощитового обладнання.'],
      ['Група EDS вийшла на новий рівень розвитку.', 'В рамках діяльності напряму EUROSPACE', 'здаються в оренду інвестиційні промислові', 'та офісні об’єкти, що суттєво розширює', 'спектр діяльності компанії.'],
      ['Розширено діяльність нового напрямку –', 'EDS-DEVELOPMENT. Створено концептуальні', 'рішення у сфері енергозабезпечення', 'та зарядної інфраструктури.'],
      ['Успішно реалізовано масштабний проект –', 'магістральний водогін р. Інгулець –', 'Південне водосховище для забезпечення водою', 'Криворізького району.', 'Побудовано три високовольтні підстанції 35/6 кВ.', 'Створено насосне та технологічне обладнання', 'на трьох насосних станціях.', 'Проведено комплексні випробування', 'та створено спеціальні електроустановки.'],
      ['Розпочато виробництво комерційних', 'швидкісних зарядних станцій для електромобілів.', 'Засновано Благодійний фонд «EDS», діяльність', 'якого спрямована на підтримку українських', 'військових, розвиток освіти та допомогу громадам.'],
      ['Велика зелена подія у країні швидких зарядів:', 'станція національного виробництва потужністю', '360 кВт – EDS CHARGERS Q 360.', 'Разом із НТУ «Дніпровська політехніка»', 'запущено сучасну R&D-лабораторію – простір,', 'де студенти вже з перших курсів долучаються', 'до реальних енергетичних проектів.'],
      ['Відкриваємо електроенергетичну Нову сторінку,', 'нова енергія, нові вектори руху – це такі основні', 'цінності: Енергія Людей. Сталість.'],
    ];
    for (let i = 0; i < years.length; i++) {
      const col = i % cols, row = Math.floor(i / cols), x = -width / 2 + (col + .5) * cw, y = height / 2 - (row + .5) * ch;
      box(cw - .004, ch - .017, .003, x, y, .019, acrylic);
      if (proxy || !printGeometry) continue;
      text(years[i], x - cw / 2 + .090, y - .145, years[i].length > 4 ? .062 : .087, ink, { rotation: Math.PI / 2, maxWidth: ch - .050, z: .021 });
      const body = history[i], bodyX = x - cw / 2 + .126, maxW = cw - .140;
      const cap = i < 2 || i === 3 || i === 4 ? .023 : .013;
      const lineHeight = cap * 1.38, top = y + (body.length - 1) * lineHeight / 2 - cap * .45;
      for (let j = 0; j < body.length; j++) text(body[j], bodyX, top - j * lineHeight, cap, ink, { maxWidth: maxW, regular: true, z: .021 });
      if (i === 14) {
        logo(x + .01, y + .102, .18, .055, .001, charcoal, 0);
        for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
          const px = x + .15 + col * .022, py = y + .101 - row * .025;
          box(.009, .0025, .001, px, py, .022, ink); box(.0025, .009, .001, px, py, .022, ink);
        }
      }
    }
    if (!proxy && !printGeometry) {
      const printed = standard('timeline-vector-ink-atlas', '#ffffff', .84);
      printed.alphaTest = .3;
      printed.userData = { ...printed.userData, printUri: 'assets/signage/timeline-ink.png', sourcePbr: true, inkPrint: true, preserveOriginal: true };
      add(new THREE.PlaneGeometry(width, height), printed, 0, 0, .0212);
    }
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error(`Cannot merge signage material ${material.name}`);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `${model}/${material.name}`;
    geometry.translate(0, 0, -definition.dimensions[2] / 2);
    mesh.castShadow = !proxy && material !== acrylic && !material.userData.inkPrint; mesh.receiveShadow = !proxy;
    mesh.userData = { assetId: model, sourcePbr: true, part: material.name, printUri: material.userData.printUri };
    group.add(mesh); geometries.forEach(source => source.dispose());
  }
  return group;
}
