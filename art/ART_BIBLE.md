# Star Bandits: art and theme bible

**Working title:** *Star Bandits* (the same in German).
**Premise:** Grumpy living stars have fallen from the sky onto Raccoon Hollow, and they march across it toward the raccoons' treasure stash. A band of raccoon tinkerers ("Bandits") builds gadgets out of junk to shatter the stars into stardust. Every star cracks into smaller, cooler stars (the layer system).

**Look:** glossy stylized 3D cartoon (premium mobile quality, like BTD6 or Clash Royale), soft studio key light from the top left, gentle rim light and saturated colours. Characters are seen in three-quarter view from the front, about 40° above. Maps are painted straight from above.

Every tower is a raccoon: chubby proportions, a big head, the black bandit mask, grey fur, a cream muzzle and a ringed tail. Each one stands on the **same round wooden cable-spool platform** (light oak top, dark iron rim with bolts). The style anchor is `art/anchors/tower_anchor.webp`.

Enemies are faceted, glowing crystal stars with angry cute faces. The style anchor is `art/anchors/star_anchor.webp`.

## Internal ids stay the same
Mechanics, ids and save data are unchanged. Only names, descriptions and visuals change.

## Towers (tower id → name EN / DE)
| id | EN | DE | Look |
|---|---|---|---|
| spike | Slinger | Schleuderer | red bandana, wooden slingshot, satchel of sharp tin shards |
| boomer | Boomer | Boomer | dented pot-lid helmet, trash-can mortar that lobs lit bombs |
| frost | Frosty | Frosti | wool beanie, mini-fridge backpack with a frost-blaster hose |
| hoot | Scope | Späher | aviator goggles, long brass telescope rifle (sniper) |
| ember | Mystic | Mystiker | patched star-sprinkled wizard robe and hat, lantern staff (fire, arcane and spirit magic) |
| zap | Sparky | Funki | hard hat with a lamp, tesla-coil backpack made from car batteries, frizzy static fur |
| buzz | Buzz | Buzz | headset and RC remote control, flies little junk drones |
| acorn | Hoarder | Sammler | sits on a glittering pile of shiny junk with a horseshoe magnet; makes coins |
| dojo | Sensei | Sensei | old raccoon master with long white eyebrows, bamboo staff, small gong |

### Upgrade renames (old EN name → new EN name). Unlisted names stay the same.
- **spike:** Twin Quills→Double Shot, Triple Threat→Triple Shot, Quill Fan→Shard Fan, Porcupine Burst→Nail Storm, Thornado→Junknado (ability too), Sharp Quills→Sharp Shards, Razor Quills→Razor Shards, Javelin Toss→Harpoon Toss, Ballista Hog→Scrap Ballista, The Impaler→The Skewer, Keen Eyes (same), Night Goggles (same), Rapid Quills→Rapid Fire, Quill Gunner→Gatling Slinger, Hedgehog Supreme→Bandit Supreme
- **boomer:** Nuclear Beetle→Atomic Can, Glob Buster→Comet Buster, Glob Breaker→Comet Breaker
- **frost:** names stay
- **hoot:** Heavy Talons→Heavy Rounds, Piercing Gaze→Piercing Rounds, Eclipse Owl→Eclipse Rifle, Scatter Feathers→Scatter Shot, Feather Storm→Bottlecap Barrage (ability too: bottle caps rain down), Semi-Auto Owl→Semi-Auto, Owl Commander→Sniper Captain (all Scopes)
- **ember:** Nine-Tailed Inferno→Inferno Lord, Kitsune Firestorm→Firestorm, Starfall→Moonbeams (bolts shatter into 3 seeking moon shards), Spirit Wisps (same), Ghost Fox Pack→Ghost Pack (spirit raccoons), Spirit Queen→Spirit King
- **zap:** Thunderhead→Storm Coil, Storm God→Storm Lord, Snack Attack→Grabby Claw, Long Tongue→Long Reach, Glob Grabber→Comet Grabber, Gulp!→Trash Compactor, Frog Leviathan→Mega Compactor, Static Skin→Static Fur, Tesla Pads→Tesla Traps
- **buzz:** Worker Bees→Extra Drone, Busy Hive→Drone Hangar, Swarm→Drone Swarm, Bee Legion→Drone Legion, Hive Mind→Swarm Mind, Killer Swarm (ability)→Drone Strike, Venom Stingers→Acid Darts, Toxic Venom→Toxic Acid, Wasp Squadron→Jet Squadron, Hornet Missiles→Mini Missiles, Murder Hornets→Doom Drones, Royal Jelly→Thermal Cam, Honey Trap→Glue Trap, Queen Bee→Mother Drone, Honey Glaze→Super Glue, Hive Empress→Mothership, Royal Decree→Overclock
- **acorn:** More Acorns→More Loot, Golden Acorns→Golden Loot, Acorn Orchard→Treasure Pile, Mega Grove→Treasure Mountain, World Tree→Dragon's Hoard, Nut Stash→Piggy Bank, Squirrel Bank→Bandit Bank, Nut Empire→Loot Empire, Acorn Market→Flea Market, Nut Exchange→Stock Exchange (acorns become "shinies": glittering coins the Hoarder digs up)
- **dojo:** Lucky Cat→Lucky Charm, Panda Republic→Raccoon Republic, Bamboo Trade→Barter

