// Maps made in the map editor (ui/editor.ts), kept on this device: pick one
// in Match setup → Customise → Map, host it in an online room, or open a map
// file a friend sent. No public gallery: maps only travel between people who
// chose to swap them.

const KEY = 'tardigeddon.maps';
/** How many maps are kept. */
export const KEEP_MAPS = 12;

export interface MyMap {
  name: string;
  /** A terrain/custom.ts map string. */
  map: string;
  at: number;
}

/** A light check that it looks like a custom map (the sim checks it properly), without loading the game. */
const MAP_SHAPE = /^\d{3,4}x\d{3,4}:[0-9a-z.]+$/;

export function looksLikeMyMap(v: unknown): v is MyMap {
  const m = v as MyMap;
  return !!m && typeof m === 'object' && typeof m.name === 'string' && m.name.length > 0 && m.name.length <= 24 && typeof m.map === 'string' && m.map.length <= 80_000 && MAP_SHAPE.test(m.map) && typeof m.at === 'number';
}

export function myMaps(): MyMap[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(looksLikeMyMap) : [];
  } catch {
    return [];
  }
}

function store(list: MyMap[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Save (replacing a map of the same name); the newest first. False if the device is out of room. */
export function saveMyMap(m: MyMap): boolean {
  return store([m, ...myMaps().filter((x) => x.name !== m.name)].slice(0, KEEP_MAPS));
}

export function deleteMyMap(name: string): void {
  store(myMaps().filter((m) => m.name !== name));
}

/** The saved map with this map string, if any (to show its name). */
export function myMapNamed(map: string): MyMap | undefined {
  return myMaps().find((m) => m.map === map);
}
