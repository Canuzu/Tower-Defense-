import index from './sprites.json';

/** Metadata for one processed sprite (see scripts/process_art.py). */
export interface SpriteInfo {
  file: string;
  w: number;
  h: number;
  /** anchor in 0..1 of the image (default: centre-bottom = feet) */
  ax: number;
  ay: number;
  /** towers/heroes: spool platform width as a fraction of w (the renderer scales by it) */
  foot?: number;
  /** stars: body diameter as a fraction of max(w, h) (default 1) */
  body?: number;
  /** extended maps (mx_): rows of the image (fractions of h) where the 1600x900 world starts and ends */
  wy?: number[];
}

export interface LoadedSprite extends SpriteInfo {
  img: HTMLImageElement;
}

const INDEX = index as Record<string, SpriteInfo>;
const loaded = new Map<string, LoadedSprite>();
let version = 0;

/**
 * Big sprites that are not preloaded at boot but fetched on demand (requestSprite) and dropped again
 * (releaseSprite): the extended map paintings, of which only the current map's is needed.
 */
const onDemand = (id: string) => id.startsWith('mx_');
const pending = new Map<string, HTMLImageElement>();

/** Bumped whenever a sprite finishes loading (lets lookups memoize safely). */
export function spritesVersion(): number {
  return version;
}

export function hasSprite(id: string): boolean {
  return loaded.has(id);
}

export function getSprite(id: string): LoadedSprite | null {
  return loaded.get(id) ?? null;
}

/** First existing sprite from a list of candidate ids (most specific first). */
export function pickSprite(ids: string[]): LoadedSprite | null {
  for (const id of ids) {
    const s = loaded.get(id);
    if (s) return s;
  }
  return null;
}

export function spriteIds(): string[] {
  return Object.keys(INDEX);
}

/**
 * On-demand sprite: returns it once loaded and decoded, otherwise starts loading it (once) and returns
 * null; spritesVersion() bumps when it arrives. Ids missing from the index always return null.
 */
export function requestSprite(id: string): LoadedSprite | null {
  const s = loaded.get(id);
  if (s || pending.has(id)) return s ?? null;
  const info = INDEX[id];
  if (!info) return null;
  const img = new Image();
  img.decoding = 'async';
  pending.set(id, img);
  const done = (ok: boolean) => {
    if (pending.get(id) !== img) return; // released meanwhile
    pending.delete(id);
    if (!ok) return;
    loaded.set(id, { ...info, img });
    version++;
  };
  img.onload = () => {
    // decode off the main thread before the first drawImage needs it
    if (typeof img.decode === 'function') img.decode().then(() => done(true), () => done(true));
    else done(true);
  };
  img.onerror = () => done(false);
  img.src = (import.meta.env.BASE_URL || './') + info.file;
  return null;
}

/** Forget an on-demand sprite (and cancel its download) so its decoded pixels can be freed. */
export function releaseSprite(id: string): void {
  const p = pending.get(id);
  if (p) {
    pending.delete(id);
    p.src = '';
  }
  if (loaded.delete(id)) version++;
}

/** Preloads every sprite except the on-demand ones; reports progress 0..1. Missing files are skipped (procedural fallback). */
export async function loadSprites(onProgress?: (p: number) => void): Promise<void> {
  const ids = Object.keys(INDEX).filter((id) => !onDemand(id));
  let done = 0;
  await Promise.all(
    ids.map(
      (id) =>
        new Promise<void>((resolve) => {
          const info = INDEX[id];
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => {
            loaded.set(id, { ...info, img });
            version++;
            done++;
            onProgress?.(done / ids.length);
            resolve();
          };
          img.onerror = () => {
            done++;
            onProgress?.(done / ids.length);
            resolve();
          };
          img.src = (import.meta.env.BASE_URL || './') + info.file;
        }),
    ),
  );
}
