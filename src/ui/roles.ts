/**
 * Raccoon roles (Basis / Military / Magic / Support, plus heroes) as the UI shows them: a colour
 * per role (tokens --role-* in styles.css, picked up through the .role-<name> classes as
 * --rc / --rc-l / --rc-d), a small glyph badge and the display order (grouped by role like BTD6).
 * TOWER_ORDER itself stays the unlock order (daily challenges are seeded from it).
 */
import { TOWERS, TOWER_ORDER } from '../game/towers';
import type { TowerDef, TowerId } from '../game/towerTypes';
import { h } from './dom';
import { t } from '../i18n';

export type Role = TowerDef['role'];
export type RoleKey = Role | 'Hero';

export const ROLE_ORDER: readonly Role[] = ['Primary', 'Military', 'Magic', 'Support'];

/** Every raccoon, grouped by role (unlock order inside a group): shop, roster, atlas. */
export const TOWERS_BY_ROLE: readonly TowerId[] = ROLE_ORDER.flatMap((r) => TOWER_ORDER.filter((id) => TOWERS[id].role === r));

/** The raccoons of each role, in display order (empty roles left out). */
export function roleGroups(ids: readonly TowerId[] = TOWER_ORDER): { role: Role; ids: TowerId[] }[] {
  return ROLE_ORDER.map((role) => ({ role, ids: ids.filter((id) => TOWERS[id].role === role) })).filter((g) => g.ids.length > 0);
}

/** Sorts raccoon ids into the role display order. */
export function byRole(ids: readonly TowerId[]): TowerId[] {
  return [...ids].sort((a, b) => TOWERS_BY_ROLE.indexOf(a) - TOWERS_BY_ROLE.indexOf(b));
}

/** CSS class that sets the role colours (--rc, --rc-l, --rc-d) on an element and its children. */
export const roleCls = (r: RoleKey) => 'role-' + r.toLowerCase();

export const towerRoleCls = (id: TowerId) => roleCls(TOWERS[id].role);

/** Role label as the player reads it ("Basis", "Militär", "Magie", "Support", "Held"). */
export const roleName = (r: RoleKey) => t(r);

// 24x24 glyphs drawn like the painted icons: cream fill with a dark ink outline. Each must stay
// clear of the UI's other symbols: chevrons mean upgrade / tier unlock, "+" means buy, a ring
// means targeting, the cog is settings, the heart is lives.
const GLYPH: Record<RoleKey, string> = {
  // a dart, tip to the top right
  Primary: 'M20.5 3.5 18.6 11l-2.3-1.6-6.6 6.6.4 3.6-2.6 1.7-.9-3.8-3.8-.9 1.7-2.6 3.6.4 6.6-6.6L13 5.4z',
  // a shield
  Military: 'M12 2.9 19.6 5.6v5.9c0 4.6-3 7.9-7.6 9.8-4.6-1.9-7.6-5.2-7.6-9.8V5.6z',
  // a four-point sparkle
  Magic: 'M12 2.8c1 4.7 3.5 7.2 8.6 9.2-5.1 2-7.6 4.5-8.6 9.2-1-4.7-3.5-7.2-8.6-9.2 5.1-2 7.6-4.5 8.6-9.2z',
  // a sprout (helps the others grow): stem and two leaves
  Support: 'M10.9 21.2V12.6h2.2v8.6zM11.6 14.6C6.2 15.8 2.6 12.4 2.8 6.6 8.6 5.6 12.4 9.2 11.6 14.6zM12.4 12.2C11.4 6.6 15.2 2.6 21.2 2.8 21.8 8.8 17.8 12.8 12.4 12.2z',
  // a crown
  Hero: 'M4 18h16l1.2-10.5-5.2 3.8L12 4.8l-4 6.5-5.2-3.8z',
};

function glyphSvg(r: RoleKey): string {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${GLYPH[r]}" fill="#fffaf0" stroke="#120a2b" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"/></svg>`;
}

/** Round role badge (role colour + glyph). */
export function roleIcon(r: RoleKey, cls = ''): HTMLElement {
  return h('span', { class: `role-ico ${roleCls(r)} ${cls}`.trim(), 'aria-hidden': 'true', html: glyphSvg(r) });
}

/** Role chip: badge + name, in the role colour. */
export function roleChip(r: RoleKey, cls = ''): HTMLElement {
  return h('span', { class: `chip role-chip ${roleCls(r)} ${cls}`.trim(), title: roleName(r) }, roleIcon(r), h('span', null, roleName(r)));
}
