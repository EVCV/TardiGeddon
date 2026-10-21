// In-game HUD (DOM overlay): turn timer, wind, team health, weapon panel,
// banners and touch controls.

import type { TeamTally } from '../stats/tally';
import { emblemSvg } from '../render/emblems';
import { teamLabel } from '../net/blocked';
import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, PRESS_JUMP, TICK_RATE, type WorldState } from '../sim/types';
import { PANEL_WEAPONS, WEAPONS, type WeaponDef } from '../sim/weapons';
import { activeTardi, activeTeam, girderFits } from '../sim/world';
import type { InputCollector } from '../input/input';
import { controls } from '../input/controls';
import { hex, shown, teamSymbol } from '../render/palette';
import { t } from '../i18n/i18n';

export interface HudHooks {
  onQuit: () => void;
  /** Turns all sound off (or back on); true when now silent. */
  onToggleMute: () => boolean;
  /** Is all sound off as the match starts? */
  muted: boolean;
  /** Online: show the other players, to report or block them. */
  onPlayers?: () => void;
}

/** Do the up/down (aim) controls do anything with this weapon? */
export function usesUpDown(def: WeaponDef, onRope: boolean): boolean {
  return onRope || def.kind === 'charge' || def.kind === 'hitscan' || def.kind === 'rope' || !!def.girder;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Everyone's numbers, winner first. */
function statsTable(s: WorldState, stats: readonly TeamTally[]): HTMLElement {
  const w = s.turn.winner;
  const wrap = el('div', 'gameover-stats');
  const table = el('table');
  table.innerHTML = `<caption class="sr-only">${t('Match statistics')}</caption><thead><tr><th scope="col">${t('Team')}</th><th scope="col">${t('Damage')}</th><th scope="col">${t('Popped')}</th><th scope="col">${t('Best turn')}</th><th scope="col">${t('Shots')}</th><th scope="col">${t('Own goals')}</th></tr></thead>`;
  const body = el('tbody');
  const order = s.teams.map((tm) => tm.id).sort((a, b) => (a === w ? -1 : b === w ? 1 : stats[b].damage - stats[a].damage));
  // A star for the best in each column.
  const best = (k: 'damage' | 'popped' | 'bestTurn') => Math.max(1, ...stats.map((x) => x[k]));
  for (const id of order) {
    const tm = s.teams[id];
    const st = stats[id];
    const row = el('tr');
    if (id === w) row.className = 'winner';
    const name = el('th');
    name.scope = 'row';
    name.style.setProperty('--team', hex(shown(tm.color)));
    if (tm.emblem) {
      const badge = el('span', 'team-emblem');
      badge.innerHTML = emblemSvg(tm.emblem, t('{team} emblem', { team: teamLabel(tm) }));
      name.append(badge);
    }
    name.append(document.createTextNode(` ${teamSymbol(tm.color)}${teamLabel(tm)}`));
    const cell = (v: number, top = false) => el('td', top && v > 0 ? 'top' : '', `${v}${top && v > 0 ? ' ★' : ''}`);
    row.append(
      name,
      cell(st.damage, st.damage === best('damage')),
      cell(st.popped, st.popped === best('popped')),
      cell(st.bestTurn, st.bestTurn === best('bestTurn')),
      cell(st.shots),
    );
    // Own goals: damage to your own team, and any of your own you popped.
    row.append(el('td', '', st.selfDamage || st.selfPopped ? (st.selfPopped ? t('{damage} · {n} popped', { damage: st.selfDamage, n: st.selfPopped }) : String(st.selfDamage)) : '0'));
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  return wrap;
}

export class Hud {
  readonly root = el('div', 'hud');
  private timer = el('div', 'hud-timer');
  private round = el('div', 'hud-round');
  private wind = el('div', 'hud-wind');
  private windBar = el('div', 'hud-wind-bar');
  private windFill = el('div', 'hud-wind-fill');
  /** "WIND" beside the bar (not on it, where it was hard to read), with arrows for how hard it blows. */
  private windLabel = el('span', 'hud-wind-label');
  private teams = el('div', 'hud-teams');
  private banner = el('div', 'hud-banner');
  private hint = el('div', 'hud-hint');
  private weaponBtn = el('button', 'hud-btn hud-weapon');
  private fuseBtn = el('button', 'hud-btn hud-fuse');
  private panel = el('div', 'weapon-panel hidden');
  private gameOver = el('div', 'overlay hidden');
  private touch = el('div', 'touch-pad');
  /** The ▲▼ aim buttons: hidden for weapons that don't aim (strikes, drops...). */
  private aimPad: HTMLElement | null = null;
  private bannerUntil = 0;
  private lastKey = '';
  private humanTurn = false;

  constructor(
    private input: InputCollector,
    hooks: HudHooks,
    private touchMode: boolean,
  ) {
    this.windBar.append(this.windFill);
    this.wind.append(this.windLabel, this.windBar);
    this.wind.title = t('Wind: it pushes shots, rain and falling things this way. A longer bar is a stronger wind.');
    const top = el('div', 'hud-top');
    const menuBtn = el('button', 'hud-btn', '☰');
    menuBtn.title = t('Quit to menu');
    menuBtn.onclick = () => {
      if (confirm(t('Quit this match?'))) hooks.onQuit();
    };
    const muteBtn = el('button', 'hud-btn', hooks.muted ? '🔇' : '🔊');
    muteBtn.title = t('Sound on/off (music and volume: Settings)');
    muteBtn.onclick = () => (muteBtn.textContent = hooks.onToggleMute() ? '🔇' : '🔊');
    top.append(menuBtn, this.wind, muteBtn);
    if (hooks.onPlayers) {
      const players = el('button', 'hud-btn', '👥');
      players.title = t('Players: report or block');
      players.setAttribute('aria-label', t('Players: report or block'));
      players.onclick = hooks.onPlayers;
      top.append(players);
    }

    this.weaponBtn.onclick = () => this.togglePanel();
    this.fuseBtn.onclick = () => {
      const cur = Number(this.fuseBtn.dataset.fuse ?? 3);
      this.input.command({ t: 'fuse', s: (cur % 5) + 1 });
    };
    const bottom = el('div', 'hud-bottom');
    const tools = el('div', 'hud-tools');
    tools.append(this.fuseBtn, this.weaponBtn);
    const clock = el('div', 'hud-clock');
    clock.append(this.timer, this.round);
    bottom.append(clock, this.teams, tools);

    this.buildPanel();
    this.root.append(top, this.banner, this.hint, bottom, this.panel, this.gameOver);
    if (touchMode) this.buildTouch();
  }

  private buildPanel(): void {
    const grid = el('div', 'weapon-grid');
    for (const w of PANEL_WEAPONS) {
      const b = el('button', 'weapon-cell');
      b.dataset.id = w.id;
      b.innerHTML = `<span class="wi">${w.icon}</span><span class="wn">${t(w.name)}</span><span class="wa"></span>`;
      b.onclick = () => {
        this.input.command({ t: 'weapon', id: w.id });
        this.togglePanel(false);
      };
      grid.append(b);
    }
    const close = el('button', 'hud-btn panel-close', '✕');
    close.setAttribute('aria-label', t('Close'));
    close.onclick = () => this.togglePanel(false);
    this.panel.append(el('h2', '', t('Weapons')), close, grid);
  }

  togglePanel(show?: boolean): void {
    const open = show ?? this.panel.classList.contains('hidden');
    if (open && !this.humanTurn) return;
    this.panel.classList.toggle('hidden', !open);
  }

  get panelOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  private buildTouch(): void {
    const mk = (label: string, cls: string, bit: number, id: string) => {
      const b = el('button', 'touch-btn ' + cls, label);
      // Longer words (some languages): smaller letters, so they stay inside the round button.
      // (Japanese and Chinese characters count double: they're about twice as wide.)
      if ([...label].reduce((n, c) => n + (c.codePointAt(0)! >= 0x2e80 ? 2 : 1), 0) > 4) b.classList.add('long');
      const on = (e: PointerEvent) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        b.classList.add('down');
        if (bit === -1) this.input.press(PRESS_JUMP);
        else this.input.hold(id, bit, true);
      };
      const off = () => {
        b.classList.remove('down');
        if (bit !== -1) this.input.hold(id, bit, false);
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    const left = el('div', 'touch-left');
    left.append(mk('◀', 'walk', BTN_LEFT, 't-left'), mk('▶', 'walk', BTN_RIGHT, 't-right'));
    const right = el('div', 'touch-right');
    const aim = el('div', 'touch-aim');
    aim.append(mk('▲', 'aim', BTN_UP, 't-up'), mk('▼', 'aim', BTN_DOWN, 't-down'));
    this.aimPad = aim;
    right.append(aim, mk(t('JUMP'), 'jump', -1, 't-jump'), mk(t('FIRE'), 'fire', BTN_FIRE, 't-fire'));
    // Settings: button size, and left-handed (sides swapped).
    const c = controls();
    this.touch.classList.add(`touch-size-${c.touchSize}`);
    this.touch.classList.toggle('touch-swap', c.touchSwap);
    this.touch.append(left, right);
    this.root.append(this.touch);
    this.root.classList.add('touch-mode');
  }

  showBanner(text: string, color: number, seconds = 2): void {
    this.banner.textContent = text;
    this.banner.style.color = hex(color);
    this.banner.classList.add('show');
    this.bannerUntil = performance.now() + seconds * 1000;
  }

  /**
   * The end of the match: who won, everyone's numbers, then the winning shot
   * again, sharing, and on to the next game or the menu.
   */
  showGameOver(
    s: WorldState,
    onAgain: () => void,
    onMenu: () => void,
    labels: readonly [string, string] = [t('Play again'), t('Main menu')],
    extra: { stats?: readonly TeamTally[]; onReplay?: () => void; onShare?: () => Promise<string> } = {},
  ): void {
    const w = s.turn.winner;
    this.gameOver.innerHTML = '';
    const box = el('div', 'overlay-box gameover-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('Match over'));
    const title = el('h1', 'title-small', w >= 0 ? t('{team} wins!', { team: `${teamSymbol(s.teams[w].color)}${teamLabel(s.teams[w])}` }) : t('Draw!'));
    if (w >= 0) title.style.color = hex(shown(s.teams[w].color));
    box.append(title);
    if (extra.stats && !s.race) box.append(statsTable(s, extra.stats));
    const tools = el('div', 'gameover-tools');
    if (extra.onReplay) {
      const replay = el('button', 'hud-btn', t('🎬 Winning shot'));
      replay.onclick = extra.onReplay;
      tools.append(replay);
    }
    if (extra.onShare) {
      const share = el('button', 'hud-btn', t('📤 Share'));
      const note = el('span', 'gameover-note');
      note.setAttribute('role', 'status');
      share.onclick = async () => {
        share.disabled = true;
        const what = await extra.onShare!();
        share.disabled = false;
        note.textContent = what === 'saved' ? t('Picture saved, message copied.') : what === 'copied' ? t('Message copied.') : '';
      };
      tools.append(share, note);
    }
    if (tools.childElementCount) box.append(tools);
    const again = el('button', 'big-btn', labels[0]);
    again.onclick = onAgain;
    const menu = el('button', 'big-btn secondary', labels[1]);
    menu.onclick = onMenu;
    const go = el('div', 'gameover-go');
    go.append(again, menu);
    box.append(go);
    this.gameOver.append(box);
    this.gameOver.classList.remove('hidden');
    again.focus();
  }

  /** Hide the end-of-match box (while the winning shot plays again). */
  hideGameOver(): void {
    this.gameOver.classList.add('hidden');
  }

  /** Show it again afterwards. */
  unhideGameOver(): void {
    this.gameOver.classList.remove('hidden');
  }

  update(s: WorldState, humanTurn: boolean): void {
    this.humanTurn = humanTurn;
    if (!humanTurn && this.panelOpen) this.togglePanel(false);
    if (this.bannerUntil && performance.now() > this.bannerUntil) {
      this.banner.classList.remove('show');
      this.bannerUntil = 0;
    }
    const turn = s.turn;
    const team = activeTeam(s);
    const def = WEAPONS[turn.weapon];
    const secs =
      turn.phase === 'aim' || turn.phase === 'retreat' ? Math.ceil(turn.timer / TICK_RATE) : turn.phase === 'start' ? s.scheme.turnTime : 0;
    const ammoLeft = team.ammo[turn.weapon];
    const me = activeTardi(s);

    // Only touch the DOM when something visible changed.
    const key = [
      secs, Math.floor(s.roundTicks / TICK_RATE), s.suddenDeath, turn.phase, team.id, turn.weapon, ammoLeft, turn.fuseSeconds, s.wind, humanTurn, turn.target ? 1 : 0, turn.charging ? 1 : 0, def.girder ? turn.aim : 0, me?.rope ? 1 : 0, me?.airborne ? 1 : 0, me?.chute ? 1 : 0, s.projectiles.some((p) => p.dir !== 0) ? 1 : 0,
      s.tardis.map((x) => x.hp).join(','),
      s.race ? s.race.best.join(',') : '',
      s.practice ? s.practice.popped : '',
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.timer.textContent = String(secs);
    if (s.practice) {
      // Practice: targets popped instead of the round clock (there's no sudden death).
      this.round.textContent = `🎯 ${s.practice.popped}`;
      this.round.title = t('Targets popped');
      this.round.classList.remove('sd');
    } else if (s.suddenDeath) {
      this.round.textContent = t('SUDDEN DEATH');
      this.round.classList.add('sd');
    } else {
      const left = Math.max(0, s.scheme.roundTime * 60 - Math.floor(s.roundTicks / TICK_RATE));
      this.round.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      this.round.classList.remove('sd');
    }
    this.timer.style.background = hex(shown(team.color));
    this.timer.classList.toggle('retreat', turn.phase === 'retreat');
    this.timer.classList.toggle('urgent', turn.phase === 'aim' && secs <= 5);

    const w = s.wind;
    this.windFill.style.left = w < 0 ? `${50 + w * 50}%` : '50%';
    this.windFill.style.width = `${Math.abs(w) * 50}%`;
    this.windFill.className = 'hud-wind-fill ' + (w < 0 ? 'left' : 'right');
    const arrows = Math.max(1, Math.round(Math.abs(w) * 3));
    this.windLabel.textContent = w === 0 ? t('NO WIND') : w < 0 ? t('{arrows} WIND', { arrows: '◀'.repeat(arrows) }) : t('WIND {arrows}', { arrows: '▶'.repeat(arrows) });
    this.windLabel.classList.toggle('left', w < 0);
    this.windLabel.classList.toggle('right', w > 0);
    this.wind.setAttribute(
      'aria-label',
      w === 0
        ? t('No wind')
        : w < 0
          ? [t('Wind blowing left, light'), t('Wind blowing left, medium'), t('Wind blowing left, strong')][arrows - 1]
          : [t('Wind blowing right, light'), t('Wind blowing right, medium'), t('Wind blowing right, strong')][arrows - 1],
    );

    this.teams.innerHTML = '';
    this.teams.classList.toggle('many', s.teams.length > 4);
    // Each team's own roster (practice is one tardigrade against ten targets).
    const maxHpOf = (id: number) => s.scheme.startHp * Math.max(1, s.teams[id].tardiIds.length);
    for (const tm of s.teams) {
      const hp = s.tardis.filter((x) => x.team === tm.id && x.alive).reduce((a, x) => a + x.hp, 0);
      const row = el('div', 'team-row');
      const name = el('span', 'team-name', teamSymbol(tm.color) + teamLabel(tm));
      const bar = el('div', 'team-bar');
      bar.style.width = `${Math.max(2, Math.min(100, (hp / maxHpOf(tm.id)) * 100))}%`;
      bar.style.background = hex(shown(tm.color));
      if (tm.emblem) {
        const badge = el('span', 'team-emblem');
        badge.innerHTML = emblemSvg(tm.emblem, t('{team} emblem', { team: teamLabel(tm) }));
        row.append(badge);
      }
      row.append(name, bar);
      if (s.race) {
        // Rope Race: best time after the bar.
        const best = s.race.best[tm.id];
        row.append(el('span', 'team-time', best >= 0 ? t('{s}s', { s: (best / TICK_RATE).toFixed(1) }) : '–'));
      }
      if (tm.id === team.id) row.classList.add('active');
      this.teams.append(row);
    }

    // ▲▼ only when they do something: aiming, rotating a girder, or climbing a rope.
    this.aimPad?.classList.toggle('aim-off', !usesUpDown(def, !!me?.rope));
    this.weaponBtn.innerHTML = `<span class="wi">${def.icon}</span> ${t(def.name)}${ammoLeft > 0 ? ` ×${ammoLeft}` : ''}`;
    this.weaponBtn.disabled = !humanTurn || turn.phase !== 'aim';
    this.fuseBtn.style.display = def.projectile?.playerFuse ? '' : 'none';
    this.fuseBtn.textContent = `⏱ ${t('{s}s', { s: turn.fuseSeconds })}`;
    this.fuseBtn.dataset.fuse = String(turn.fuseSeconds);

    for (const cell of this.panel.querySelectorAll<HTMLButtonElement>('.weapon-cell')) {
      const id = cell.dataset.id!;
      const a = team.ammo[id];
      cell.disabled = a === 0;
      // Season weapons only show up in matches that have them switched on.
      cell.hidden = !!WEAPONS[id]?.locked && !s.scheme.unlocked?.includes(id);
      cell.classList.toggle('selected', id === turn.weapon);
      cell.querySelector('.wa')!.textContent = a < 0 ? '∞' : `×${a}`;
    }

    let hint = '';
    if (humanTurn && turn.phase === 'aim' && me) {
      if (me.rope) hint = t('←/→ swing · ↑/↓ climb · Jump or Fire to let go');
      else if (s.race) hint = t('Rope your way to the flag! Try {n} of {total}', { n: Math.ceil(turn.turnNumber / s.teams.length), total: s.scheme.raceRounds });
      else if (def.kind === 'rope') hint = t('Aim, then Fire to shoot a silk line');
      else if (def.kind === 'parachute') hint = me.chute ? t('←/→ to steer') : me.airborne ? t('Fire to open the leaf!') : t('Jump off something, then Fire to open');
      else if (def.girder) hint = !turn.target ? t('Tap / click where to build') : girderFits(s) ? t('↑/↓ rotate · Fire to build') : t('Won’t fit there — move or rotate it');
      else if (def.kind === 'target') hint = turn.target ? t('Press FIRE to confirm') : t('Tap / click the map to choose a target');
      else if (def.projectile?.homing) hint = turn.target ? t('Aim, then hold Fire to launch') : t('Tap / click a target for the spore first');
      else if (def.kind === 'walker') hint = t('Fire to release the Rotifer Roller');
      else if (def.kind === 'drop') hint = t('Fire to drop it, then run!');
      else if (def.shower) hint = t('Fire to bring the slides crashing down!');
      else if (this.touchMode && (def.kind === 'charge' || def.kind === 'hitscan') && !turn.charging) hint = t('Drag from your tardigrade to aim');
    } else if (humanTurn && turn.phase === 'retreat' && s.projectiles.some((p) => p.dir !== 0)) {
      hint = t('Press Fire to set it off!');
    } else if (!humanTurn && turn.phase === 'aim') {
      hint = t('{team} is thinking…', { team: teamLabel(team) });
    }
    this.hint.textContent = hint;
    this.hint.classList.toggle('show', hint !== '');
    this.touch.classList.toggle('disabled', !humanTurn);
  }
}
