import { DE } from './de';

export type Lang = 'en' | 'de';
export type LangSetting = 'auto' | Lang;

let lang: Lang = 'en';

export function detectLang(): Lang {
  const l = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en';
  return l.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function setLang(s: LangSetting) {
  lang = s === 'auto' ? detectLang() : s;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return lang;
}

/**
 * Game terms that many strings share. A `{frenzy}` in any string (English source or German) is
 * filled with the translation of 'FRENZY', so the meter's name lives in exactly one entry.
 */
export const TERMS: Record<string, string> = { frenzy: 'FRENZY' };

/** Translate an English source string (gettext-style). `{key}` placeholders are filled from params. */
export function t(s: string, params?: Record<string, string | number>): string {
  let out = lang === 'de' ? DE[s] ?? s : s;
  if (params) for (const k in params) out = out.split('{' + k + '}').join(String(params[k]));
  if (out.includes('{')) for (const k in TERMS) out = out.split('{' + k + '}').join(lang === 'de' ? DE[TERMS[k]] ?? TERMS[k] : TERMS[k]);
  return out;
}
