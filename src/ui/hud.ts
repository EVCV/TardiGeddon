// In-game HUD (DOM overlay): turn timer, wind, team health, weapon panel,
// banners and touch controls.

import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, PRESS_JUMP, TICK_RATE, type WorldState } from '../sim/types';
import { PANEL_WEAPONS, WEAPONS } from '../sim/weapons';
import { activeTardi, activeTeam, girderFits } from '../sim/world';
import type { InputCollector } from '../input/input';
import { hex } from '../render/palette';

export interface HudHooks {
  onQuit: () => void;
  onToggleMute: () => boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Hud {
  readonly root = el('div', 'hud');
  private timer = el('div', 'hud-timer');
  private round = el('div', 'hud-round');
  private wind = el('div', 'hud-wind');
  private windFill = el('div', 'hud-wind-fill');
  private teams = el('div', 'hud-teams');
  private banner = el('div', 'hud-banner');
  private hint = el('div', 'hud-hint');
  private weaponBtn = el('button', 'hud-btn hud-weapon');
  private fuseBtn = el('button', 'hud-btn hud-fuse');
  private panel = el('div', 'weapon-panel hidden');
  private gameOver = el('div', 'overlay hidden');
  private touch = el('div', 'touch');
  private bannerUntil = 0;
  private lastKey = '';
  private humanTurn = false;

  constructor(
    private input: InputCollector,
    hooks: HudHooks,
    touchMode: boolean,
  ) {
    this.wind.append(this.windFill);
    const top = el('div', 'hud-top');
    const menuBtn = el('button', 'hud-btn', '☰');
    menuBtn.title = 'Quit to menu';
    menuBtn.onclick = () => {
      if (confirm('Quit this match?')) hooks.onQuit();
    };
    const muteBtn = el('button', 'hud-btn', '🔊');
    muteBtn.onclick = () => (muteBtn.textContent = hooks.onToggleMute() ? '🔇' : '🔊');
    top.append(menuBtn, this.wind, muteBtn);

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
      b.innerHTML = `<span class="wi">${w.icon}</span><span class="wn">${w.name}</span><span class="wa"></span>`;
      b.onclick = () => {
        this.input.command({ t: 'weapon', id: w.id });
        this.togglePanel(false);
      };
      grid.append(b);
    }
    const close = el('button', 'hud-btn panel-close', '✕');
    close.onclick = () => this.togglePanel(false);
    this.panel.append(el('h2', '', 'Weapons'), close, grid);
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
    right.append(aim, mk('JUMP', 'jump', -1, 't-jump'), mk('FIRE', 'fire', BTN_FIRE, 't-fire'));
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

  showGameOver(s: WorldState, onAgain: () => void, onMenu: () => void): void {
    const w = s.turn.winner;
    this.gameOver.innerHTML = '';
    const box = el('div', 'overlay-box');
    const title = el('h1', 'title-small', w >= 0 ? `${s.teams[w].name} wins!` : 'Draw!');
    if (w >= 0) title.style.color = hex(s.teams[w].color);
    const again = el('button', 'big-btn', 'Play again');
    again.onclick = onAgain;
    const menu = el('button', 'big-btn secondary', 'Main menu');
    menu.onclick = onMenu;
    box.append(title, again, menu);
    this.gameOver.append(box);
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
    const t = activeTardi(s);

    // Only touch the DOM when something visible changed.
    const key = [
      secs, Math.floor(s.roundTicks / TICK_RATE), s.suddenDeath, turn.phase, team.id, turn.weapon, ammoLeft, turn.fuseSeconds, s.wind, humanTurn, turn.target ? 1 : 0, def.girder ? turn.aim : 0, t?.rope ? 1 : 0, t?.airborne ? 1 : 0, t?.chute ? 1 : 0, s.projectiles.some((p) => p.dir !== 0) ? 1 : 0,
      s.tardis.map((x) => x.hp).join(','),
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.timer.textContent = String(secs);
    if (s.suddenDeath) {
      this.round.textContent = 'SUDDEN DEATH';
      this.round.classList.add('sd');
    } else {
      const left = Math.max(0, s.scheme.roundTime * 60 - Math.floor(s.roundTicks / TICK_RATE));
      this.round.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      this.round.classList.remove('sd');
    }
    this.timer.style.background = hex(team.color);
    this.timer.classList.toggle('retreat', turn.phase === 'retreat');
    this.timer.classList.toggle('urgent', turn.phase === 'aim' && secs <= 5);

    const w = s.wind;
    this.windFill.style.left = w < 0 ? `${50 + w * 50}%` : '50%';
    this.windFill.style.width = `${Math.abs(w) * 50}%`;
    this.windFill.className = 'hud-wind-fill ' + (w < 0 ? 'left' : 'right');

    this.teams.innerHTML = '';
    this.teams.classList.toggle('many', s.teams.length > 4);
    const maxHp = s.scheme.startHp * s.scheme.tardisPerTeam;
    for (const tm of s.teams) {
      const hp = s.tardis.filter((x) => x.team === tm.id && x.alive).reduce((a, x) => a + x.hp, 0);
      const row = el('div', 'team-row');
      const name = el('span', 'team-name', tm.name);
      const bar = el('div', 'team-bar');
      bar.style.width = `${Math.max(2, (hp / maxHp) * 100)}%`;
      bar.style.background = hex(tm.color);
      row.append(name, bar);
      if (tm.id === team.id) row.classList.add('active');
      this.teams.append(row);
    }

    this.weaponBtn.innerHTML = `<span class="wi">${def.icon}</span> ${def.name}${ammoLeft > 0 ? ` ×${ammoLeft}` : ''}`;
    this.weaponBtn.disabled = !humanTurn || turn.phase !== 'aim';
    this.fuseBtn.style.display = def.projectile?.playerFuse ? '' : 'none';
    this.fuseBtn.textContent = `⏱ ${turn.fuseSeconds}s`;
    this.fuseBtn.dataset.fuse = String(turn.fuseSeconds);

    for (const cell of this.panel.querySelectorAll<HTMLButtonElement>('.weapon-cell')) {
      const id = cell.dataset.id!;
      const a = team.ammo[id];
      cell.disabled = a === 0;
      cell.classList.toggle('selected', id === turn.weapon);
      cell.querySelector('.wa')!.textContent = a < 0 ? '∞' : `×${a}`;
    }

    let hint = '';
    if (humanTurn && turn.phase === 'aim' && t) {
      if (t.rope) hint = '←/→ swing · ↑/↓ climb · Jump or Fire to let go';
      else if (def.kind === 'rope') hint = 'Aim, then Fire to shoot a silk line';
      else if (def.kind === 'parachute') hint = t.chute ? '←/→ to steer' : t.airborne ? 'Fire to open the leaf!' : 'Jump off something, then Fire to open';
      else if (def.girder) hint = !turn.target ? 'Tap / click where to build' : girderFits(s) ? '↑/↓ rotate · Fire to build' : 'Won’t fit there — move or rotate it';
      else if (def.kind === 'target') hint = turn.target ? 'Press FIRE to confirm' : 'Tap / click the map to choose a target';
      else if (def.projectile?.homing) hint = turn.target ? 'Aim, then hold Fire to launch' : 'Tap / click a target for the spore first';
      else if (def.kind === 'walker') hint = 'Fire to release the Rotifer Roller';
      else if (def.kind === 'drop') hint = 'Fire to drop it, then run!';
    } else if (humanTurn && turn.phase === 'retreat' && s.projectiles.some((p) => p.dir !== 0)) {
      hint = 'Press Fire to set it off!';
    } else if (!humanTurn && turn.phase === 'aim') {
      hint = `${team.name} is thinking…`;
    }
    this.hint.textContent = hint;
    this.hint.classList.toggle('show', hint !== '');
    this.touch.classList.toggle('disabled', !humanTurn);
  }
}
