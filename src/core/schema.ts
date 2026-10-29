import {upgradeDoorLabels} from './door-labels';
import {upgradeHallDecor} from './hall-decor';
import { ASSETS, getAsset } from '../catalog/catalog';
import { DEFAULT_LAYERS, DEFAULT_WALL_FINISH, PROJECT_ID, SCHEMA_VERSION, type DesignRegionId, type RegionPresetSelection, type SceneConfig, type SceneObject, type WallFinish } from './types';
import { defaultRegionPresets, isDesignRegion, isWallId, objectRegion } from './regions';
import { originalHallTables } from './hall';
import { upgradeDoorSignage } from './door-signage';
import { normalizePlaqueLabel } from './plaque-text';
import { MAX_WALL_MURAL } from './wall-murals';

export const MAX_PRESET_BYTES = 512_000;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, fallback: string, max = 120): string { return typeof value === 'string' ? value.slice(0, max) : fallback; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1000; }
function presetId(value: unknown, fallback: string): string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : fallback; }
export interface ImportResult { config: SceneConfig; warnings: string[]; }

/** Migrations are additive. Existing object IDs/transforms and the saved global
 * snapshot identity survive the introduction of independent regional presets. */
export function migratePreset(input: unknown): unknown {
  if (!record(input)) throw new Error('Файл не містить конфігурації');
  let data = { ...input };
  if (data.schemaVersion === 0) data = {
    ...data, schemaVersion: 1, roomId: data.roomId ?? 'lounge-room-01',
    basePresetId: data.basePresetId ?? 'builtin-0', modified: true,
    doorOpen: data.doorOpen === true,
    layers: { ...DEFAULT_LAYERS, ...(record(data.layers) ? data.layers : {}) },
    objects: Array.isArray(data.objects) ? data.objects.map(o => record(o) ? { ...o, variant: o.variant ?? 1, material: o.material ?? 'oat' } : o) : [],
  };
  if (data.schemaVersion === 1) {
    const id = presetId(data.presetId, 'imported'), base = presetId(data.basePresetId, 'builtin-0');
    const selections = defaultRegionPresets(id, data.modified === true);
    selections.meeting = { presetId: id, basePresetId: base, modified: data.modified === true };
    // Preserve deliberate furniture outside the old primary room as a custom
    // hall selection instead of refreshing it away on the next site release.
    if (Array.isArray(data.objects) && data.objects.some(o => record(o) && Array.isArray(o.position) && o.position.length === 3 && o.assetId !== 'edsSignage' && objectRegion(o as unknown as SceneObject) === 'hall')) {
      selections.hall = { presetId: id, basePresetId: id, modified: true };
    }
    const objects=Array.isArray(data.objects)?[...data.objects]:[];
    const oldIds=new Set(objects.flatMap(o=>record(o)&&typeof o.id==='string'?[o.id]:[]));
    // These exact desks were previously immutable architecture rather than
    // editable scene objects. Reintroduce their semantic IDs once, without
    // replacing a user's already edited/deleted v2 source furniture.
    for(const table of originalHallTables())if(!oldIds.has(table.id))objects.push(table);
    data = { ...data, schemaVersion: SCHEMA_VERSION, objects, regionPresets: selections, wallFinishes: {} };
  }
  return data;
}

