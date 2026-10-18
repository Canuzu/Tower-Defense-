#!/usr/bin/env python3
"""Writes art/specs/towers_<id>.json: Higgsfield batch requests for each tower's upgrade looks
(paths 1-3, tiers 3-5), referencing the tower's base sprite job for identity."""
import json
jobs = json.load(open('art/jobs.json'))
TIER = {
    3: 'This is upgrade tier 3 of 5: clearly upgraded, bigger and better gear than the reference.',
    4: 'This is upgrade tier 4 of 5: an impressive, powerful-looking big gadget; noticeably more elaborate than tier 3.',
    5: 'This is upgrade tier 5 of 5, the LEGENDARY final form: epic and awe-inspiring with glowing accents and small magical particles, and the iron rim of the platform becomes polished gold.',
}
U = {
 'spike': {
  (1,3): 'Shard Fan: holds a wide three-pronged slingshot with three rubber bands, each loaded with a sharp tin shard; the satchel overflows with shards.',
  (1,4): 'Nail Storm: wears a spiky leather harness studded with nails and carries a round drum full of nails on its back, nails bristling outward in all directions; slingshot in paw, excited grin.',
  (1,5): 'Junknado: stands spinning in the eye of a swirling whirlwind of sharp scrap metal (nails, tin shards, bolts, bottle caps) orbiting tightly around it, bandana flapping.',
  (2,3): 'Harpoon Toss: holds a big barbed harpoon spear over its shoulder ready to throw, a quiver of harpoons on its back.',
  (2,4): 'Scrap Ballista: operates a large crossbow ballista built from wood and junk metal, mounted on the platform and loaded with a heavy harpoon.',
  (2,5): 'The Skewer: mans a giant golden ballista loaded with a glowing blue harpoon bolt, wears a dented knight helmet with a red plume.',
  (3,3): 'Rapid Fire: wears green night-vision goggles and dual-wields two slingshots, one in each paw.',
  (3,4): 'Gatling Slinger: cranks a hand-cranked gatling slingshot with six rotating slingshot forks mounted on the platform; night-vision goggles on.',
  (3,5): 'Bandit Supreme: heroic pose with a long flowing red bandit cape and glowing golden goggles, a mechanical robot arm holding a glowing automatic slingshot.',
 },
 'boomer': {
  (1,3): 'Concussion Blast: a bigger double-barrel trash-can mortar on a heavy spring base; the bomb on top has a glowing blue shockwave ring.',
  (1,4): 'Earthshaker: a huge heavy black iron mortar cannon with rivets; the raccoon wears big ear-muffs over the pot helmet.',
  (1,5): 'Atomic Can: a massive yellow-and-black hazard-striped trash-can mortar glowing radioactive green with a green trefoil symbol (shape only, no letters); the raccoon wears an orange hazmat suit and goggles.',
  (2,3): 'Cluster Bombs: a revolving rack of six small bombs around the mortar barrel, a bandolier of mini bombs across the chest.',
  (2,4): 'Recursive Clusters: a big rotary drum mortar loaded with many small bombs, goggles on, manic grin.',
  (2,5): 'Carpet Bomber: a twin-barrel rapid mortar with belts of bombs, wears a leather aviator cap and a long scarf, bombs stacked around.',
  (3,3): 'Comet Buster: a long shoulder-mounted missile launcher tube with a red-tipped rocket, a targeting monocle over one eye.',
  (3,4): 'Comet Breaker: a twin missile launcher rack with two big rockets on the platform, wears a green army helmet.',
  (3,5): 'Titan Slayer: a gigantic shiny rocket with fins and a flame-painted nose on a launch rail, the raccoon commander wears a red beret.',
 },
 'frost': {
  (1,3): 'Shatter: the frost blaster now has a jagged crystal-ice drill nozzle; sharp ice crystals grow on the fridge backpack.',
  (1,4): 'Glacial Core: the fridge backpack holds a glowing blue ice-core reactor; frost spreads over the platform.',
  (1,5): 'Absolute Zero: surrounded by a swirling crown of floating ice crystals, glowing white-blue eyes, ice armour shoulder pads, the platform frosted over.',
  (2,3): 'Snowstorm: a big snow-making fan sits on top of the fridge, blowing snowflakes; a small snow cloud above.',
  (2,4): 'Frostbite: an angry little dark-blue blizzard cloud with hail swirls around; the raccoon wears a fur-lined parka.',
  (2,5): 'Eternal Winter: wears a regal white fur cloak and holds an ice staff, a swirling blizzard vortex of snowflakes circles the platform.',
  (3,3): 'Cryo Cannon: holds a chunky ice cannon with a fridge-door barrel, an ice ball loaded in the muzzle.',
  (3,4): 'Ice Lance: holds a long crystal ice-lance spear-gun, icicle spikes on the shoulders.',
  (3,5): 'Frost Titan: sits in a hulking ice-crystal mech suit with two giant ice-lance cannons for arms, glowing blue.',
 },
 'hoot': {
  (1,3): 'Armor Breaker: a bigger heavy brass rifle with a drill-bit muzzle, an ammo belt of big brass shells.',
  (1,4): 'Deadeye: a long anti-armour rifle with a huge scope and a red laser sight, wears a leafy camouflage hood.',
  (1,5): 'Eclipse Rifle: a giant dark-purple and gold rifle with a glowing eclipse-ring scope, wears a dark hooded cloak and glowing goggles.',
  (2,3): 'Ricochet: the rifle has an angled bent-barrel attachment, a bandolier of shiny bottle caps, tricky grin.',
  (2,4): "Hunter's Mark: the rifle projects a glowing red target reticle, wears a hunter's hat with a feather and red face-paint stripes.",
  (2,5): 'Bottlecap Barrage: a big multi-barrel rifle with a hopper full of shiny bottle caps, bottle caps flying around.',
  (3,3): 'Semi-Auto: a compact semi-automatic rifle with a drum magazine, a headband and ammo belts.',
  (3,4): 'Supply Drop: the rifle on the back, talking into a walkie-talkie; a wooden supply crate with a parachute beside it.',
  (3,5): 'Sniper Captain: a captain with a peaked military cap with a star badge, medals, binoculars around the neck and a gold-trimmed rifle; a small flag stands on the platform.',
 },
 'ember': {
  (1,3): "Dragon's Breath: the staff's tip is now a small dragon head breathing fire; robe singed red-orange.",
  (1,4): 'Phoenix: a small fiery phoenix bird perches on the staff; the robe is crimson with flame patterns.',
  (1,5): 'Inferno Lord: wears a blazing crimson-and-gold robe, the hat burns like a crown of flames, fire swirls around.',
  (2,3): 'Arcane Nova: the staff holds a glowing violet crystal orb with arcane symbols orbiting (no letters); the robe is deep blue.',
  (2,4): 'Moonbeams: a crescent-moon staff glowing silver, small glowing moon shards orbit around.',
  (2,5): 'Archmage: a long silver beard, a tall starry hat, a floating open spellbook, a glowing magic circle on the platform.',
  (3,3): 'Spirit Swarm: several small glowing turquoise spirit wisps orbit around; the lantern glows teal.',
  (3,4): 'Ghost Pack: two small translucent glowing turquoise ghost raccoons stand beside it; it wears a feathered shaman mask pushed up.',
  (3,5): 'Spirit King: an antler crown and a teal spirit cloak, a giant translucent glowing ghost raccoon spirit rises behind it.',
 },
 'zap': {
  (1,3): 'Storm Coil: a tall copper tesla coil tower on the back crackling with lightning, a small storm cloud above.',
  (1,4): 'Tempest: a lightning-rod helmet and two tesla coils, electricity arcing everywhere, fur standing up.',
  (1,5): 'Storm Lord: a dark storm-cloud crown, glowing electric-blue eyes, lightning bolts swirling around.',
  (2,3): 'Comet Grabber: a long extendable mechanical grabber claw arm (like a junk reacher-grabber) mounted on the backpack.',
  (2,4): 'Trash Compactor: a mechanical trash compactor box with steel jaws on the platform, the raccoon works its levers.',
  (2,5): 'Mega Compactor: a huge chomping compactor machine with steel teeth and glowing eyes on the platform, the raccoon in its driver seat.',
  (3,3): 'Overcharge: glowing overcharged batteries, coiled cables wrapped around, sparks everywhere.',
  (3,4): 'Tesla Traps: holds a stack of round electric lily-pad shaped trap discs, a small tesla dish antenna on the helmet.',
  (3,5): 'Power Grid: a mini power station with a transformer, little pylons and glowing power lines on the platform; the raccoon engineer holds a clipboard.',
 },
 'buzz': {
  (1,3): 'Drone Swarm: three small junk drones hover around it.',
  (1,4): 'Drone Legion: five junk drones and a little launch pad on the platform, a bigger controller with a screen.',
  (1,5): 'Swarm Mind: a glowing VR helmet with antennas, a halo of many tiny drones orbiting.',
  (2,3): 'Jet Squadron: two sleek little jet-wing drones with green acid tanks, pilot goggles on.',
  (2,4): 'Mini Missiles: drones armed with tiny missiles, wears a pilot helmet.',
  (2,5): 'Doom Drones: menacing black-and-red spiky attack drones with glowing red eyes, a dark visor.',
  (3,3): 'Mother Drone: a big round mother drone hovers above with smaller drones docked on it.',
  (3,4): 'Super Glue: a drone carrying a big glue-bottle tank dripping yellow glue, glue bottles on the platform.',
  (3,5): "Mothership: a large saucer-shaped junk mothership drone with lights hovers above, the raccoon wears a captain's hat.",
 },
 'acorn': {
  (1,3): 'Treasure Pile: a bigger heap of coins, gems and shiny junk, digging with a small shovel.',
  (1,4): 'Treasure Mountain: a tall mound of gold coins, gems and trinkets with the raccoon on top holding the magnet.',
  (1,5): "Dragon's Hoard: an overflowing hoard of gold, crowns and jewels; the raccoon wears a crown and a royal purple robe on a treasure throne.",
  (2,3): "Bandit Bank: a small green safe with a dial beside it, a banker's visor, counting coins.",
  (2,4): 'Golden Hoard: a big round golden vault door behind it, money bags.',
  (2,5): 'Loot Empire: a tycoon in a top hat and tuxedo with a cane, a golden vault and money bags.',
  (3,3): 'Flea Market: a small market stall with a striped awning and junk for sale.',
  (3,4): 'Trade Hub: a little merchant cart stacked with crates, a balance scale and a bell.',
  (3,5): 'Stock Exchange: a sharp suit, a ticker tape, a small golden bull statue and a rising arrow sign (no text).',
 },
 'dojo': {
  (1,3): 'Master Dojo: a small wooden dojo gate frame behind it and a wooden practice dummy.',
  (1,4): 'Grandmaster: a black belt with gold embroidery, two bamboo staves, a small shrine roof behind.',
  (1,5): 'Legendary Dojo: floating in meditation with a golden aura and glowing eyes, a miniature pagoda on the platform.',
  (2,3): 'Pressure Points: fanned acupuncture needles in one paw, a paper lantern hanging from the staff.',
  (2,4): 'Tranquil Garden: a tiny zen garden with raked sand, a bonsai tree and a stone lantern on the platform.',
  (2,5): 'Zen Master: levitating cross-legged above a lotus flower, a glowing mandala halo (no text), cherry blossom petals.',
  (3,3): 'Tea House: a tea set with a steaming teapot on a low table beside it.',
  (3,4): 'Lucky Charm: a big lucky golden horseshoe and four-leaf-clover charms hanging around.',
  (3,5): 'Raccoon Republic: a statesman in a ceremonial robe with a golden sash, a flag with a paw-print emblem, a tiny palace roof.',
 },
}
HEAD = ('Game asset for a premium mobile tower defense game: ONE single character, isolated on a fully transparent background. '
        'The reference image shows this tower\'s base character: keep the SAME raccoon (same face, fur, proportions, outfit colours and '
        'accessories unless replaced below), the same glossy stylized 3D cartoon rendering and lighting, the same camera angle and framing, '
        'and the same round wooden cable-spool platform fully visible and centred at the bottom at the same size in frame. ')
TAIL = (' Keep the silhouette compact and readable at small size; extra parts may rise upward but must stay inside the frame. '
        'No text, letters or numbers, no logo, no background, no frame, nothing cropped.')
for tid, ups in U.items():
    base = jobs['t_' + tid]
    reqs, ids = [], []
    for i, ((p, t), desc) in enumerate(sorted(ups.items())):
        ids.append(f't_{tid}_p{p}_{t}')
        reqs.append({'index': i, 'params': {'model': 'gpt_image_2_5', 'quality': 'high', 'resolution': '1k', 'aspect_ratio': '1:1',
            'background': 'transparent', 'medias': [{'value': base, 'role': 'image_references'}],
            'prompt': HEAD + TIER[t] + ' Upgrade: ' + desc + TAIL}})
    json.dump({'ids': ids, 'requests': reqs}, open(f'art/specs/towers_{tid}.json', 'w'), indent=1)
print('ok')
