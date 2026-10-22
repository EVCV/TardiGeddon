// Every weapon: how it's used (the same tag the game's weapon panel shows),
// what it does, and whether the wind pushes it. All of it comes from the
// game's own data (src/sim/weapons.ts, src/ui/weaponUse.ts), so it can't go
// out of date.

import { useMemo, useState } from 'react';
import { PANEL_WEAPONS, WEAPONS, type WeaponDef } from '../../../src/sim/weapons';
import { weaponUse, type WeaponUseId } from '../../../src/ui/weaponUse';
import { PLAY_URL } from '../config';
import { Link } from '../router';

/** Does the wind push it (its own shot, or the drops it rains down)? */
function windy(w: WeaponDef): boolean {
  const spec = w.projectile ?? (w.strike ? WEAPONS[w.strike.weapon].projectile : w.shower ? WEAPONS[w.shower.weapon].projectile : undefined);
  return (spec?.windFactor ?? 0) > 0;
}

function ammo(w: WeaponDef): string {
  if (w.super) return 'Superweapon';
  if (w.ammo < 0) return 'Unlimited';
  return `${w.ammo} per match`;
}

const LIST = PANEL_WEAPONS.filter((w) => w.id !== 'skip');

/** The filters: one per kind of use that some weapon has, in the order they first appear. */
const KINDS: { id: WeaponUseId; icon: string; label: string }[] = [];
for (const w of LIST) {
  const u = weaponUse(w);
  if (!KINDS.some((k) => k.id === u.id)) KINDS.push(u);
}

export function Weapons() {
  const [kind, setKind] = useState<WeaponUseId | 'all'>('all');
  const shown = useMemo(() => (kind === 'all' ? LIST : LIST.filter((w) => weaponUse(w).id === kind)), [kind]);

  return (
    <div className="page page-wide weapons-page">
      <h1 className="display section-title">Weapons</h1>
      <p className="lead">
        {LIST.length} ways to ruin someone’s day. Each one has a tag in the game’s weapon panel saying how it’s used:
        aim and throw it, pick a spot on the map, or fire it straight. Hover over a weapon in the game (or pick it on a
        phone) to see what it does.
      </p>
      <div className="filter-row" role="group" aria-label="Show weapons by how they're used">
        <button className={`chip-btn${kind === 'all' ? ' on' : ''}`} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
          All
        </button>
        {KINDS.map((k) => (
          <button key={k.id} className={`chip-btn${kind === k.id ? ' on' : ''}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            <span aria-hidden="true">{k.icon}</span> {k.label}
          </button>
        ))}
      </div>
      <ul className="weapon-grid">
        {shown.map((w) => {
          const use = weaponUse(w);
          return (
            <li key={w.id} className={`weapon-card paper${w.super ? ' super' : ''}`}>
              <span className="weapon-icon" aria-hidden="true">
                {w.icon}
              </span>
              <div className="weapon-body">
                <h2>{w.name}</h2>
                <p className="weapon-tags">
                  <span className="tag">
                    <span aria-hidden="true">{use.icon}</span> {use.label}
                  </span>
                  {windy(w) && <span className="tag tag-wind">💨 Wind pushes it</span>}
                  {w.locked && <span className="tag tag-slime">🟢 Season weapon</span>}
                </p>
                <p>{w.blurb}</p>
                <p className="weapon-ammo">{ammo(w)}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <section className="paper note-card">
        <h2 className="display">Good to know</h2>
        <ul>
          <li>
            <strong>Superweapons</strong> (gold) come in crates, or switch them on in the match’s Customise settings.
          </li>
          <li>
            <strong>Season weapons</strong> are unlocked with Slime, which you earn by playing. They can never be bought:
            coins only ever buy looks. Once you’ve unlocked one, everyone in the matches you start can use it.
          </li>
          <li>
            <strong>Some game styles</strong> change the line-up: Bazookas &amp; Grenades has only those two, and Rope Race
            has only the Silk Rope and the Leaf Parachute.
          </li>
        </ul>
        <p>
          New to it all? <Link to="/how-to-play">How to play</Link> explains aiming, the wind and fuses.
        </p>
      </section>
      <p className="page-cta">
        <a className="btn btn-play" href={PLAY_URL}>
          Try them out
        </a>
      </p>
    </div>
  );
}
