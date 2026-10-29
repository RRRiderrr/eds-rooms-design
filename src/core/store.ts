import { clonePreset, HALL_PRESETS, BUILTIN_PRESETS } from '../catalog/presets';
import { getAsset, getVariant } from '../catalog/catalog';
import { findAccessorySupport } from './placement';
import { validatePlacement } from './placement';
import { getPlacementRoom } from './space';
import { rearPartitions } from '../catalog/rear-partitions';
import { hasPreviousRearPartitionLayout } from './rear-partition-revision';
import { isWallId, objectRegion, regionWallFinishes, wallRegion } from './regions';
import { parsePreset, parseWallFinish } from './schema';
import { DEFAULT_WALL_FINISH, type DesignRegionId, type LayerVisibility, type SceneConfig, type SceneObject, type SceneStoreSnapshot, type WallFinish } from './types';
import { MAX_GRAPHICS_PER_WALL, sortedWallGraphics, upgradeWallGraphics, wallGraphicFor } from './wall-graphics';

type Listener = (snapshot: SceneStoreSnapshot) => void;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const builtin = (id: string) => /^(builtin-|hall-preset-)/.test(id);

export class SceneStore {
  private current: SceneConfig;
  private undoStack: SceneConfig[] = [];
  private redoStack: SceneConfig[] = [];
  private listeners = new Set<Listener>();
  private batchStart: SceneConfig | null = null;
  private baselines = new Map<string, SceneConfig>();
  constructor(initial: SceneConfig = clonePreset(1)) {
    this.current = parsePreset(initial, { preserveIdentity: true }).config;
    this.registerBaseline(this.current);
  }
  registerBaseline(config: SceneConfig): void {
    const safe = parsePreset(config, { preserveIdentity: true }).config;
    this.baselines.set(safe.presetId, builtin(safe.presetId) ? clonePreset(safe.presetId) : copy(safe));
    for (const region of ['hall', 'meeting'] as DesignRegionId[]) {
      const selection = safe.regionPresets[region];
      if (builtin(selection.basePresetId)) {
        this.baselines.set(selection.basePresetId, clonePreset(selection.basePresetId));
      } else if (!selection.modified) {
        this.baselines.set(selection.basePresetId, copy(safe));
      }
    }
  }
  get state(): SceneConfig { return this.current; }
  get config(): SceneConfig { return this.current; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get snapshot(): SceneStoreSnapshot { return { config: this.current, canUndo: this.canUndo, canRedo: this.canRedo }; }
  /** Architecture-ready completion of additive legacy paint migration. */
  upgradeWallGraphics(): boolean {
    const next = upgradeWallGraphics(this.current);
    for (const [id,baseline] of this.baselines) this.baselines.set(id,upgradeWallGraphics(baseline));
    if (next === this.current) return false;
    this.current = next;
    this.notify();
    return true;
  }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); listener(this.snapshot); return () => this.listeners.delete(listener); }
  private notify(): void { for (const listener of this.listeners) listener(this.snapshot); }
  private history(): void {
    this.undoStack.push(copy(this.current));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }
  private change(update: (config: SceneConfig) => void, record = true, regions: DesignRegionId[] = []): void {
    if (record && !this.batchStart) this.history();
    this.current = copy(this.current);
    update(this.current);
    this.current.modified = true;
    this.current.updatedAt = new Date().toISOString();
    for (const region of regions) this.current.regionPresets[region].modified = true;
    this.notify();
  }
  beginTransaction(): void { if (!this.batchStart) this.batchStart = copy(this.current); }
  endTransaction(): void {
    if (!this.batchStart) return;
    const content = (s: SceneConfig) => JSON.stringify({ objects: s.objects, wallFinishes: s.wallFinishes, doorOpen: s.doorOpen, regionPresets: s.regionPresets });
    if (content(this.batchStart) !== content(this.current)) { this.undoStack.push(this.batchStart); this.redoStack = []; }
    this.batchStart = null;
    this.notify();
  }
  cancelTransaction(): void { if (this.batchStart) { this.current = this.batchStart; this.batchStart = null; this.notify(); } }
  applyPreset(preset: SceneConfig | string | number): void {
    const target = parsePreset(clonePreset(preset), { preserveIdentity: true }).config;
    this.history();
    this.current = target;
    this.registerBaseline(target);
    this.notify();
  }
  /** Applying a regional preset never replaces furniture, finishes or selection
   * belonging to the other region. Saved user snapshots work in either picker. */
  applyRegionPreset(region: DesignRegionId, preset: SceneConfig | string | number): void {
    const source = typeof preset === 'number' ? (region === 'hall' ? HALL_PRESETS[preset] : BUILTIN_PRESETS[preset])
      : typeof preset === 'string' ? this.baselines.get(preset) ?? [...BUILTIN_PRESETS, ...HALL_PRESETS].find(p => p.presetId === preset) : preset;
    if (!source) throw new Error('Пресет області не знайдено');
    if (typeof preset === 'string' && ((region === 'hall' && preset.startsWith('builtin-')) || (region === 'meeting' && preset.startsWith('hall-preset-')))) throw new Error('Пресет належить іншій області');
    const target = parsePreset(source, { preserveIdentity: true }).config;
    const otherObjects = this.current.objects.filter(o => objectRegion(o) !== region);
    const usedIds = new Set(otherObjects.map(o => o.id));
    const replacement = target.objects.filter(o => objectRegion(o) === region).map(object => {
      const next = { ...copy(object), regionId: region };
      // A user may have deliberately moved an old item to another region. Keep
      // that item and assign a deterministic regional ID to the incoming one.
      if (usedIds.has(next.id)) {
        let suffix = 0;
        const original = next.id;
        do { next.id = `${region}-${original}${suffix ? `-${suffix}` : ''}`; suffix++; } while (usedIds.has(next.id));
      }
      usedIds.add(next.id);
      return next;
    });
    this.history();
    this.current = copy(this.current);
    this.current.objects = [...otherObjects, ...replacement];
    this.current.wallFinishes = {
      ...Object.fromEntries(Object.entries(this.current.wallFinishes).filter(([wallId]) => wallRegion(wallId) !== region)),
      ...regionWallFinishes(target.wallFinishes, region),
    };
    const targetId = builtin(target.presetId) ? target.regionPresets[region].presetId : target.presetId;
    this.current.regionPresets[region] = { presetId: targetId, basePresetId: targetId, modified: false };
    if (region === 'meeting') this.current.doorOpen = target.doorOpen;
    this.current.modified = true;
    this.current.updatedAt = new Date().toISOString();
    this.baselines.set(targetId, copy(target));
    this.notify();
  }
  resetRegionToPreset(region: DesignRegionId): void {
    const selection = this.current.regionPresets[region];
    this.applyRegionPreset(region, this.baselines.get(selection.basePresetId) ?? selection.basePresetId);
  }
  resetToPreset(): void {
    const baseline = this.baselines.get(this.current.basePresetId) ?? this.baselines.get(this.current.presetId);
    this.applyPreset(baseline ?? this.current.basePresetId);
  }
  replace(config: SceneConfig): void { this.applyPreset(config); }
  /** Add only missing rear screens to an older/custom layout in one Undo step.
   * Existing furniture, moved screens and deliberate deletions survive reload. */
  addRearPartitions(): { added: number; rearranged?: boolean; reason?: string } {
    const selection=this.current.regionPresets.hall.presetId;
    const style=/^hall-preset-\d+$/.test(selection)?Number(selection.split('-').pop()):0;
    if(hasPreviousRearPartitionLayout(this.current.objects)){
      const previousIds=new Set([1,2,3,4].map(i=>`hall-rear-screen-${i}`));
      const replacement=rearPartitions(style).map(candidate=>{
        const previous=this.current.objects.find(o=>o.id===candidate.id)!;
        return {...copy(previous),position:candidate.position,rotation:candidate.rotation};
      });
      const combined=[...this.current.objects.filter(o=>!previousIds.has(o.id)),...replacement];
      for(const object of replacement){const result=validatePlacement(object,combined,getPlacementRoom(object));if(!result.valid)return {added:0,reason:result.reason};}
      this.change(s=>{s.objects=copy(combined);},true,['hall']);
      return {added:0,rearranged:true};
    }
    const incoming=rearPartitions(style).filter(candidate=>!this.current.objects.some(o=>o.id===candidate.id&&o.variant>0));
    if(!incoming.length)return {added:0};
    const ids=new Set(incoming.map(o=>o.id)),combined=[...this.current.objects.filter(o=>!ids.has(o.id)),...incoming];
    for(const object of incoming){const result=validatePlacement(object,combined,getPlacementRoom(object));if(!result.valid)return {added:0,reason:result.reason};}
    this.change(s=>{s.objects=[...s.objects.filter(o=>!ids.has(o.id)),...copy(incoming)];},true,['hall']);
    return {added:incoming.length};
  }
  upsert(object: SceneObject, record = true): void {
    getAsset(object.assetId);
    const previous = this.current.objects.find(o => o.id === object.id);
    const next = { ...copy(object), regionId: object.regionId ?? previous?.regionId ?? objectRegion(object) };
    const supported = previous ? this.current.objects.filter(o => o.variant > 0 && getAsset(o.assetId).collision === 'accessory' && findAccessorySupport(o, this.current.objects)?.id === object.id) : [];
    this.change(s => {
      const index = s.objects.findIndex(o => o.id === next.id);
      if (index < 0) s.objects.push(next); else s.objects[index] = next;
      if (previous) for (const original of supported) {
        const child = s.objects.find(o => o.id === original.id)!;
        child.regionId = next.regionId;
        if (next.variant === 0) { child.variant = 0; continue; }
        const angle = next.rotation - previous.rotation, c = Math.cos(angle), sn = Math.sin(angle);
        const dx = original.position[0] - previous.position[0], dz = original.position[2] - previous.position[2];
        child.position = [next.position[0] + dx * c + dz * sn, next.position[1] + getVariant(next.assetId, next.variant).dimensions[1], next.position[2] - dx * sn + dz * c];
        child.rotation = original.rotation + angle;
        if (!findAccessorySupport(child, s.objects)) child.variant = 0;
      }
    }, record, [...new Set([next.regionId, ...(previous ? [objectRegion(previous)] : [])])]);
  }
  updateObject(id: string, patch: Partial<SceneObject>, record = true): void {
    const object = this.current.objects.find(o => o.id === id);
    if (object) this.upsert({ ...object, ...patch, id: object.id }, record);
  }
  remove(id: string): void {
    const object = this.current.objects.find(o => o.id === id);
    if (!object) return;
    const supported = new Set(this.current.objects.filter(o => o.variant > 0 && getAsset(o.assetId).collision === 'accessory' && findAccessorySupport(o, this.current.objects)?.id === id).map(o => o.id));
    this.change(s => { s.objects = s.objects.filter(o => o.id !== id).map(o => supported.has(o.id) ? { ...o, variant: 0 } : o); }, true, [objectRegion(object)]);
  }
  duplicate(id: string): SceneObject | undefined {
    const source = this.current.objects.find(o => o.id === id);
    if (!source) return;
    const object = { ...copy(source), id: `${source.assetId}-${crypto.randomUUID()}`, position: [source.position[0] + .25, source.position[1], source.position[2] + .25] as SceneObject['position'] };
    if (source.assetId === 'corporateMotif' && source.wallId) {
      const room=getPlacementRoom(source),wall=room.walls.find(w=>w.id===source.wallId),graphics=sortedWallGraphics(this.current.objects,source.wallId);
      if (!wall || graphics.length>=MAX_GRAPHICS_PER_WALL) return;
      object.position=[...source.position];object.position[wall.axis==='x'?2:0]+=.25;
      object.graphic={...wallGraphicFor(source),layer:Math.min(63,Math.max(...graphics.map(o=>wallGraphicFor(o).layer))+1)};
      if (!validatePlacement(object,this.current.objects,room).valid) return;
    }
    this.upsert(object);
    return object;
  }
  reorderWallGraphic(id: string, direction: 'front' | 'back'): boolean {
    const object = this.current.objects.find(o=>o.id===id&&o.assetId==='corporateMotif'&&o.variant>0);
    if (!object?.wallId) return false;
    const ordered = sortedWallGraphics(this.current.objects,object.wallId);
    const index = ordered.findIndex(o=>o.id===id);
    if (index<0 || direction==='front'&&index===ordered.length-1 || direction==='back'&&index===0) return false;
    ordered.splice(index,1); if (direction==='front') ordered.push(object); else ordered.unshift(object);
    const layers = new Map(ordered.map((o,i)=>[o.id,i]));
    this.change(s=>{ s.objects=s.objects.map(o=>layers.has(o.id)?{...o,graphic:{...wallGraphicFor(o),layer:layers.get(o.id)!}}:o); },true,[objectRegion(object)]);
    return true;
  }
  setDoor(open: boolean): void { this.change(s => { s.doorOpen = open; }, true, ['meeting']); }
  setLayers(patch: Partial<LayerVisibility>): void { this.change(s => { s.layers = { ...s.layers, ...patch }; }, false); }
  setWallFinish(wallId: string, patch: Partial<WallFinish>): void {
    if (!isWallId(wallId)) throw new Error('Невідома поверхня для оздоблення стіни');
    const finish = parseWallFinish({ ...DEFAULT_WALL_FINISH, ...this.current.wallFinishes[wallId], ...patch });
    this.change(s => {
      s.wallFinishes[wallId] = finish;
      const upgraded = upgradeWallGraphics(s);
      s.objects = upgraded.objects; s.wallFinishes = upgraded.wallFinishes;
    }, true, [wallRegion(wallId)]);
  }
  clearWallFinish(wallId: string): void {
    if (!isWallId(wallId)) throw new Error('Невідома поверхня для оздоблення стіни');
    if (!this.current.wallFinishes[wallId]) return;
    this.change(s => { delete s.wallFinishes[wallId]; }, true, [wallRegion(wallId)]);
  }
  resetWallFinishes(region?: DesignRegionId): void {
    this.change(s => { s.wallFinishes = region ? Object.fromEntries(Object.entries(s.wallFinishes).filter(([id]) => wallRegion(id) !== region)) : {}; }, true, region ? [region] : ['hall', 'meeting']);
  }
  markSaved(config: SceneConfig): void {
    this.current = { ...parsePreset(config, { preserveIdentity: true }).config, basePresetId: config.presetId, modified: false };
    this.current.regionPresets = {
      hall: { presetId: config.presetId, basePresetId: config.presetId, modified: false },
      meeting: { presetId: config.presetId, basePresetId: config.presetId, modified: false },
    };
    this.baselines.set(config.presetId, copy(this.current));
    this.notify();
  }
  undo(): void { const previous = this.undoStack.pop(); if (previous) { this.redoStack.push(copy(this.current)); this.current = previous; this.notify(); } }
  redo(): void { const next = this.redoStack.pop(); if (next) { this.undoStack.push(copy(this.current)); this.current = next; this.notify(); } }
}

