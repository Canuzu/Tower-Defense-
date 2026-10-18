#!/usr/bin/env python3
"""Writes art/specs/enemies_a.json (base looks, referencing the star style anchor) and
art/specs/enemies_b.json (damage states + fortified variants, referencing each base look; the
job ids are filled in from art/jobs.json, so run it again after stage A is fetched)."""
import json, os
jobs = json.load(open('art/jobs.json'))
ANCHOR = '0bdeb34a-50f9-434f-86b5-4d0575ea0141'
HEAD = ('Game asset for a premium mobile tower defense game: ONE single enemy character, isolated on a fully transparent background. '
        'Match the reference image exactly in art style: glossy stylized 3D cartoon, glowing translucent faceted crystal look with crisp specular '
        'highlights and small sparkles, big expressive cartoon face with shiny black eyes and thick eyebrows, viewed from the front and slightly above, '
        'chunky readable silhouette, only a faint soft glow hugging the edges (no wide halo, no fog). ')
TAIL = ' Centred in the frame with some margin, nothing cropped. No text, letters or numbers, no background, no frame.'
A = {
 'e_blue': 'Subject: an ORANGE five-pointed star (same shape and size as the reference), glowing warm orange from inside, annoyed face with one raised eyebrow.',
 'e_green': 'Subject: a YELLOW five-pointed star (same shape as the reference), glowing golden yellow, smug sneering face.',
 'e_yellow': 'Subject: a WHITE five-pointed star (same shape as the reference), pearly white crystal with a warm white-gold glow, excited racing grin with tongue out, eyes narrowed with speed.',
 'e_black': 'Subject: a small BLACK HOLE star: five-pointed star of dark obsidian crystal with a glowing purple swirling vortex spiral in its belly, glowing violet eyes, smug smirk.',
 'e_white': 'Subject: an ICE STAR: five-pointed star of frosted translucent pale-cyan ice with a crust of frost and small icicles hanging from the lower points, cold smug half-closed eyes.',
 'e_purple': 'Subject: a NEBULA star: five-pointed translucent star filled with swirling violet and magenta cosmic nebula gas and tiny stars inside, dreamy mischievous grin.',
 'e_zebra': 'Subject: an ECLIPSE star: five-pointed star split vertically down the middle: the left half is dark obsidian with a purple vortex glow, the right half is frosted icy pale-cyan crystal; determined frown.',
 'e_lead': 'Subject: a METEOR star: a five-pointed star encased in heavy rough grey iron-rock armour plates with rivets and rocky texture, glowing orange cracks between the plates, tough scowling face on the armour.',
 'e_rainbow': 'Subject: an AURORA star: five-pointed prismatic crystal star with shimmering rainbow aurora bands (red, orange, yellow, green, blue, violet) flowing across it, gleeful laughing face.',
 'e_ceramic': 'Subject: a DIAMOND star: a bigger chunky five-pointed star with a thick clear faceted diamond outer shell; through the diamond a glowing rainbow star core is visible; confident cocky face.',
 'e_golden': 'Subject: a LUCKY STAR: polished shiny GOLD five-pointed star with glinting highlights and a few tiny sparkles around it, cheeky winking happy face.',
 'e_moab': 'Subject: BOSS "Comet": a big round icy-blue comet head (frozen rocky ice sphere with crystal spikes) with a large angry face, and a short flowing blue-white fiery tail streaming out to the LEFT behind it. The comet head is on the right half, the tail fills the left half. Imposing but cute.',
 'e_bfb': 'Subject: BOSS "Moon Brute": a huge round grey-red cratered moon with deep craters, a band-aid on one crater, small rocks orbiting close to it, a furious grumpy face with gritted teeth. Round silhouette.',
 'e_zomg': 'Subject: BOSS "Ringed Titan": a giant angry green-and-teal gas planet with swirling storm bands and a tilted glowing golden ring around it (ring stays inside the frame), a menacing face with heavy brows.',
 'e_ddt': 'Subject: BOSS "Shadow Comet": a sleek dark comet head of glossy black crystal with glowing cyan cracks and cyan glowing eyes, a sharp dark smoky tail with cyan sparks streaming to the LEFT behind it. Sneaky sly grin. Comet head on the right half.',
 'e_bad': 'Subject: FINAL BOSS "Star Emperor": a gigantic regal five-pointed star of deep purple crystal with gold trim on the edges, a big golden jewelled crown on top, a glowing gold core, tiny orbiting stars, a proud furious tyrant face with a curled moustache.',
}
B_DAMAGE = {
 1: 'Damage state 1 of 2: the SAME character as the reference (same pose, angle, size and framing), but battered: a few visible cracks and chipped edges, a dizzy annoyed expression.',
 2: 'Damage state 2 of 2: the SAME character as the reference (same pose, angle, size and framing), but badly damaged: many deep cracks glowing from inside, chunks missing, dented, a desperate panicked expression.',
}
FORT = ('Fortified variant: the SAME character as the reference (same pose, angle, size and framing), now reinforced with riveted dark steel armour bands and plates '
        'bolted around its body and a steel helmet-like cap, still clearly recognisable underneath.')
reqs = []
for i, (id_, s) in enumerate(A.items()):
    reqs.append({'index': i, 'params': {'model': 'gpt_image_2_5', 'quality': 'high', 'resolution': '1k', 'aspect_ratio': '1:1', 'background': 'transparent',
        'medias': [{'value': ANCHOR, 'role': 'image_references'}], 'prompt': HEAD + s + TAIL}})
json.dump({'ids': list(A), 'requests': reqs}, open('art/specs/enemies_a.json', 'w'), indent=1)
ids, reqs = [], []
for base in ['e_ceramic', 'e_moab', 'e_bfb', 'e_zomg', 'e_ddt', 'e_bad']:
    for d in (1, 2):
        ids.append(f'{base}_d{d}')
        reqs.append((base, B_DAMAGE[d]))
for base in ['e_lead', 'e_ceramic', 'e_moab', 'e_bfb', 'e_zomg', 'e_ddt', 'e_bad']:
    ids.append(f'{base}_f')
    reqs.append((base, FORT))
out = []
for i, (base, s) in enumerate(reqs):
    out.append({'index': i, 'params': {'model': 'gpt_image_2_5', 'quality': 'high', 'resolution': '1k', 'aspect_ratio': '1:1', 'background': 'transparent',
        'medias': [{'value': jobs.get(base, 'MISSING-' + base), 'role': 'image_references'}],
        'prompt': 'Game asset for a premium mobile tower defense game, isolated on a fully transparent background, same glossy 3D cartoon style as the reference. ' + s + TAIL}})
json.dump({'ids': ids, 'requests': out}, open('art/specs/enemies_b.json', 'w'), indent=1)
print(len(A), 'stage A,', len(ids), 'stage B')
