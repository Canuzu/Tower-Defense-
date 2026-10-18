import { atk, ability, setAbility, type TowerDef, type TowerId, type TowerStats, type ProjDef } from './towerTypes';

const base = (partial: Partial<TowerStats> & { range: number }): TowerStats => ({
  camo: false,
  canHitAll: false,
  attacks: [],
  abilities: [],
  sellMul: 0.7,
  ...partial,
});

// ---------------------------------------------------------------------------------------------
// SPIKE — Hedgehog. Cheap, reliable quill thrower.
// ---------------------------------------------------------------------------------------------
const spike: TowerDef = {
  id: 'spike',
  name: 'Spike',
  species: 'Hedgehog',
  role: 'Primary',
  desc: 'Flicks sharp quills at gloops. Cheap, quick and endlessly upgradable.',
  cost: 200,
  radius: 20,
  unlock: 1,
  color: '#b9773f',
  hotkey: 'q',
  base: () =>
    base({
      range: 150,
      attacks: [
        {
          id: 'quill',
          kind: 'shoot',
          rate: 0.95,
          count: 1,
          spread: 0,
          proj: { visual: 'quill', damage: 1, pierce: 2, dmgType: 'sharp', speed: 900, radius: 7 },
        },
      ],
    }),
  pathNames: ['Barrage', 'Piercing', 'Precision'],
  paths: [
    [
      { name: 'Twin Quills', cost: 140, desc: 'Throws 2 quills at once.', apply: (s) => { const a = atk(s, 'quill', 'shoot'); a.count = 2; a.spread = 12; } },
      { name: 'Triple Threat', cost: 220, desc: '3 quills per throw and slightly faster.', apply: (s) => { const a = atk(s, 'quill', 'shoot'); a.count = 3; a.spread = 20; a.rate *= 0.9; } },
      { name: 'Quill Fan', cost: 750, desc: 'A fan of 5 quills with +1 pierce.', apply: (s) => { const a = atk(s, 'quill', 'shoot'); a.count = 5; a.spread = 44; a.proj.pierce += 1; } },
      {
        name: 'Porcupine Burst',
        cost: 2400,
        desc: 'Every 1.6s explodes with 16 quills in all directions.',
        apply: (s) => {
          s.attacks.push({ id: 'burst', kind: 'radial', rate: 1.6, count: 16, proj: { visual: 'quill', damage: 2, pierce: 3, dmgType: 'sharp', speed: 780, radius: 7 } });
        },
      },
      {
        name: 'Thornado',
        cost: 18000,
        desc: 'Bursts of 24 heavy quills. Ability: become a spinning tornado of thorns.',
        apply: (s) => {
          const b = atk(s, 'burst', 'radial');
          b.rate = 0.7;
          b.count = 24;
          b.proj.damage = 3;
          b.proj.pierce = 6;
          setAbility(s, { id: 'thornado', name: 'Thornado', icon: '🌪️', desc: 'Attack 4x faster for 8s.', cooldown: 40, params: { duration: 8, mul: 4 } });
        },
      },
    ],
    [
      { name: 'Sharp Quills', cost: 140, desc: 'Quills pop 1 extra gloop.', apply: (s) => { atk(s, 'quill', 'shoot').proj.pierce += 1; } },
      { name: 'Razor Quills', cost: 260, desc: '+2 pierce and faster quills.', apply: (s) => { const p = atk(s, 'quill', 'shoot').proj; p.pierce += 2; p.speed *= 1.15; } },
      {
        name: 'Javelin Toss',
        cost: 900,
        desc: 'Hurls big javelins: 4 damage, 18 pierce and they hit Iron gloops.',
        apply: (s) => {
          const a = atk(s, 'quill', 'shoot');
          const p = a.proj;
          p.visual = 'javelin';
          p.damage += 3;
          p.pierce += 13;
          p.dmgType = 'normal';
          p.speed = 760;
          p.radius = 11;
          a.rate *= 1.2;
          s.range += 15;
        },
      },
      {
        name: 'Ballista Hog',
        cost: 3200,
        desc: 'Massive javelins that crush Crystals and wreck Globs.',
        apply: (s) => {
          const a = atk(s, 'quill', 'shoot');
          a.proj.damage += 6;
          a.proj.pierce += 22;
          a.proj.bossBonus = 20;
          a.proj.heavyBonus = 6;
          a.proj.size = 1.25;
          a.rate *= 0.87;
        },
      },
      {
        name: 'The Impaler',
        cost: 26000,
        desc: 'Legendary javelins that skewer everything and stun on impact.',
        apply: (s) => {
          const a = atk(s, 'quill', 'shoot');
          a.proj.damage += 20;
          a.proj.pierce += 110;
          a.proj.bossBonus = 100;
          a.proj.size = 1.5;
          a.proj.statuses = [{ kind: 'stun', duration: 0.25, boss: 0.4 }];
          a.rate *= 0.85;
        },
      },
    ],
    [
      { name: 'Keen Eyes', cost: 100, desc: '+30 range and faster quills.', apply: (s) => { s.range += 30; atk(s, 'quill', 'shoot').proj.speed *= 1.2; } },
      { name: 'Night Goggles', cost: 180, desc: 'Detects Camo gloops. +15 range.', apply: (s) => { s.camo = true; s.range += 15; } },
      { name: 'Rapid Quills', cost: 600, desc: 'Throws much faster.', apply: (s) => { atk(s, 'quill', 'shoot').rate *= 0.55; } },
      {
        name: 'Quill Gunner',
        cost: 2800,
        desc: 'A blur of quills. Even faster, +1 damage and +1 pierce.',
        apply: (s) => {
          const a = atk(s, 'quill', 'shoot');
          a.rate *= 0.45;
          a.proj.damage += 1;
          a.proj.pierce += 1;
        },
      },
      {
        name: 'Hedgehog Supreme',
        cost: 22000,
        desc: 'Seeking quills, +3 damage and +3 pierce at ludicrous speed.',
        apply: (s) => {
          const a = atk(s, 'quill', 'shoot');
          a.rate *= 0.5;
          a.proj.damage += 3;
          a.proj.pierce += 3;
          a.proj.homing = 7;
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------------------------
// BOOMER — Bombardier beetle. Explosive splash.
// ---------------------------------------------------------------------------------------------
const miniBomb = (damage: number, radius: number, pierce: number): ProjDef => ({
  visual: 'minibomb',
  damage: 0,
  pierce: 1,
  dmgType: 'explosive',
  speed: 320,
  radius: 6,
  life: 0.28,
  explode: { radius, damage, pierce, dmgType: 'explosive', visual: 'mini' },
});

const boomer: TowerDef = {
  id: 'boomer',
  name: 'Boomer',
  species: 'Bombardier Beetle',
  role: 'Military',
  desc: 'Lobs bombs that splash whole crowds. Licorice gloops shrug off explosions.',
  cost: 525,
  radius: 22,
  unlock: 1,
  color: '#3d6bff',
  hotkey: 'w',
  base: () =>
    base({
      range: 160,
      attacks: [
        {
          id: 'bomb',
          kind: 'shoot',
          rate: 1.45,
          count: 1,
          spread: 0,
          proj: {
            visual: 'bomb',
            damage: 0,
            pierce: 1,
            dmgType: 'explosive',
            speed: 520,
            radius: 10,
            explode: { radius: 42, damage: 1, pierce: 14, dmgType: 'explosive', visual: 'boom' },
          },
        },
      ],
    }),
  pathNames: ['Big Bombs', 'Cluster', 'Glob Busters'],
  paths: [
    [
      { name: 'Bigger Bombs', cost: 300, desc: 'Larger blast radius, +8 pierce.', apply: (s) => { const e = atk(s, 'bomb', 'shoot').proj.explode!; e.radius += 16; e.pierce += 8; } },
      { name: 'Heavy Bombs', cost: 650, desc: '+1 explosion damage.', apply: (s) => { const e = atk(s, 'bomb', 'shoot').proj.explode!; e.damage += 1; e.pierce += 6; } },
      {
        name: 'Concussion Blast',
        cost: 1150,
        desc: '+1 damage, bigger blast and stuns gloops briefly.',
        apply: (s) => {
          const e = atk(s, 'bomb', 'shoot').proj.explode!;
          e.damage += 1;
          e.radius += 12;
          e.statuses = [{ kind: 'stun', duration: 0.3, boss: 0 }];
        },
      },
      {
        name: 'Earthshaker',
        cost: 3600,
        desc: 'Devastating blasts. Ability: Quake stuns every gloop on screen.',
        apply: (s) => {
          const e = atk(s, 'bomb', 'shoot').proj.explode!;
          e.damage += 4;
          e.pierce += 40;
          e.statuses = [{ kind: 'stun', duration: 0.6, boss: 0.35 }];
          setAbility(s, { id: 'quake', name: 'Quake', icon: '💥', desc: 'Stuns all gloops and deals 20 damage.', cooldown: 45, params: { damage: 20, stun: 1.5, bossStun: 0.5 } });
        },
      },
      {
        name: 'Nuclear Beetle',
        cost: 28000,
        desc: 'Mushroom-cloud explosions. Quake becomes a 600-damage meltdown.',
        apply: (s) => {
          const e = atk(s, 'bomb', 'shoot').proj.explode!;
          e.damage += 11;
          e.radius = Math.max(e.radius, 110);
          e.pierce += 120;
          e.bossBonus = (e.bossBonus ?? 0) + 60;
          e.visual = 'nuke';
          const q = ability(s, 'quake');
          q.params.damage = 600;
          q.params.stun = 3;
          q.params.bossStun = 1;
          q.desc = 'Meltdown: 600 damage to every gloop and a long stun.';
          q.name = 'Meltdown';
        },
      },
    ],
    [
      { name: 'Faster Reload', cost: 250, desc: 'Fires 33% faster.', apply: (s) => { atk(s, 'bomb', 'shoot').rate *= 0.75; } },
      {
        name: 'Missile Pods',
        cost: 400,
        desc: 'Swaps bombs for fast missiles. +20 range.',
        apply: (s) => {
          const a = atk(s, 'bomb', 'shoot');
          a.proj.visual = 'missile';
          a.proj.speed += 260;
          a.rate *= 0.85;
          s.range += 20;
        },
      },
      {
        name: 'Cluster Bombs',
        cost: 900,
        desc: 'Explosions scatter 8 mini bombs.',
        apply: (s) => {
          atk(s, 'bomb', 'shoot').proj.explode!.cluster = { count: 8, proj: miniBomb(1, 28, 8) };
        },
      },
      {
        name: 'Recursive Clusters',
        cost: 3000,
        desc: 'Mini bombs split again into micro bombs.',
        apply: (s) => {
          const c = atk(s, 'bomb', 'shoot').proj.explode!.cluster!;
          c.count = 10;
          const mini = miniBomb(2, 30, 12);
          mini.explode!.cluster = { count: 4, proj: miniBomb(1, 22, 6) };
          c.proj = mini;
        },
      },
      {
        name: 'Carpet Bomber',
        cost: 32000,
        desc: 'Twice the fire rate and a storm of 16 heavy clusters.',
        apply: (s) => {
          const a = atk(s, 'bomb', 'shoot');
          a.rate *= 0.5;
          a.proj.explode!.damage += 3;
          const c = a.proj.explode!.cluster!;
          c.count = 16;
          c.proj.explode!.damage = 4;
          c.proj.explode!.pierce = 16;
        },
      },
    ],
    [
      { name: 'Long Fuse', cost: 200, desc: '+25 range and slightly bigger blasts.', apply: (s) => { s.range += 25; atk(s, 'bomb', 'shoot').proj.explode!.radius += 6; } },
      {
        name: 'Hunter Missiles',
        cost: 350,
        desc: 'Homing missiles that never miss.',
        apply: (s) => {
          const p = atk(s, 'bomb', 'shoot').proj;
          p.homing = 5;
          p.visual = 'missile';
          p.speed += 150;
        },
      },
      { name: 'Glob Buster', cost: 1000, desc: '+18 damage to boss gloops.', apply: (s) => { const e = atk(s, 'bomb', 'shoot').proj.explode!; e.bossBonus = (e.bossBonus ?? 0) + 18; } },
      {
        name: 'Glob Breaker',
        cost: 3400,
        desc: '+60 more boss damage and faster firing.',
        apply: (s) => {
          const a = atk(s, 'bomb', 'shoot');
          a.proj.explode!.bossBonus = (a.proj.explode!.bossBonus ?? 0) + 60;
          a.rate *= 0.85;
          a.proj.size = 1.2;
        },
      },
      {
        name: 'Titan Slayer',
        cost: 25000,
        desc: 'Colossal boss damage. Ability: launches a 3000-damage missile at the biggest boss.',
        apply: (s) => {
          const a = atk(s, 'bomb', 'shoot');
          a.proj.explode!.bossBonus = (a.proj.explode!.bossBonus ?? 0) + 420;
          a.proj.visual = 'bigmissile';
          a.proj.size = 1.4;
          setAbility(s, { id: 'missileStrike', name: 'Titan Missile', icon: '🚀', desc: 'Deal 3000 damage to the strongest boss.', cooldown: 30, params: { damage: 3000 } });
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------------------------
// FROST — Penguin. Freezes and slows.
// ---------------------------------------------------------------------------------------------
const frost: TowerDef = {
  id: 'frost',
  name: 'Frost',
  species: 'Penguin',
  role: 'Primary',
  desc: 'Blasts out freezing pulses that stop gloops in their tracks.',
  cost: 400,
  radius: 20,
  unlock: 1,
  color: '#57c8ff',
  hotkey: 'e',
  base: () =>
    base({
      range: 95,
      attacks: [
        {
          id: 'freeze',
          kind: 'pulse',
          rate: 2.2,
          damage: 1,
          dmgType: 'cold',
          pierce: 40,
          statuses: [{ kind: 'freeze', duration: 1.1, boss: 0 }],
          visual: 'frost',
        },
      ],
    }),
  pathNames: ['Deep Freeze', 'Blizzard', 'Ice Shards'],
  paths: [
    [
      { name: 'Permafrost', cost: 100, desc: 'Thawed gloops stay slowed for a while.', apply: (s) => { atk(s, 'freeze', 'pulse').statuses.push({ kind: 'slow', value: 0.5, duration: 2.6, boss: 0 }); } },
      {
        name: 'Cold Snap',
        cost: 300,
        desc: 'Freezes Frosting, Swirl and Camo gloops too.',
        apply: (s) => {
          const a = atk(s, 'freeze', 'pulse');
          a.ignoreImmune = true;
          s.camo = true;
        },
      },
      {
        name: 'Shatter',
        cost: 1600,
        desc: 'Frozen gloops become brittle and take +1 damage from every hit.',
        apply: (s) => {
          const a = atk(s, 'freeze', 'pulse');
          a.statuses.push({ kind: 'vuln', value: 1, duration: 2.4, boss: 0 });
          a.statuses[0].duration! += 0.3;
        },
      },
      {
        name: 'Glacial Core',
        cost: 3500,
        desc: 'Longer, harder freezes that even grip bosses for a moment.',
        apply: (s) => {
          const a = atk(s, 'freeze', 'pulse');
          a.statuses[0].duration = 2;
          a.statuses[0].boss = 0.3;
          a.damage = 3;
          a.pierce = 80;
          a.rate *= 0.75;
        },
      },
      {
        name: 'Absolute Zero',
        cost: 26000,
        desc: 'Ability: freeze EVERY gloop on screen for 6 seconds.',
        apply: (s) => {
          const a = atk(s, 'freeze', 'pulse');
          a.damage = 6;
          a.statuses[0].duration = 2.6;
          s.range += 40;
          setAbility(s, { id: 'absoluteZero', name: 'Absolute Zero', icon: '❄️', desc: 'Freeze everything for 6s. Frozen gloops take +2 damage.', cooldown: 50, params: { duration: 6, bossMul: 0.4 } });
        },
      },
    ],
    [
      {
        name: 'Chill Aura',
        cost: 200,
        desc: 'Gloops in range are permanently slowed by 25%.',
        apply: (s) => {
          s.attacks.push({ id: 'chill', kind: 'aura', rate: 0.2, slow: 0.75, slowBoss: 0.9, dps: 0, dmgType: 'cold' });
        },
      },
      { name: 'Wider Reach', cost: 300, desc: '+30 range.', apply: (s) => { s.range += 30; } },
      {
        name: 'Snowstorm',
        cost: 2200,
        desc: 'Much stronger slow that also affects bosses. +25 range.',
        apply: (s) => {
          const a = atk(s, 'chill', 'aura');
          a.slow = 0.6;
          a.slowBoss = 0.8;
          s.range += 25;
        },
      },
      {
        name: 'Frostbite',
        cost: 5000,
        desc: 'The blizzard bites: deals 3 damage per second to everything inside.',
        apply: (s) => {
          const a = atk(s, 'chill', 'aura');
          a.slow = 0.5;
          a.slowBoss = 0.7;
          a.dps = 3;
        },
      },
      {
        name: 'Eternal Winter',
        cost: 22000,
        desc: 'A colossal storm: 12 damage per second, huge slow, ignores frost immunity.',
        apply: (s) => {
          const a = atk(s, 'chill', 'aura');
          a.slow = 0.4;
          a.slowBoss = 0.55;
          a.dps = 12;
          a.ignoreImmune = true;
          s.range += 60;
        },
      },
    ],
    [
      {
        name: 'Ice Shards',
        cost: 250,
        desc: 'Also shoots sharp ice shards.',
        apply: (s) => {
          s.attacks.push({ id: 'shard', kind: 'shoot', rate: 0.9, count: 1, spread: 0, rangeMul: 1.2, proj: { visual: 'shard', damage: 1, pierce: 3, dmgType: 'sharp', speed: 720, radius: 7 } });
        },
      },
      {
        name: 'Icicle Spray',
        cost: 450,
        desc: '3 shards per shot and +20 range.',
        apply: (s) => {
          const a = atk(s, 'shard', 'shoot');
          a.count = 3;
          a.spread = 24;
          s.range += 20;
        },
      },
      {
        name: 'Cryo Cannon',
        cost: 1800,
        desc: 'Fires ice bombs that freeze whole groups.',
        apply: (s) => {
          const a = atk(s, 'shard', 'shoot');
          a.count = 1;
          a.spread = 0;
          a.rate = 1.1;
          a.rangeMul = 1.5;
          a.proj = {
            visual: 'iceball',
            damage: 0,
            pierce: 1,
            dmgType: 'cold',
            speed: 600,
            radius: 10,
            explode: { radius: 50, damage: 2, pierce: 30, dmgType: 'cold', visual: 'frost', statuses: [{ kind: 'freeze', duration: 1, boss: 0 }] },
          };
        },
      },
      {
        name: 'Ice Lance',
        cost: 3800,
        desc: 'Piercing ice lances that freeze and double damage on bosses.',
        apply: (s) => {
          const a = atk(s, 'shard', 'shoot');
          a.rate = 0.95;
          a.proj = { visual: 'lance', damage: 6, pierce: 25, dmgType: 'sharp', speed: 950, radius: 10, bossMul: 2, statuses: [{ kind: 'freeze', duration: 0.6, boss: 0.4 }] };
        },
      },
      {
        name: 'Frost Titan',
        cost: 24000,
        desc: 'Twin titanic lances: 20 damage, 60 pierce, freeze bosses.',
        apply: (s) => {
          const a = atk(s, 'shard', 'shoot');
          a.count = 2;
          a.spread = 10;
          a.rate = 0.55;
          a.proj.damage = 20;
          a.proj.pierce = 60;
          a.proj.bossBonus = 60;
          a.proj.size = 1.4;
          a.proj.statuses = [{ kind: 'freeze', duration: 1, boss: 0.5 }];
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------------------------
// HOOT — Owl sniper. Global range, single target.
// ---------------------------------------------------------------------------------------------
const hoot: TowerDef = {
  id: 'hoot',
  name: 'Hoot',
  species: 'Owl',
  role: 'Military',
  desc: 'A sharp-eyed sniper that hits anywhere on the map and pierces armour.',
  cost: 350,
  radius: 20,
  unlock: 1,
  color: '#8e6bd8',
  hotkey: 'r',
  base: () =>
    base({
      range: 4000,
      attacks: [{ id: 'shot', kind: 'hitscan', rate: 1.6, damage: 2, dmgType: 'normal', global: true }],
    }),
  pathNames: ['Caliber', 'Night Hunter', 'Swift Wings'],
  paths: [
    [
      { name: 'Heavy Talons', cost: 350, desc: '4 damage per shot.', apply: (s) => { atk(s, 'shot', 'hitscan').damage = 4; } },
      { name: 'Piercing Gaze', cost: 1300, desc: '7 damage per shot.', apply: (s) => { atk(s, 'shot', 'hitscan').damage = 7; } },
      {
        name: 'Armor Breaker',
        cost: 2800,
        desc: '18 damage, extra vs Crystal/Iron and strips Fortified armour.',
        apply: (s) => {
          const a = atk(s, 'shot', 'hitscan');
          a.damage = 18;
          a.heavyBonus = 8;
          a.stripFortify = true;
        },
      },
      {
        name: 'Deadeye',
        cost: 5000,
        desc: '30 damage, triple damage to bosses and every 5th shot crits for 5x.',
        apply: (s) => {
          const a = atk(s, 'shot', 'hitscan');
          a.damage = 30;
          a.bossMul = 3;
          a.critEvery = 5;
          a.critMul = 5;
        },
      },
      {
        name: 'Eclipse Owl',
        cost: 34000,
        desc: 'Annihilating shots: +210 boss damage and stuns the target.',
        apply: (s) => {
          const a = atk(s, 'shot', 'hitscan');
          a.damage = 70;
          a.bossBonus = 210;
          a.statuses = [{ kind: 'stun', duration: 0.4, boss: 0.4 }];
        },
      },
    ],
    [
      { name: 'Night Vision', cost: 300, desc: 'Detects Camo gloops.', apply: (s) => { s.camo = true; } },
      {
        name: 'Scatter Feathers',
        cost: 450,
        desc: 'Shots burst into 5 razor feathers.',
        apply: (s) => {
          atk(s, 'shot', 'hitscan').shrapnel = { count: 5, proj: { visual: 'feather', damage: 1, pierce: 2, dmgType: 'sharp', speed: 520, radius: 6, life: 0.28 } };
        },
      },
      { name: 'Ricochet', cost: 2400, desc: 'Shots bounce to 3 more gloops.', apply: (s) => { const a = atk(s, 'shot', 'hitscan'); a.ricochet = 3; a.ricochetRange = 140; } },
      {
        name: "Hunter's Mark",
        cost: 4500,
        desc: 'Marked gloops take 30% more damage from everything. 6 ricochets.',
        apply: (s) => {
          const a = atk(s, 'shot', 'hitscan');
          a.ricochet = 6;
          a.statuses = [...(a.statuses ?? []), { kind: 'mark', value: 1.3, duration: 3, boss: 1 }];
        },
      },
      {
        name: 'Feather Storm',
        cost: 22000,
        desc: '12 ricochets, +5 damage. Ability: rain a storm of feathers over the track.',
        apply: (s) => {
          const a = atk(s, 'shot', 'hitscan');
          a.ricochet = 12;
          a.damage += 5;
          setAbility(s, { id: 'featherStorm', name: 'Feather Storm', icon: '🪶', desc: '150 feathers rain down along the track.', cooldown: 40, params: { count: 150, damage: 6, pierce: 4 } });
        },
      },
    ],
    [
      { name: 'Quick Draw', cost: 450, desc: 'Shoots 43% faster.', apply: (s) => { atk(s, 'shot', 'hitscan').rate *= 0.7; } },
      { name: 'Steady Grip', cost: 500, desc: 'Shoots even faster.', apply: (s) => { atk(s, 'shot', 'hitscan').rate *= 0.75; } },
      { name: 'Semi-Auto Owl', cost: 3500, desc: 'Triple fire rate.', apply: (s) => { atk(s, 'shot', 'hitscan').rate *= 0.35; } },
      {
        name: 'Supply Drop',
        cost: 7000,
        desc: 'Faster still. Ability: call in a crate with $1,200.',
        apply: (s) => {
          atk(s, 'shot', 'hitscan').rate *= 0.8;
          setAbility(s, { id: 'supplyDrop', name: 'Supply Drop', icon: '📦', desc: 'Drops a crate worth $1,200.', cooldown: 60, params: { cash: 1200 } });
        },
      },
      {
        name: 'Owl Commander',
        cost: 15000,
        desc: 'All Hoots everywhere shoot 33% faster and deal +2 damage. Bigger drops.',
        apply: (s) => {
          s.buffAura = { global: true, only: 'hoot', rateMul: 1.33, damageAdd: 2 };
          ability(s, 'supplyDrop').params.cash = 3000;
          ability(s, 'supplyDrop').desc = 'Drops a crate worth $3,000.';
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------------------------
// EMBER — Fox mage. Magic, fire and spirits.
// ---------------------------------------------------------------------------------------------
const ember: TowerDef = {
  id: 'ember',
  name: 'Ember',
  species: 'Fox Mage',
  role: 'Magic',
  desc: 'Casts arcane bolts. Learns fire magic or summons spirit foxes.',
  cost: 450,
  radius: 20,
  unlock: 2,
  color: '#ff7a2f',
  hotkey: 't',
  base: () =>
    base({
      range: 140,
      attacks: [
        { id: 'bolt', kind: 'shoot', rate: 1.0, count: 1, spread: 0, proj: { visual: 'bolt', damage: 1, pierce: 3, dmgType: 'energy', speed: 760, radius: 8 } },
      ],
    }),
  pathNames: ['Inferno', 'Arcane', 'Spirit'],
  paths: [
    [
      {
        name: 'Fire Bolt',
        cost: 300,
        desc: 'Bolts set gloops on fire.',
        apply: (s) => {
          const p = atk(s, 'bolt', 'shoot').proj;
          p.visual = 'firebolt';
          p.dmgType = 'fire';
          p.statuses = [...(p.statuses ?? []), { kind: 'burn', dps: 1, duration: 3, boss: 1, dmgType: 'fire' }];
        },
      },
      {
        name: 'Fireball',
        cost: 700,
        desc: 'Also hurls explosive fireballs.',
        apply: (s) => {
          s.attacks.push({
            id: 'fireball',
            kind: 'shoot',
            rate: 2.2,
            count: 1,
            spread: 0,
            proj: {
              visual: 'fireball',
              damage: 0,
              pierce: 1,
              dmgType: 'fire',
              speed: 520,
              radius: 11,
              explode: { radius: 46, damage: 2, pierce: 16, dmgType: 'fire', visual: 'fire', statuses: [{ kind: 'burn', dps: 1, duration: 3, boss: 1, dmgType: 'fire' }] },
            },
          });
        },
      },
      {
        name: "Dragon's Breath",
        cost: 2200,
        desc: 'Breathes a constant stream of fire at nearby gloops.',
        apply: (s) => {
          s.attacks.push({
            id: 'breath',
            kind: 'shoot',
            rate: 0.07,
            count: 1,
            spread: 0,
            jitter: 12,
            rangeMul: 0.7,
            proj: { visual: 'flame', damage: 1, pierce: 4, dmgType: 'fire', speed: 430, radius: 13, life: 0.3, statuses: [{ kind: 'burn', dps: 1, duration: 2, boss: 1, dmgType: 'fire' }] },
          });
        },
      },
      {
        name: 'Phoenix',
        cost: 12000,
        desc: 'Summons a phoenix that soars around raining fire.',
        apply: (s) => {
          s.attacks.push({
            id: 'phoenix',
            kind: 'drone',
            rate: 1,
            count: 1,
            speed: 340,
            droneRate: 0.22,
            visual: 'phoenix',
            proj: { visual: 'firebolt', damage: 5, pierce: 5, dmgType: 'fire', speed: 800, radius: 9, statuses: [{ kind: 'burn', dps: 3, duration: 3, boss: 1, dmgType: 'fire' }] },
          });
        },
      },
      {
        name: 'Nine-Tailed Inferno',
        cost: 45000,
        desc: 'All fire magic massively empowered. Ability: Kitsune Firestorm.',
        apply: (s) => {
          atk(s, 'bolt', 'shoot').proj.damage += 6;
          atk(s, 'breath', 'shoot').proj.damage = 5;
          atk(s, 'fireball', 'shoot').proj.explode!.damage = 12;
          atk(s, 'phoenix', 'drone').proj.damage = 15;
          setAbility(s, { id: 'firestorm', name: 'Kitsune Firestorm', icon: '🔥', desc: 'Engulf the whole map: 600 damage and a fierce burn.', cooldown: 60, params: { damage: 600, burn: 30, duration: 6 } });
        },
      },
    ],
    [
      { name: 'Focus', cost: 150, desc: '+3 pierce and +15 range.', apply: (s) => { atk(s, 'bolt', 'shoot').proj.pierce += 3; s.range += 15; } },
      {
        name: 'Arcane Missiles',
        cost: 400,
        desc: 'Bolts home in on gloops.',
        apply: (s) => {
          const p = atk(s, 'bolt', 'shoot').proj;
          p.homing = 6;
          p.speed += 200;
        },
      },
      {
        name: 'Arcane Nova',
        cost: 1500,
        desc: 'Bolts explode in arcane bursts and fire faster.',
        apply: (s) => {
          const a = atk(s, 'bolt', 'shoot');
          a.proj.damage += 1;
          a.proj.explode = { radius: 30, damage: 1, pierce: 8, dmgType: 'energy', visual: 'arcane' };
          a.rate *= 0.8;
        },
      },
      {
        name: 'Starfall',
        cost: 5500,
        desc: 'Bolts shatter into 3 seeking stars. +3 damage, +6 pierce.',
        apply: (s) => {
          const p = atk(s, 'bolt', 'shoot').proj;
          p.damage += 3;
          p.pierce += 6;
          p.split = { count: 3, proj: { visual: 'star', damage: 2, pierce: 3, dmgType: 'energy', speed: 520, radius: 7, homing: 7, life: 0.8 } };
        },
      },
      {
        name: 'Archmage',
        cost: 30000,
        desc: 'Unrivalled arcane power: triple speed, +5 damage, +15 pierce, sees Camo.',
        apply: (s) => {
          const a = atk(s, 'bolt', 'shoot');
          a.rate *= 0.35;
          a.proj.damage += 5;
          a.proj.pierce += 15;
          s.camo = true;
        },
      },
    ],
    [
      { name: 'Spirit Sight', cost: 300, desc: 'Detects Camo gloops.', apply: (s) => { s.camo = true; } },
      {
        name: 'Spirit Wisps',
        cost: 1000,
        desc: 'Two wisps orbit the fox and burn gloops they touch.',
        apply: (s) => {
          s.attacks.push({ id: 'wisps', kind: 'orbit', rate: 1, count: 2, orbitRadius: 54, angSpeed: 3, damage: 1, dmgType: 'energy', hitCooldown: 0.35, size: 13, visual: 'wisp' });
        },
      },
      {
        name: 'Spirit Swarm',
        cost: 2500,
        desc: 'Releases a swarm of 6 seeking spirits every few seconds.',
        apply: (s) => {
          s.attacks.push({
            id: 'swarm',
            kind: 'shoot',
            rate: 3,
            count: 6,
            spread: 360,
            rangeMul: 1.5,
            proj: { visual: 'spirit', damage: 2, pierce: 4, dmgType: 'energy', speed: 360, radius: 9, homing: 5, life: 3 },
          });
        },
      },
      {
        name: 'Ghost Fox Pack',
        cost: 9000,
        desc: 'Spirit foxes charge backwards down the track, trampling gloops.',
        apply: (s) => {
          s.attacks.push({ id: 'foxes', kind: 'runner', rate: 3.5, damage: 3, dmgType: 'normal', pierce: 30, speed: 260, size: 18, visual: 'foxspirit' });
        },
      },
      {
        name: 'Spirit Queen',
        cost: 32000,
        desc: 'An endless stampede of mighty spirit foxes that shove bosses back.',
        apply: (s) => {
          const r = atk(s, 'foxes', 'runner');
          r.rate = 1.4;
          r.damage = 9;
          r.pierce = 140;
          r.bossBonus = 30;
          r.knockback = 6;
          r.size = 22;
          const w = atk(s, 'wisps', 'orbit');
          w.count = 4;
          w.damage = 6;
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------------------------
// ZAP — Thunder frog. Chain lightning and a very long tongue.
// ---------------------------------------------------------------------------------------------
const zap: TowerDef = {
  id: 'zap',
  name: 'Zap',
  species: 'Thunder Frog',
  role: 'Magic',
  desc: 'Croaks out lightning that chains through packs of gloops.',
  cost: 600,
  radius: 21,
  unlock: 3,
  color: '#46d36b',
  hotkey: 'y',
  base: () =>
    base({
      range: 140,
      attacks: [{ id: 'zap', kind: 'chain', rate: 1.3, damage: 1, dmgType: 'energy', chains: 4, chainRange: 85 }],
    }),
  pathNames: ['Storm', 'Tongue', 'Static'],
  paths: [
    [
      { name: 'Charged Up', cost: 300, desc: 'Lightning jumps to 3 more gloops.', apply: (s) => { atk(s, 'zap', 'chain').chains += 3; } },
      {
        name: 'High Voltage',
        cost: 600,
        desc: '+1 damage and longer jumps.',
        apply: (s) => {
          const a = atk(s, 'zap', 'chain');
          a.damage += 1;
          a.chainRange += 20;
        },
      },
      {
        name: 'Thunderhead',
        cost: 2200,
        desc: 'Calls down lightning strikes on gloops in range.',
        apply: (s) => {
          s.attacks.push({ id: 'storm', kind: 'strike', rate: 1.2, count: 3, damage: 3, dmgType: 'energy', radius: 34, pierce: 12, visual: 'lightning' });
        },
      },
      {
        name: 'Tempest',
        cost: 6000,
        desc: '16-gloop chains that stun. More strikes.',
        apply: (s) => {
          const a = atk(s, 'zap', 'chain');
          a.chains = 16;
          a.damage = 3;
          a.statuses = [{ kind: 'stun', duration: 0.15, boss: 0 }];
          atk(s, 'storm', 'strike').count = 5;
        },
      },
      {
        name: 'Storm God',
        cost: 40000,
        desc: 'Godlike lightning. Ability: Superstorm strikes the whole map.',
        apply: (s) => {
          const a = atk(s, 'zap', 'chain');
          a.damage = 8;
          a.chains = 30;
          atk(s, 'storm', 'strike').damage = 12;
          setAbility(s, { id: 'superstorm', name: 'Superstorm', icon: '⛈️', desc: 'Lightning strikes everywhere for 8 seconds.', cooldown: 50, params: { duration: 8, damage: 30 } });
        },
      },
    ],
    [
      {
        name: 'Snack Attack',
        cost: 250,
        desc: 'Lashes out its tongue to gobble a gloop.',
        apply: (s) => {
          s.attacks.push({ id: 'tongue', kind: 'tongue', rate: 1.6, damage: 3, rangeAdd: 0, swallowTier: 0, bossDamage: 0, bossKnockback: 0 });
        },
      },
      {
        name: 'Long Tongue',
        cost: 450,
        desc: 'Longer, faster, hungrier tongue.',
        apply: (s) => {
          const t = atk(s, 'tongue', 'tongue');
          t.rangeAdd = 60;
          t.damage = 6;
          t.rate = 1.3;
        },
      },
      {
        name: 'Glob Grabber',
        cost: 2400,
        desc: 'Grabs bosses, dealing 40 damage and dragging them back.',
        apply: (s) => {
          const t = atk(s, 'tongue', 'tongue');
          t.bossDamage = 40;
          t.bossKnockback = 70;
        },
      },
      {
        name: 'Gulp!',
        cost: 7500,
        desc: 'Swallows Globs whole! Bigger bosses take 400 damage.',
        apply: (s) => {
          const t = atk(s, 'tongue', 'tongue');
          t.swallowTier = 10;
          t.bossDamage = 400;
          t.bossKnockback = 120;
          t.rate = 2;
        },
      },
      {
        name: 'Frog Leviathan',
        cost: 30000,
        desc: 'Swallows Mega Globs whole and deals 3000 to anything bigger.',
        apply: (s) => {
          const t = atk(s, 'tongue', 'tongue');
          t.swallowTier = 11;
          t.bossDamage = 3000;
          t.rate = 1.4;
        },
      },
    ],
    [
      {
        name: 'Static Skin',
        cost: 200,
        desc: '+20 range and zaps faster.',
        apply: (s) => {
          s.range += 20;
          atk(s, 'zap', 'chain').rate *= 0.85;
        },
      },
      {
        name: 'Ionize',
        cost: 500,
        desc: 'Detects Camo and zapped gloops lose their camouflage.',
        apply: (s) => {
          s.camo = true;
          const a = atk(s, 'zap', 'chain');
          a.statuses = [...(a.statuses ?? []), { kind: 'decamo' }];
        },
      },
      {
        name: 'Overcharge',
        cost: 1800,
        desc: 'Shocked gloops take +2 damage from the next hit. +2 chains.',
        apply: (s) => {
          const a = atk(s, 'zap', 'chain');
          a.chains += 2;
          a.statuses = [...(a.statuses ?? []), { kind: 'shock', value: 2, duration: 3, boss: 1 }];
        },
      },
      {
        name: 'Tesla Pads',
        cost: 5000,
        desc: 'Places electric lily pads on the track that zap passing gloops.',
        apply: (s) => {
          s.attacks.push({ id: 'coils', kind: 'trap', rate: 3, max: 4, life: 25, radius: 34, damage: 2, dmgType: 'energy', pierce: 6, tick: 0.5, visual: 'coil' });
        },
      },
      {
        name: 'Power Grid',
        cost: 25000,
        desc: 'Powers nearby towers: +30% attack speed. Pads hit much harder.',
        apply: (s) => {
          s.buffAura = { ...(s.buffAura ?? {}), range: 200, rateMul: 1.3 };
          atk(s, 'zap', 'chain').chains += 10;
          const c = atk(s, 'coils', 'trap');
          c.damage = 6;
          c.pierce = 12;
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------------------------
// BUZZ — Bee hive. Autonomous drones.
// ---------------------------------------------------------------------------------------------
const buzz: TowerDef = {
  id: 'buzz',
  name: 'Buzz',
  species: 'Bee Hive',
  role: 'Military',
  desc: 'Sends out bees that hunt gloops anywhere near the hive.',
  cost: 700,
  radius: 23,
  unlock: 4,
  color: '#ffbf1f',
  hotkey: 'u',
  base: () =>
    base({
      range: 230,
      attacks: [
        { id: 'bees', kind: 'drone', rate: 1, count: 1, speed: 290, droneRate: 0.42, visual: 'bee', proj: { visual: 'stinger', damage: 1, pierce: 2, dmgType: 'sharp', speed: 720, radius: 6 } },
      ],
    }),
  pathNames: ['Swarm', 'Venom', 'Royal'],
  paths: [
    [
      { name: 'Worker Bees', cost: 400, desc: '+1 bee.', apply: (s) => { atk(s, 'bees', 'drone').count = 2; } },
      { name: 'Busy Hive', cost: 800, desc: '+1 bee and faster flight.', apply: (s) => { const b = atk(s, 'bees', 'drone'); b.count = 3; b.speed *= 1.3; } },
      { name: 'Swarm', cost: 2500, desc: '6 bees with +1 pierce.', apply: (s) => { const b = atk(s, 'bees', 'drone'); b.count = 6; b.proj.pierce += 1; } },
      { name: 'Bee Legion', cost: 8000, desc: '10 bees with +1 damage.', apply: (s) => { const b = atk(s, 'bees', 'drone'); b.count = 10; b.proj.damage += 1; } },
      {
        name: 'Hive Mind',
        cost: 35000,
        desc: '18 bees, +2 damage. Ability: Killer Swarm adds 30 bees for 10s.',
        apply: (s) => {
          const b = atk(s, 'bees', 'drone');
          b.count = 18;
          b.proj.damage += 2;
          setAbility(s, { id: 'killerSwarm', name: 'Killer Swarm', icon: '🐝', desc: '+30 bees for 10 seconds.', cooldown: 45, params: { bees: 30, duration: 10 } });
        },
      },
    ],
    [
      {
        name: 'Venom Stingers',
        cost: 300,
        desc: 'Stings poison gloops (hits every gloop type).',
        apply: (s) => {
          const p = atk(s, 'bees', 'drone').proj;
          p.statuses = [...(p.statuses ?? []), { kind: 'poison', dps: 1, duration: 4, boss: 1, dmgType: 'normal' }];
        },
      },
      {
        name: 'Toxic Venom',
        cost: 700,
        desc: 'Stronger, longer poison.',
        apply: (s) => {
          const st = atk(s, 'bees', 'drone').proj.statuses!.find((x) => x.kind === 'poison')!;
          st.dps = 2;
          st.duration = 5;
        },
      },
      {
        name: 'Wasp Squadron',
        cost: 2700,
        desc: 'Bees become wasps: 2 damage, faster stings, pierce Iron.',
        apply: (s) => {
          const b = atk(s, 'bees', 'drone');
          b.visual = 'wasp';
          b.proj.damage += 1;
          b.proj.dmgType = 'normal';
          b.droneRate *= 0.6;
        },
      },
      {
        name: 'Hornet Missiles',
        cost: 7000,
        desc: 'Wasps fire explosive stingers that hurt bosses 3x.',
        apply: (s) => {
          const p = atk(s, 'bees', 'drone').proj;
          p.explode = { radius: 26, damage: 2, pierce: 8, dmgType: 'explosive', visual: 'mini' };
          p.bossMul = 3;
        },
      },
      {
        name: 'Murder Hornets',
        cost: 30000,
        desc: 'Terrifying hornets: 8 damage, 5x vs bosses, deadly poison.',
        apply: (s) => {
          const p = atk(s, 'bees', 'drone').proj;
          p.damage += 6;
          p.bossMul = 5;
          const st = p.statuses!.find((x) => x.kind === 'poison')!;
          st.dps = 10;
        },
      },
    ],
    [
      { name: 'Royal Jelly', cost: 250, desc: 'Bees can find Camo gloops.', apply: (s) => { s.camo = true; } },
      {
        name: 'Honey Trap',
        cost: 600,
        desc: 'Drops sticky honey on the track that slows gloops.',
        apply: (s) => {
          s.attacks.push({ id: 'honey', kind: 'trap', rate: 4, max: 3, life: 20, radius: 38, damage: 0, dmgType: 'normal', pierce: 999, tick: 0.2, visual: 'honey', statuses: [{ kind: 'slow', value: 0.55, duration: 0.4, boss: 0.5 }] });
        },
      },
      {
        name: 'Queen Bee',
        cost: 2000,
        desc: 'A royal queen joins the hunt and hurries the workers.',
        apply: (s) => {
          s.attacks.push({ id: 'queen', kind: 'drone', rate: 1, count: 1, speed: 230, droneRate: 0.5, visual: 'queen', proj: { visual: 'stinger', damage: 4, pierce: 6, dmgType: 'normal', speed: 820, radius: 8, size: 1.5 } });
          atk(s, 'bees', 'drone').droneRate *= 0.77;
        },
      },
      {
        name: 'Honey Glaze',
        cost: 6000,
        desc: 'Glazed gloops take +1 damage from every hit. More honey.',
        apply: (s) => {
          const h = atk(s, 'honey', 'trap');
          h.max = 5;
          h.statuses = [{ kind: 'slow', value: 0.5, duration: 0.4, boss: 0.5 }, { kind: 'vuln', value: 1, duration: 1.2, boss: 1 }];
        },
      },
      {
        name: 'Hive Empress',
        cost: 28000,
        desc: 'An unstoppable queen. Ability: Royal Decree triples hive speed.',
        apply: (s) => {
          const q = atk(s, 'queen', 'drone');
          q.proj.damage = 20;
          q.proj.pierce = 20;
          q.proj.size = 2;
          setAbility(s, { id: 'royalDecree', name: 'Royal Decree', icon: '👑', desc: 'The whole hive attacks 3x faster for 10s.', cooldown: 40, params: { duration: 10, mul: 3 } });
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------------------------
// ACORN — Squirrel. Economy.
// ---------------------------------------------------------------------------------------------
const acorn: TowerDef = {
  id: 'acorn',
  name: 'Nutty',
  species: 'Squirrel Farmer',
  role: 'Support',
  desc: 'Grows golden acorns every round. Tap them to cash in!',
  cost: 1000,
  radius: 24,
  unlock: 5,
  color: '#e0a23a',
  hotkey: 'i',
  base: () =>
    base({
      range: 80,
      income: { perDrop: 20, drops: 4, autoCollect: false, direct: false, bonusPerRound: 0 },
    }),
  pathNames: ['Harvest', 'Bank', 'Market'],
  paths: [
    [
      { name: 'More Acorns', cost: 500, desc: '6 acorns per round.', apply: (s) => { s.income!.drops += 2; } },
      { name: 'Golden Acorns', cost: 700, desc: 'Acorns are worth $30.', apply: (s) => { s.income!.perDrop = 30; } },
      { name: 'Acorn Orchard', cost: 3000, desc: '10 acorns per round.', apply: (s) => { s.income!.drops += 4; } },
      { name: 'Mega Grove', cost: 7500, desc: 'Acorns are worth $60.', apply: (s) => { s.income!.perDrop = 60; } },
      { name: 'World Tree', cost: 50000, desc: '12 enchanted acorns worth $250 each.', apply: (s) => { s.income!.perDrop = 250; s.income!.drops += 2; } },
    ],
    [
      { name: 'Nut Stash', cost: 400, desc: 'Acorns go into a stash that earns 15% interest each round. Withdraw any time.', apply: (s) => { s.bank = { capacity: 7000, interest: 0.15 }; } },
      { name: 'Deep Vault', cost: 800, desc: 'Stash holds up to $10,000.', apply: (s) => { s.bank!.capacity = 10000; } },
      { name: 'Squirrel Bank', cost: 3500, desc: '$15,000 capacity and 20% interest.', apply: (s) => { s.bank!.capacity = 15000; s.bank!.interest = 0.2; } },
      { name: 'Golden Hoard', cost: 7000, desc: '+$250 per round and $25,000 capacity.', apply: (s) => { s.income!.bonusPerRound += 250; s.bank!.capacity = 25000; } },
      { name: 'Nut Empire', cost: 30000, desc: '$60,000 capacity, 25% interest, +$1,500 per round.', apply: (s) => { s.bank!.capacity = 60000; s.bank!.interest = 0.25; s.income!.bonusPerRound += 1500; } },
    ],
    [
      { name: 'Long Arms', cost: 250, desc: 'Acorns are collected automatically.', apply: (s) => { s.income!.autoCollect = true; } },
      { name: 'Haggler', cost: 600, desc: '+2 acorns per round.', apply: (s) => { s.income!.drops += 2; } },
      { name: 'Acorn Market', cost: 2700, desc: 'Sells the harvest directly for +$5 each.', apply: (s) => { s.income!.direct = true; s.income!.perDrop += 5; } },
      {
        name: 'Trade Hub',
        cost: 15000,
        desc: '+$1,000 per round. Towers nearby get 10% off.',
        apply: (s) => {
          s.income!.bonusPerRound += 1000;
          s.range = 180;
          s.buffAura = { ...(s.buffAura ?? {}), discount: 0.1 };
        },
      },
      {
        name: 'Nut Exchange',
        cost: 60000,
        desc: '+$5,000 per round. Ability: Jackpot pays $5,000.',
        apply: (s) => {
          s.income!.bonusPerRound += 5000;
          setAbility(s, { id: 'jackpot', name: 'Jackpot', icon: '💰', desc: 'Instantly earn $5,000.', cooldown: 60, params: { cash: 5000 } });
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------------------------
// DOJO — Panda master. Pure support aura.
// ---------------------------------------------------------------------------------------------
const dojo: TowerDef = {
  id: 'dojo',
  name: 'Dojo',
  species: 'Panda Master',
  role: 'Support',
  desc: 'A wise panda that trains every tower nearby. Gets stronger with upgrades.',
  cost: 1100,
  radius: 26,
  unlock: 6,
  color: '#e8e8e8',
  hotkey: 'o',
  base: () =>
    base({
      range: 150,
      buffAura: { rangeMul: 1.05 },
    }),
  pathNames: ['Training', 'Wisdom', 'Commerce'],
  paths: [
    [
      { name: 'Focus Training', cost: 250, desc: 'Nearby towers get +10% range.', apply: (s) => { s.buffAura!.rangeMul = 1.1; } },
      { name: 'Swift Strikes', cost: 1200, desc: 'Nearby towers attack 15% faster.', apply: (s) => { s.buffAura!.rateMul = 1.15; } },
      { name: 'Master Dojo', cost: 3500, desc: 'Nearby towers: +1 pierce, 20% faster.', apply: (s) => { s.buffAura!.pierceAdd = 1; s.buffAura!.rateMul = 1.2; } },
      {
        name: 'Grandmaster',
        cost: 15000,
        desc: 'Nearby towers: +1 damage. Ability: Focus doubles their speed.',
        apply: (s) => {
          s.buffAura!.damageAdd = 1;
          s.buffAura!.rateMul = 1.25;
          setAbility(s, { id: 'focus', name: 'Inner Focus', icon: '☯️', desc: 'Towers in range attack 2x faster for 10s.', cooldown: 50, params: { duration: 10, mul: 2 } });
        },
      },
      {
        name: 'Legendary Dojo',
        cost: 25000,
        desc: 'Nearby towers: +2 damage, +2 pierce, 35% faster. +40 range.',
        apply: (s) => {
          const b = s.buffAura!;
          b.damageAdd = 2;
          b.pierceAdd = 2;
          b.rateMul = 1.35;
          s.range += 40;
        },
      },
    ],
    [
      { name: 'Lantern Watch', cost: 300, desc: 'Nearby towers detect Camo.', apply: (s) => { s.buffAura!.camo = true; } },
      { name: 'Iron Fists', cost: 1500, desc: 'Nearby towers can damage every gloop type.', apply: (s) => { s.buffAura!.canHitAll = true; } },
      {
        name: 'Pressure Points',
        cost: 5000,
        desc: 'Gloops in range lose Camo and take +1 damage from all hits.',
        apply: (s) => {
          s.attacks.push({ id: 'pressure', kind: 'aura', rate: 0.25, slow: 1, slowBoss: 1, dps: 0, dmgType: 'normal', statuses: [{ kind: 'decamo' }, { kind: 'vuln', value: 1, duration: 0.4, boss: 1 }] });
        },
      },
      {
        name: 'Tranquil Garden',
        cost: 9000,
        desc: 'Gloops in range are calmed: slowed and take +2 damage.',
        apply: (s) => {
          const a = atk(s, 'pressure', 'aura');
          a.slow = 0.85;
          a.slowBoss = 0.93;
          a.statuses = [{ kind: 'decamo' }, { kind: 'vuln', value: 2, duration: 0.4, boss: 1 }];
        },
      },
      {
        name: 'Zen Master',
        cost: 20000,
        desc: 'Enlightenment: +60 range, towers gain +2 pierce, gloops take +3 damage.',
        apply: (s) => {
          s.range += 60;
          s.buffAura!.pierceAdd = (s.buffAura!.pierceAdd ?? 0) + 2;
          const a = atk(s, 'pressure', 'aura');
          a.statuses = [{ kind: 'decamo' }, { kind: 'vuln', value: 3, duration: 0.4, boss: 1 }];
        },
      },
    ],
    [
      { name: 'Bulk Deals', cost: 300, desc: 'Towers and upgrades in range cost 5% less.', apply: (s) => { s.buffAura!.discount = 0.05; } },
      { name: 'Bamboo Trade', cost: 700, desc: '10% discount in range.', apply: (s) => { s.buffAura!.discount = 0.1; } },
      { name: 'Tea House', cost: 3500, desc: 'Earns +$300 every round.', apply: (s) => { s.income = { perDrop: 0, drops: 0, autoCollect: true, direct: true, bonusPerRound: 300 }; } },
      { name: 'Lucky Cat', cost: 8000, desc: 'Pops by nearby towers earn 25% more cash.', apply: (s) => { s.buffAura!.cashMul = 1.25; } },
      {
        name: 'Panda Republic',
        cost: 25000,
        desc: '20% discount, +$2,500 per round, +40% pop cash nearby.',
        apply: (s) => {
          s.buffAura!.discount = 0.2;
          s.buffAura!.cashMul = 1.4;
          s.income!.bonusPerRound += 2200;
        },
      },
    ],
  ],
};

export const TOWERS: Record<TowerId, TowerDef> = { spike, boomer, frost, hoot, ember, zap, buzz, acorn, dojo };
export const TOWER_ORDER: TowerId[] = ['spike', 'boomer', 'frost', 'hoot', 'ember', 'zap', 'buzz', 'acorn', 'dojo'];
