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
}

export interface LoadedSprite extends SpriteInfo {
  img: HTMLImageElement;
}

const INDEX = index as Record<string, SpriteInfo>;
const loaded = new Map<string, LoadedSprite>();

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

/** Preloads every sprite; reports progress 0..1. Missing files are skipped (procedural fallback). */
export async function loadSprites(onProgress?: (p: number) => void): Promise<void> {
  const ids = Object.keys(INDEX);
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
