#!/usr/bin/env python3
"""Writes art/specs/grids.json (sprite sheets cut with cut.py) and art/specs/maps.json (map repaint prompts)."""
import json
ANCHOR = '51dde4b4-df06-45db-8284-f5ba59695020'
G_HEAD = ('Sprite sheet for a premium mobile tower defense game (raccoon tinkerers versus living stars), same glossy stylized 3D cartoon style and lighting as the reference image. '
          'Fully transparent background. Exactly NINE separate objects arranged in a strict 3x3 grid (3 rows, 3 columns), each object centred in its own equal square cell, '
          'fitting well inside its cell with wide empty transparent gaps between cells, nothing touching or overlapping. ')
G_TAIL = ' No text, no numbers, no letters, no grid lines, no labels, no background.'
PROJ = 'Every object is seen from straight above (top-down) and points or flies toward the RIGHT. '
BADGE = ('Every object is a round glossy game ability button icon: a thick polished gold ring frame around a coloured circular background with one bold, simple, instantly '
         'readable symbol in the middle; all nine share the same frame style. ')
UI = 'Every object is a bold, chunky, glossy 3D game UI icon with a soft dark outline, readable at very small size, each a single object with no frame. '
grids = [
 ('sheet_proj2', PROJ + 'Row 1: (1) a shiny red metal bottle cap spinning, slightly tilted, (2) a glowing orange-and-violet magic bolt with a short sparkly trail, (3) a glowing violet arcane orb with tiny sparkles. '
  'Row 2: (4) a streaking fire bolt with a flaming tail, (5) a big blazing fireball with a flaming tail, (6) a glowing silver crescent moon shard. '
  'Row 3: (7) a small glowing teal spirit flame, (8) a tiny glowing turquoise wisp orb with a little tail, (9) a small dart with a glass vial body full of bubbling green acid.',
  ['p_feather', 'p_bolt', 'p_arcane', 'p_firebolt', 'p_fireball', 'p_star', 'p_spirit', 'p_wisp', 'p_stinger']),
 ('sheet_proj3', 'Objects 1-5 and 9 are seen from straight above and face the RIGHT. '
  'Row 1: (1) a small cute junk quadcopter drone made from a tin can with four bottle-cap rotors, seen from above, nose to the right, (2) a sleek jet-wing attack drone with a green acid tank, seen from above, nose right, (3) a big round saucer mother drone with lights, seen from above. '
  'Row 2: (4) a fiery phoenix bird with wings spread, seen from above, flying right, (5) a translucent glowing turquoise ghost raccoon spirit running to the right (side view), (6) a puddle of sticky yellow glue seen from above. '
  'Row 3: (7) a round electric tesla trap disc pad with blue sparks seen from above, (8) a small pile of shiny gold coins with a sparkle, (9) a fat yellow-and-black hazard-striped atomic bomb with a green glow, pointing right.',
  ['p_bee', 'p_wasp', 'p_queen', 'p_phoenix', 'p_foxspirit', 'p_honey', 'p_coil', 'p_loot', 'p_nuke']),
 ('sheet_ab1', BADGE + 'Symbols, row 1: (1) a spinning tornado full of nails and scrap, (2) a cracked ground shockwave with a bomb, (3) a big rocket missile. '
  'Row 2: (4) a snowflake on an icy blue background, (5) bottle caps raining down, (6) a wooden supply crate with a parachute. '
  'Row 3: (7) a roaring fire storm on red, (8) a lightning storm cloud on dark blue, (9) three small attack drones.',
  ['ab_thornado', 'ab_quake', 'ab_missileStrike', 'ab_absoluteZero', 'ab_featherStorm', 'ab_supplyDrop', 'ab_firestorm', 'ab_superstorm', 'ab_killerSwarm']),
 ('sheet_ab2', BADGE + 'Symbols, row 1: (1) a glowing overclock gear with a lightning bolt, (2) a pile of gold coins with a jackpot sparkle, (3) a yin-yang style meditation swirl on teal (no text). '
  'Row 2: (4) a satellite firing a laser beam down, (5) an exploding bright supernova star, (6) a roaring raccoon face. '
  'Row 3: (7) a ground split by an earthquake, (8) a radioactive green mushroom cloud, (9) a target crosshair on a star.',
  ['ab_royalDecree', 'ab_jackpot', 'ab_focus', 'ab_orbital', 'ab_supernova', 'ab_roar', 'ab_earthquake', 'ab_meltdown', 'ab_generic']),
 ('sheet_ui1', UI + 'Row 1: (1) a shiny gold coin with a raccoon paw print embossed, (2) a glossy red heart, (3) a silver settings gear. '
  'Row 2: (4) a green play triangle button symbol, (5) a yellow double fast-forward arrows symbol, (6) a blue pause symbol (two bars). '
  'Row 3: (7) a cosy little house (home), (8) a golden padlock, (9) a golden trophy cup.',
  ['ui_coin', 'ui_heart', 'ui_gear', 'ui_play', 'ui_fast', 'ui_pause', 'ui_home', 'ui_lock', 'ui_trophy']),
 ('sheet_ui2', UI + 'Row 1: (1) a tear-off calendar page with a star, (2) an old leather star atlas book with a star on the cover, (3) a glowing brass lantern (wisdom). '
  'Row 2: (4) a glowing purple XP star, (5) a money sack with a coin, (6) a wooden supply crate with a parachute. '
  'Row 3: (7) a pile of glittering enchanted gold coins and gems, (8) a red-and-white target crosshair, (9) a raccoon bandit eye mask.',
  ['ui_calendar', 'ui_book', 'ui_lantern', 'ui_xp', 'ui_sack', 'p_crate', 'p_lootgold', 'ui_target', 'ui_mask']),
 ('sheet_ui3', UI + 'Row 1: (1) a bronze medal with a ribbon, (2) a silver medal with a ribbon, (3) a gold medal with a ribbon. '
  'Row 2: (4) a glowing rainbow champion medal with a ribbon, (5) an eye with a glowing camo-detect lens, (6) a small golden crown. '
  'Row 3: (7) a green check mark, (8) a red X cross, (9) a blue info circle with a white i-shaped symbol drawn as a dot and a bar.',
  ['ui_medal1', 'ui_medal2', 'ui_medal3', 'ui_medal4', 'ui_camo', 'ui_crown', 'ui_check', 'ui_close', 'ui_info']),
]
out = []
for i, (sid, body, ids) in enumerate(grids):
    out.append({'sheet': sid, 'ids': ids, 'request': {'index': i, 'params': {'model': 'gpt_image_2_5', 'quality': 'high', 'resolution': '1k', 'aspect_ratio': '1:1',
        'background': 'transparent', 'medias': [{'value': ANCHOR, 'role': 'image_references'}], 'prompt': G_HEAD + body + G_TAIL}}})
