/**
 * Soft hyphens for the long words in tier, skill and bond texts. CSS `hyphens: auto` needs the
 * browser's hyphenation dictionary, which some builds (desktop Chromium on Linux/Windows) do not
 * ship; there a long compound broke at a random letter ("Drohnenhanga|r"). With U+00AD at the
 * compound joints every browser breaks there and shows a hyphen; nothing changes when the word fits.
 */

// '-' marks the break points (lower case; the word's own casing is kept)
const WORDS = `
angriffs-tempo ban-di-ten-bank blech-split-ter blitz-ab-lei-ter bom-ben-tep-pich boss-scha-den doppel-laser
drei-fach-laser doppel-schuss drachen-atem drachen-hort drei-fach-schuss drohnen-angriff drohnen-hangar
drohnen-legion drohnen-pilot drohnen-schwarm druck-punkte durch-boh-ren-de durch-schlag durch-schlag-mu-ni-tion
eis-split-ter er-leuch-tung er-schüt-te-rung ex-plo-sio-nen ex-plo-sions-ra-di-us ex-plo-sions-scha-den
feuer-drohnen fins-ter-nis-se fokus-trai-ning frost-im-mu-ni-tät furcht-er-re-gen-de geister-könig geister-rudel
geister-schwarm geister-sicht glet-scher-kern glücks-brin-ger greif-kralle groß-meis-ter halb-auto-ma-tik
hammer-schlag hammer-schläge han-dels-zen-trum har-pu-nen-wurf hoch-span-nung inferno-fürst jagd-ra-ke-ten
kampf-ge-brüll kern-schmel-ze ketten-streu-ung ko-me-ten-bre-cher ko-me-ten-grei-fer ko-me-ten-kna-cker
käl-te-ein-bruch kühl-schrank laser-visier la-ter-nen-feuer la-ter-nen-wache luft-un-ter-stüt-zung
meis-ter-schüt-ze mengen-rabatt mikro-bomben mond-ko-los-se mond-split-ter mond-strah-len mutter-drohne
mutter-schiff nacht-sicht-bril-le nebel-sterne or-bi-tal-schlag or-bi-tal-schlä-ge panzer-bre-cher plasma-fusion
quer-schlä-ger ra-ke-ten-wer-fer rasier-split-ter scharf-schüt-ze schatz-grä-ber schatz-hau-fen schatz-radar
schatz-wache schleu-de-rer schnee-ge-stö-ber schnee-sturm schnell-feuer schnell-zie-her schrau-ben-schlüs-sel
schrott-nado schrott-platz schwarm-geist se-kun-den-kle-ber spar-schwein split-ter-fä-cher split-ter-ge-wit-ter
split-ter-knall staf-fel-tempo strah-len-pis-to-le streu-bom-ben streu-schuss supra-lei-ter säure-pfei-le
tausch-han-del thermo-schock tief-küh-lung ti-ta-nen-tö-ter todes-drohnen un-er-reich-te ver-hee-ren-de
ver-lang-sa-mung ver-nich-ten-de ver-stär-kung voll-tref-fer welt-raum-ban-dit wär-me-bild-ka-me-ra
zer-quetscht zer-split-tern ziel-er-fas-sung ziel-su-chen-de ziel-su-chen-den auto-ma-tisch durch-drin-gen
durch-schlägt ein-ge-sam-melt ein-schla-gen elek-tri-sche ex-plo-die-ren schnel-le-rer schnel-le-res
aus-ein-an-der-ste-hen un-auf-halt-sa-mes ver-drei-facht ver-lang-samt vor-bei-kom-men-de zer-sprin-gen zu-rück-schie-ben
an-ni-hi-lat-ing en-light-en-ment su-per-con-duc-tor auto-mat-ically har-vest-guard light-ning-rod
`;

const SHY = '\u00ad';
const DICT = new Map<string, number[]>();
for (const w of WORDS.split(/\s+/)) {
  if (!w) continue;
  const cuts: number[] = [];
  let n = 0;
  for (const ch of w) {
    if (ch === '-') cuts.push(n);
    else n++;
  }
  DICT.set(w.replace(/-/g, ''), cuts);
}

/** `text` with soft hyphens in the long words the dictionary knows (other words stay as they are). */
export function softHyphens(text: string): string {
  return text.replace(/[A-Za-zÄÖÜäöüß]{10,}/g, (word) => {
    const cuts = DICT.get(word.toLowerCase());
    if (!cuts) return word;
    let out = '';
    let last = 0;
    for (const c of cuts) {
      out += word.slice(last, c) + SHY;
      last = c;
    }
    return out + word.slice(last);
  });
}
