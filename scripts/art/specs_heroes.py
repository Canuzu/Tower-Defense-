#!/usr/bin/env python3
"""Writes art/specs/heroes_a.json (level-1 looks from the tower style anchor) and heroes_b.json
(level 7+ and 14+ looks referencing the level-1 job; re-run after stage A is fetched)."""
import json
jobs = json.load(open('art/jobs.json'))
ANCHOR = '51dde4b4-df06-45db-8284-f5ba59695020'
STYLE = ("Game asset for a premium mobile tower defense game: ONE single HERO character, isolated on a fully transparent background. "
 "Match the reference image exactly in art style and rendering: glossy stylized 3D cartoon, soft studio key light from the top-left, gentle rim light, "
 "subsurface fur shading, rich saturated colours, chubby raccoon proportions (big head, big shiny eyes, black bandit mask, grey fur, cream muzzle, fluffy ringed tail), "
 "same camera (three-quarter view from the front, about 40 degrees above, turned slightly to the right). The hero stands on a round cable-spool platform like the reference "
 "but painted royal purple with a polished gold rim and a small golden star emblem on the front, fully visible and centred at the bottom, same size in frame. ")
TAIL = " Heroic, charismatic, readable at small size. No text, letters or numbers, no logo, no background, no frame, nothing cropped."
A = {
 'h_nova_1': "Subject: COSMO the space bandit: a raccoon astronaut in a retro white-and-orange space suit with a clear glass bubble helmet, a small backpack with an antenna, holding a chunky retro ray-gun blaster, adventurous grin.",
 'h_grizz_1': "Subject: ROCCO the junkyard boss: a huge burly muscular raccoon (bigger and broader than normal raccoons), wearing scrap-metal shoulder armour made from a hubcap and a tank top, a giant wrench-hammer resting on the shoulder, a bottle-cap medal, confident tough smirk.",
}
B = {
 'h_nova_2': ('h_nova_1', "Level 7 upgrade of the SAME hero (same face, suit and platform): now with a rocket jetpack with small blue flames, a bigger glowing blaster, gold trims on the suit."),
 'h_nova_3': ('h_nova_1', "Level 14 LEGENDARY form of the SAME hero (same face and platform): glowing cosmic armour suit with gold and cyan lights, twin blasters, a flowing cape with stars on it, a tiny satellite orbiting the helmet."),
 'h_grizz_2': ('h_grizz_1', "Level 7 upgrade of the SAME hero (same face and platform): heavier junk armour on both shoulders and arms, the wrench-hammer now has pistons and gears."),
 'h_grizz_3': ('h_grizz_1', "Level 14 LEGENDARY form of the SAME hero (same face and platform): full shining scrap armour with gold accents, a huge glowing hydraulic hammer, a champion belt and a crown made of bottle caps."),
}
def r(i, ref, prompt):
    return {'index': i, 'params': {'model': 'gpt_image_2_5', 'quality': 'high', 'resolution': '1k', 'aspect_ratio': '1:1', 'background': 'transparent',
        'medias': [{'value': ref, 'role': 'image_references'}], 'prompt': prompt}}
json.dump({'ids': list(A), 'requests': [r(i, ANCHOR, STYLE + s + TAIL) for i, s in enumerate(A.values())]}, open('art/specs/heroes_a.json', 'w'), indent=1)
json.dump({'ids': list(B), 'requests': [r(i, jobs.get(b, 'MISSING-' + b), 'Game asset for a premium mobile tower defense game, isolated on a fully transparent background, same glossy 3D cartoon style, camera and framing as the reference. ' + s + TAIL) for i, (b, s) in enumerate(B.values())]}, open('art/specs/heroes_b.json', 'w'), indent=1)
print('ok')