export function parseWallFinish(input: unknown): WallFinish {
  if (!record(input)) throw new Error('Некоректне оздоблення стіни');
  const color = input.color === undefined || input.color === null ? null : input.color;
  const accent = input.accent ?? DEFAULT_WALL_FINISH.accent, motif = input.motif ?? 0;
  if (color !== null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw new Error('Колір стіни має бути у форматі #RRGGBB');
  if (typeof accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('Колір мотиву має бути у форматі #RRGGBB');
  if (typeof motif !== 'number' || !Number.isInteger(motif) || motif < 0 || motif > 3) throw new Error('Невідомий корпоративний мотив стіни');
  if (input.mural !== undefined && (typeof input.mural !== 'number' || !Number.isInteger(input.mural) || input.mural < 0 || input.mural > MAX_WALL_MURAL)) throw new Error('Невідома повностінна композиція EDS');
  // Keep this field genuinely optional: older custom finishes retain their
  // original structure and do not receive a new artwork during draft loading.
  return { color: color === null ? null : color.toLowerCase(), motif: motif as WallFinish['motif'], accent: accent.toLowerCase(), ...(input.mural !== undefined ? { mural: input.mural as WallFinish['mural'] } : {}) };
}

export function parsePreset(input: string | unknown, options: { preserveIdentity?: boolean } = {}): ImportResult {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).length > MAX_PRESET_BYTES) throw new Error('Файл пресета завеликий');
    try { input = JSON.parse(input); } catch { throw new Error('Файл містить некоректний JSON'); }
  }
  const data = migratePreset(input);
  if (!record(data) || data.schemaVersion !== SCHEMA_VERSION) throw new Error('Ця версія схеми пресета поки не підтримується');
  if (data.projectId !== PROJECT_ID) throw new Error('Цей пресет належить іншому проєкту');
  if (data.roomId !== 'lounge-room-01') throw new Error('Цей пресет призначений для іншого простору');
  if (!Array.isArray(data.objects) || data.objects.length > 250) throw new Error('Некоректний список предметів');
  const ids = new Set<string>(), warnings: string[] = [], objects: SceneObject[] = [];
  for (const entry of data.objects) {
    if (!record(entry)) throw new Error('Некоректний предмет');
    const asset = ASSETS.find(a => a.id === entry.assetId);
    if (!asset) { warnings.push(`Пропущено недоступний об’єкт: ${text(entry.assetId, 'unknown')}`); continue; }
    const id = text(entry.id, '', 80);
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || ids.has(id)) throw new Error('ID предметів мають бути унікальними');
    ids.add(id);
    if (!Array.isArray(entry.position) || entry.position.length !== 3 || !entry.position.every(finite) || !finite(entry.rotation)) throw new Error('Некоректні координати предмета');
    let variant = typeof entry.variant === 'number' && Number.isInteger(entry.variant) ? entry.variant : 0;
    if (!asset.variants.some(v => v.index === variant)) { warnings.push(`Варіант ${asset.id}:${variant} недоступний; вибрано 0 / Немає`); variant = 0; }
    const material = asset.materials.find(m => m.id === entry.material)?.id ?? asset.materials[0].id;
    const wallId = isWallId(entry.wallId) ? entry.wallId : undefined;
    if (asset.placement === 'wall' && !wallId && variant > 0) { warnings.push(`${asset.label}: немає кріплення до стіни; вибрано 0 / Немає`); variant = 0; }
    const object: SceneObject = { id, assetId: asset.id, variant, material, position: [...entry.position] as SceneObject['position'], rotation: entry.rotation,
      ...(wallId ? { wallId } : {}), ...(typeof entry.label === 'string' ? { label: asset.id==='doorPlaque'?normalizePlaqueLabel(entry.label):entry.label.slice(0,120) } : {}) };
    object.regionId = isDesignRegion(entry.regionId) ? entry.regionId : objectRegion(object);
    objects.push(object);
  }
  const now = new Date().toISOString(), layers = { ...DEFAULT_LAYERS };
  if (record(data.layers)) for (const key of Object.keys(layers) as (keyof typeof layers)[]) if (typeof data.layers[key] === 'boolean') layers[key] = data.layers[key] as boolean;
  const safeDate = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : now;
  const suppliedId = presetId(data.presetId, 'imported');
  const selections = defaultRegionPresets(suppliedId, data.modified === true);
  if (record(data.regionPresets)) for (const region of ['hall', 'meeting'] as DesignRegionId[]) {
    const selection = data.regionPresets[region];
    if (!record(selection)) continue;
    const fallback = selections[region];
    selections[region] = { presetId: presetId(selection.presetId, fallback.presetId), basePresetId: presetId(selection.basePresetId, fallback.basePresetId), modified: selection.modified === true } satisfies RegionPresetSelection;
  }
  const wallFinishes: Record<string, WallFinish> = {};
  if (data.wallFinishes !== undefined) {
    if (!record(data.wallFinishes) || Object.keys(data.wallFinishes).length > 128) throw new Error('Некоректний список оздоблень стін');
    for (const [wallId, finish] of Object.entries(data.wallFinishes)) {
      if (!isWallId(wallId)) throw new Error('Невідома поверхня для оздоблення стіни');
      wallFinishes[wallId] = parseWallFinish(finish);
    }
  }
  const config: SceneConfig = {
    schemaVersion: SCHEMA_VERSION, projectId: PROJECT_ID, roomId: 'lounge-room-01',
    presetId: !options.preserveIdentity && /^(builtin-|hall-preset-)/.test(suppliedId) ? `imported-${crypto.randomUUID()}` : suppliedId,
    name: text(data.name, 'Імпортований дизайн'), createdAt: safeDate(data.createdAt), updatedAt: safeDate(data.updatedAt),
    basePresetId: presetId(data.basePresetId, 'builtin-0'), modified: options.preserveIdentity ? data.modified === true : true,
    ...(data.hallDecorRevision===1?{hallDecorRevision:1 as const}:{}),
    ...(data.doorLabelRevision===1?{doorLabelRevision:1 as const}:{}),
    objects:upgradeDoorSignage(objects), doorOpen: data.doorOpen === true, layers, regionPresets: selections, wallFinishes,
  };
  return { config:upgradeDoorLabels(upgradeHallDecor(config)), warnings };
}
export function serializePreset(config: SceneConfig): string { return JSON.stringify(parsePreset(config, { preserveIdentity: true }).config, null, 2); }
export const exportPreset = serializePreset;
export const importPreset = parsePreset;
export function validateAssetId(id: string): boolean { try { return !!getAsset(id); } catch { return false; } }