## Heroes
| id | EN | DE | Look |
|---|---|---|---|
| nova | Cosmo, the Space Bandit | Kosmo, der Weltraumbandit | raccoon astronaut, retro white-and-orange space suit, glass bubble helmet, ray-gun blaster |
| grizz | Rocco, the Junkyard Boss | Rocco, der Schrottplatz-Boss | huge burly raccoon with scrap-metal shoulder armour and a giant wrench-hammer |

Each hero has 3 looks: level 1–6, 7–13 and 14–20 (more gear and glow).

## Enemies: stars (gloop id → name EN / DE)
| id | EN | DE | Look |
|---|---|---|---|
| red | Red Dwarf | Roter Zwerg | small red star, grumpy pout |
| blue | Orange Star | Oranger Stern | orange star, annoyed |
| green | Yellow Star | Gelber Stern | yellow star, smug sneer |
| yellow | White Star | Weißer Stern | warm white-gold star, racing grin, speed streaks |
| pink | Blue Star | Blauer Stern | bright blue star, furious gritted teeth |
| black | Black Hole | Schwarzes Loch | small dark star with a swirling purple vortex core; explosions get swallowed |
| white | Ice Star | Eisstern | frosted icy translucent star with icicles; immune to freezing |
| purple | Nebula | Nebelstern | swirling violet-pink nebula cloud star; absorbs magic, fire and lightning |
| zebra | Eclipse | Finsternis | half black hole, half ice star |
| lead | Meteor | Meteor | star encased in heavy grey iron-rock armour; sharp hits bounce off |
| rainbow | Aurora | Polarlicht | rainbow prismatic star |
| ceramic | Diamond | Diamant | big diamond-shell star (3 damage states) |
| moab | Comet | Komet | boss: big icy-blue comet head with a face and a flaming tail |
| bfb | Moon Brute | Mondkoloss | boss: huge grumpy red-grey cratered moon |
| zomg | Ringed Titan | Ringtitan | boss: angry green ringed planet |
| ddt | Shadow Comet | Schattenkomet | boss: sleek dark comet with a cyan glow; camo, fast, armoured |
| bad | Star Emperor | Sternenkaiser | final boss: giant purple-gold sun star with a crown |
| golden | Lucky Star | Glücksstern | rare golden shooting star; bonus cash |

Modifiers: camo shows as a translucent shimmer with a dark tint (procedural), regrow as a pulsing green sparkle ring (procedural), fortified uses the `_f` sprite variant (iron bands and bolts).

## Maps (map id → name EN / DE, theme)
| id | EN | DE | Theme |
|---|---|---|---|
| meadow | Raccoon Meadow | Waschbärwiese | sunny meadow, dirt path, pond |
| caverns | Crystal Mine | Kristallmine | dark mine with glowing crystals, rails and lanterns |
| fjord | Frozen Lake | Frostsee | snowy shore, frozen lake, pines |
| forge | Scrap Foundry | Schrottschmiede | junkyard foundry at dusk with molten metal pools |
| candy | Candy Lane | Zuckergasse | backyard of a sweet shop: giant candies and cupcakes |
| rivers | Twin Rivers | Zwillingsflüsse | forest with two creeks and bridges |

## Sprite ids (public/sprites/<id>.webp, indexed in src/assets/sprites.json)
- Towers: `t_<towerId>` (tiers 0–2) and `t_<towerId>_p<path 1..3>_<tier 3..5>`. Pick the sprite for the highest path tier ≥ 3. If that path is missing, fall back to its lower tiers, then to the base.
- Heroes: `h_<heroId>_1|2|3`
- Enemies: `e_<gloopId>`, fortified `e_<gloopId>_f`, boss damage `e_<gloopId>_d1|d2` (ceramic too)
- Projectiles and drops: `p_<name>`
- Maps: `m_<mapId>` (full painted background 1600×900 world, any resolution of 16:9)
- UI: `ui_<name>`, ability icons `ab_<abilityId>`

Tower sprites are anchored at the centre of the spool top (`ax`, `ay`). `foot` is the spool width as a fraction of the image width; the renderer scales the sprite so the spool width equals about 2.6× the tower radius. Enemy sprites are anchored at their centre.

## Higgsfield reference jobs
- Tower style anchor (Slinger base): job `51dde4b4-df06-45db-8284-f5ba59695020`
- Star style anchor (Red Dwarf): job `0bdeb34a-50f9-434f-86b5-4d0575ea0141`
- Meadow painted map: job `bf843e7e-9a09-4660-9ea4-d64b8b7139d0`