json.dump(out, open('art/specs/grids.json', 'w'), indent=1)

M_HEAD = ('Repaint this flat colour layout into a finished, polished background map for a premium mobile tower defense game, in a glossy stylized 3D cartoon look '
          '(Kingdom Rush / Bloons TD 6 quality). STRICT LAYOUT RULES: keep the exact same framing and composition; the track band must stay exactly where it is with exactly '
          'the same shape and width; every coloured shape stays at the same position and size. ')
M_TAIL = (' Camera: straight top-down view. Soft warm light from the top-left with gentle shadows. Small details only on open ground, never on the track. '
          'No characters, no creatures, no text, no UI, no border, no vignette.')
maps = {
 'caverns': 'The light-brown band becomes a mine track: packed earth with wooden sleepers and a pair of old rusty mine-cart rails running along it. Purple circles become clusters of big glowing violet crystals; '
            'black circles become deep dark bottomless pits with rocky rims; grey circles become boulders; the small red dots become glowing red cave mushrooms. '
            'Theme: an underground crystal mine where raccoons dig for shinies: dark blue-purple cave floor with rocky texture, glowing crystal shards, a few lanterns on posts, wooden beams and a mine cart parked on open ground.',
 'fjord': 'The grey-blue band becomes a trampled snowy path with footprints and blue shadows. Dark green circles become snowy pine trees seen from above; the light blue ellipses become frozen ice ponds with cracks; '
          'the white dot becomes a little snowman; grey circles become snow-capped rocks. Theme: a frozen lakeside in deep winter: fluffy snow with soft blue shadows, a few small snowdrifts, a sled and a wooden fence piece on open snow.',
 'forge': 'The grey-brown band becomes a road of dark cobbled iron plates and gravel. The orange ellipses become pools of glowing molten metal with crusty edges; the small dark-brown dots become smoking steam vents; '
          'grey circles become heaps of scrap metal. Theme: a junkyard foundry at dusk: dark ash-grey ground with oil stains, scattered gears, bolts and old tyres, warm orange glow around the molten pools.',
 'candy': 'The cream band becomes a path of biscuit and wafer tiles. The two big brown circles become giant round chocolate-chip cookies; pink circles become giant swirl lollipops seen from above; '
          'small pale-pink circles become cupcakes with frosting; light green circles become gumdrops. Theme: the backyard of a sweet shop: pastel pink sugar-sand ground with sprinkles, candy wrappers and small sweets on open ground.',
 'rivers': 'The two tan bands become two worn dirt forest paths. The blue ellipses become a calm blue creek with small ripples, reeds along its banks; the grey dots between the water become stepping stones; '
           'dark green circles become round leafy trees seen from above; small green dots become bushes. Theme: a lush green forest clearing: stylized grass, clover, small flowers, a fallen log and mushrooms on open grass.',
}
json.dump({k: M_HEAD + v + M_TAIL for k, v in maps.items()}, open('art/specs/maps.json', 'w'), indent=1)
print(len(out), 'grids,', len(maps), 'maps')
