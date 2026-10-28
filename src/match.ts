// A match being played: the world, its view (PixiJS), the HUD, input, sound,
// the CPU players and, online, the connection. Loaded on demand (main.ts
// imports it when the first match starts), so the menu doesn't wait for
// the game's renderer to download.

import { shown } from './render/palette';
import { myUnlockedWeapons, reportCpuMatch, wearArena, wearMusic, wearSounds, wornLooks } from './account/session';
import { MatchTally } from './stats/tally';
import { TurnRecorder } from './stats/replay';
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { cloneWorld, createWorld, tick, type TeamConfig } from './sim/world';
import { Coach, TutorialDummy, dummyPlayer, practiceWorld, tutorialWorld } from './ui/tutorial';
import { EMPTY_INPUT, TICK_RATE, type InputFrame, type SimEvent, type WorldState } from './sim/types';
import { GameRenderer } from './render/renderer';
import { WEATHER_NAMES } from './render/weather';
import { mapStyleName } from './sim/terrain/generate';
import { arenaTheme, type ArenaTheme } from './render/arenas';
import { shareMatch } from './ui/share';
import { MatchRecorder, type MatchReplay } from './stats/matchReplay';
import { keepReplay } from './ui/replays';
import { decodeWorld } from './net/snapshot';
import { cleanFrame } from './net/protocol';
import { unpackFrames } from './challenge/daily';
import { findEgg, onEggFound } from './ui/eggs';
import { Captions, captionFor } from './ui/captions';
import { ChallengeRun, TARGET_TURNS, challengeDay, challengeWorld, type ChallengeKind } from './challenge/daily';
import { showChallengeResult } from './ui/challenge';
import { Banter } from './render/banter';
import { loadProfiles, matchNames } from './ui/teams';
import { InputCollector, attachKeyboard, doAction, type KeyboardHooks } from './input/input';
import { actionFor, chargeStyle, controls } from './input/controls';
import { WEAPONS } from './sim/weapons';
import { Hud } from './ui/hud';
import { CpuPlayer } from './ai/cpu';
import { sfx, useSoundPack } from './audio/sfx';
import { anySound, toggleAllSound, unlockAudio } from './audio/mixer';
import { playMusic, previewMusic } from './audio/music';
import type { MatchSetup } from './ui/menu';
import { loadRejoin } from './ui/online';
import { NetClient } from './net/client';
import { hideTeams, isBlocked, tardiLabel, teamLabel } from './net/blocked';
import { openPlayers } from './ui/safety';
import { Lockstep, SeenInput, connectionState } from './net/lockstep';
import { toWire, type ServerMsg } from './net/protocol';
import { ANGLE_FULL } from './sim/math/trig';
import { t } from './i18n/i18n';
import { noteMatchForReview } from './review';
import { cpuForm, noteCpuResult } from './ai/form';
import { flushUsage, usage } from './usage/usage';
import type { USAGE_MODES } from './usage/catalog';

const TICK_MS = 1000 / TICK_RATE;
const touchMode = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

/** The Pixi app the game draws into (one, made for the first match and kept). */
let app: Promise<Application> | null = null;

/** The app, made on first use. One promise, so a preload and a match starting at once share it. */
export function gameApp(): Promise<Application> {
  return (app ??= (async () => {
    const a = new Application();
    await a.init({
      resizeTo: window,
      background: '#7fd3f7',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    document.getElementById('game')!.appendChild(a.canvas);
    return a;
  })());
}

export type MatchMode = { kind: 'local'; setup: MatchSetup } | { kind: 'tutorial' } | { kind: 'practice'; endless: boolean } | { kind: 'challenge'; challenge: ChallengeKind } | { kind: 'replay'; replay: MatchReplay } | { kind: 'online'; client: NetClient; ls: Lockstep };

export class Match {
  private local: WorldState | null = null;
  private net: { client: NetClient; ls: Lockstep } | null = null;
  private renderer: GameRenderer;
  private input = new InputCollector();
  private hud: Hud;
  private banter = new Banter();
  private cpu = new Map<number, { next: (s: WorldState) => InputFrame }>();
  /** The tutorial's coach card (tutorial matches only). */
  private coach: Coach | null = null;
  private events: SimEvent[] = [];
  /** Counts pops and damage in a vs-CPU match, for the signed-in player's stats (team 0). */
  private tally: MatchTally | null = null;
  /** The whole match, for watching again (Replays in the lobby). */
  private matchRec = new MatchRecorder();
  /** Watching a replay: its frames, how far through, and the controls' state. */
  private playback: { frames: InputFrame[]; i: number; speed: number; paused: boolean; skipTurn: number; bar: HTMLElement } | null = null;
  /** Words on screen for the sounds (Settings → Accessibility). */
  private captions = new Captions();
  /** A daily challenge run: records its frames for the leaderboard and says when it's over. */
  private challenge: ChallengeRun | null = null;
  /** Everyone's numbers for the end-of-match screen (every kind of match). */
  private stats: MatchTally | null = null;
  /** Each turn's start and inputs, to show the winning shot again. */
  private recorder = new TurnRecorder();
  /** Showing the winning shot again: its own copy of the world, and how far through its frames. */
  private replay: { state: WorldState; frames: InputFrame[]; i: number; acc: number; endAt: number } | null = null;
  /** This player's world look for the whole match. */
  private theme: ArenaTheme;
  private acc = 0;
  private last = performance.now();
  private detachKeys: () => void;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number; moved: boolean; aim: boolean; button: number }>();
  private pinchDist = 0;
  private over = false;
  private destroyed = false;
  /** Anonymous statistics (docs/USAGE.md): how this match counts (null: not counted, e.g. a replay), its CPU skill, when it began, and the player's shots per weapon. */
  private usageMode: (typeof USAGE_MODES)[number] | null = null;
  private usageSkill = '-';
  private startedAt = performance.now();
  private shots = new Map<string, number>();
  private tickerFn = () => this.frame();
  private keyHooks: KeyboardHooks = {
    onWeaponPanel: () => this.hud.togglePanel(),
    onEscape: () => this.hud.togglePanel(false),
  };
  // Online bookkeeping
  private offNet: (() => void) | null = null;
  private sentHeld = 0;
  private sentTurn = -1;
  private resyncAsked = false;
  private reconnecting = false;
  private seen = new SeenInput();
  /** When the server last sent frames (ms), to notice a struggling connection. */
  private heardAt = performance.now();
  /** Connections dropped for going quiet since frames last came (stops trying after a few). */
  private quietDrops = 0;
  /** Called when the server starts a new match on this connection (a rematch). */
  onNetStart: ((ls: Lockstep) => void) | null = null;
  /** Latest lobby state from the server (for "Back to room" after the match). */
  lastRoom: Extract<ServerMsg, { t: 'room' }> | null = null;

  constructor(
    private app: Application,
    private ui: HTMLElement,
    mode: MatchMode,
    private onMenu: () => void,
    private onAgain: () => void,
  ) {
    if (mode.kind === 'local') {
      const setup = mode.setup;
      const teams: TeamConfig[] = setup.players.map((cpu, i) => {
        const p = setup.teams[i];
        return { name: p.name, color: p.color, ...wornLooks(p), names: matchNames(p, i), cpu, ...(cpu ? {} : { charge: chargeStyle(controls()) }) };
      });
      // Season weapons this player has unlocked are switched on for everyone in the match.
      this.local = createWorld({ seed: setup.seed, teams, scheme: { ...setup.scheme, unlocked: myUnlockedWeapons() } });
      // Only one human (the player's own team, slot 0) against the CPU counts for their stats.
      if (!setup.players[0] && setup.players.slice(1).every(Boolean) && !this.local.race) this.tally = new MatchTally(teams.length);
      // Against the CPU on your own, it keeps the games close (src/ai/form.ts).
      const form = this.tally ? cpuForm() : 0;
      for (const tm of this.local.teams) if (tm.cpu) this.cpu.set(tm.id, new CpuPlayer(setup.cpuSkill, undefined, form));
      const vsCpu = setup.players.some(Boolean);
      this.usageMode = this.local.race ? 'race' : vsCpu ? 'cpu' : 'hotseat';
      if (vsCpu) this.usageSkill = setup.cpuSkill;
    } else if (mode.kind === 'tutorial') {
      const p = loadProfiles()[0];
      const you: TeamConfig = { name: p.name, color: p.color, ...wornLooks(p), names: matchNames(p, 0), cpu: false, charge: chargeStyle(controls()) };
      this.local = createWorld(tutorialWorld(you));
      this.cpu.set(1, new TutorialDummy());
      this.coach = new Coach(touchMode, { onMenu, onAgain });
      this.usageMode = 'tutorial';
    } else if (mode.kind === 'challenge') {
      // Today's challenge: the same world for everyone; our team's looks are our own.
      const p = loadProfiles()[0];
      const you: TeamConfig = { name: p.name, color: p.color, ...wornLooks(p), names: matchNames(p, 0), cpu: false, charge: chargeStyle(controls()) };
      const day = challengeDay();
      this.challenge = new ChallengeRun(mode.challenge, day);
      this.local = createWorld(challengeWorld(mode.challenge, day, you));
      this.usageMode = mode.challenge;
    } else if (mode.kind === 'replay') {
      // Watching a replay: the world as it began, and the frames played on it (checked, as they may come from a file).
      this.local = decodeWorld(mode.replay.start);
      this.playback = { frames: unpackFrames(mode.replay.frames, cleanFrame) ?? [], i: 0, speed: 1, paused: false, skipTurn: -1, bar: document.createElement('div') };
    } else if (mode.kind === 'practice') {
      // Your first team's tardigrade (it can't be hurt), every weapon with unlimited ammo, and targets to pop.
      const p = loadProfiles()[0];
      const you: TeamConfig = { name: p.name, color: p.color, ...wornLooks(p), names: matchNames(p, 0), cpu: false, charge: chargeStyle(controls()) };
      this.local = createWorld(practiceWorld(you, myUnlockedWeapons(), (Math.random() * 1e9) | 0, mode.endless));
      this.cpu.set(1, dummyPlayer);
      this.usageMode = 'practice';
    } else {
      this.net = { client: mode.client, ls: mode.ls };
      this.listenNet();
      if (mode.ls.you >= 0) this.usageMode = 'online';
    }

    if (this.usageMode) usage('match', { mode: this.usageMode, skill: this.usageSkill });
    // Chosen once: "Surprise me" must not change the world when the view is rebuilt mid-match.
    // Online, the host may have picked the world for everyone.
    this.theme = arenaTheme(this.state.scheme.arena ?? wearArena());
    this.renderer = new GameRenderer(app, this.state, this.theme);
    this.renderer.onSound = (name) => {
      sfx[name]();
      this.captions.say(name === 'pop' ? t('💨 Pop!') : t('😱 Whoa!'));
    };
    this.renderer.onEgg = (id) => findEgg(id);
    // Online: names of players you've blocked are hidden from you.
    this.hideBlocked();
    const onPlayers = this.net ? () => this.showPlayers() : undefined;
    this.hud = new Hud(this.input, { onQuit: onMenu, onToggleMute: () => toggleAllSound(), muted: !anySound(), onPlayers }, touchMode);
    // This player's own match music and sound pack (only they hear them).
    useSoundPack(wearSounds());
    previewMusic(null);
    playMusic(wearMusic());
    ui.append(this.hud.root, this.captions.root);
    if (this.playback) ui.append(this.replayBar());
    if (this.net && this.net.ls.you < 0) {
      // Spectating: say so.
      const badge = document.createElement('div');
      badge.className = 'watching-badge';
      badge.textContent = t('👀 Watching');
      ui.append(badge);
    }
    // Record everything but the tutorial (and replays themselves) for Replays.
    else if (!this.coach) this.matchRec.begin(this.state);
    if (this.coach) {
      this.hud.root.classList.add('has-coach');
      ui.append(this.coach.root);
    }
    this.detachKeys = attachKeyboard(this.input, this.keyHooks);
    this.attachPointer();
    // Easter eggs found in a match get a banner.
    onEggFound((text) => this.hud.showBanner(text, 0xffd84a, 3));
    // Named after the tardigrade that went to space?
    if (this.state.tardis.some((x) => !this.state.teams[x.team].cpu && /^milnesium$/i.test(x.name.trim()))) findEgg('milnesium');
    this.announceMap();
    app.ticker.add(this.tickerFn);
    (window as unknown as { __tardi: unknown }).__tardi = this; // for e2e tests
  }

  get state(): WorldState {
    return this.net ? this.net.ls.state : this.local!;
  }

  get world(): WorldState {
    return this.state;
  }

  private listenNet(): void {
    const net = this.net!;
    this.offNet = net.client.on((msg) => {
      switch (msg.t) {
        case 'frames':
          this.heardAt = performance.now();
          this.quietDrops = 0;
          net.ls.onFrames(msg.from, msg.f);
          break;
        case 'hash': net.ls.onHash(msg.tick, msg.h); break;
        case 'snapshot':
          net.ls.onSnapshot(msg.state, msg.you);
          this.heardAt = performance.now();
          this.resyncAsked = false;
          // The world was replaced wholesale: redraw it from scratch.
          this.replay = null;
          this.ui.classList.remove('replaying');
          this.newRenderer(this.state);
          // The recording carries on from the new copy of the world.
          this.matchRec.begin(this.state);
          break;
        case 'room': this.lastRoom = msg; break;
        case 'start':
          // The host started a rematch while we were still on the results screen.
          this.onNetStart?.(Lockstep.start(msg.seed, msg.scheme, msg.teams, msg.you));
          break;
        case 'error': this.hud.showBanner(t(msg.msg), 0xe04848, 3); break;
      }
    });
    net.client.onDrop = () => void this.reconnect();
  }

  /** Lost the server: keep trying to get back into our slot. */
  private async reconnect(): Promise<void> {
    if (this.reconnecting || !this.net) return;
    this.reconnecting = true;
    const re = loadRejoin();
    for (let i = 0; i < 15 && this.net && re; i++) {
      this.hud.showBanner(t('Reconnecting…'), 0x7d8a99, 2.2);
      try {
        await this.net.client.connect();
        this.net.client.join(re.code, { name: '', color: 0, hat: '', names: [] }, re.token);
        this.heardAt = performance.now();
        this.reconnecting = false;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    this.reconnecting = false;
    if (this.net) this.hud.showBanner(t('Disconnected'), 0xe04848, 5);
  }

  /** Hide the names of teams whose players this player has blocked (online only). */
  private hideBlocked(): void {
    const room = this.net?.client.room;
    hideTeams(room ? room.slots.flatMap((sl, i) => (sl.pid && isBlocked(sl.pid) ? [i] : [])) : []);
  }

  /** 👥: the other players in this match, to report or block. */
  private showPlayers(): void {
    const net = this.net;
    const room = net?.client.room;
    if (!net || !room) return;
    openPlayers(this.ui, room.slots, net.ls.you, (idx, reason) => net.client.report(idx, reason), () => {
      // Blocking changes the names on screen: redraw the world.
      this.hideBlocked();
      this.newRenderer(this.replay?.state ?? this.state);
    });
  }

  /** The phone's back button: close the weapon panel, else offer to quit. */
  back(): void {
    if (this.hud.panelOpen) this.hud.togglePanel(false);
    else if (this.over || confirm(t('Quit this match?'))) this.onMenu();
  }

  private isHumanTurn(): boolean {
    if (this.playback) return false;
    if (this.net) return this.net.ls.myTurn;
    const team = this.state.teams[this.state.turn.teamIdx];
    return !team.cpu && this.state.turn.phase !== 'gameover';
  }

  /** The challenge run is over: show the result and send it to the leaderboard. */
  private finishChallenge(s: WorldState): void {
    const run = this.challenge!;
    const result = run.result(s);
    const packed = run.packed();
    sfx.fanfare();
    setTimeout(() => {
      if (!this.destroyed) showChallengeResult(this.ui, run.kind, run.day, result, packed, s.teams[0].charge, this.onAgain, this.onMenu);
    }, 1800);
  }

  /** The end-of-match box: numbers, the winning shot again, share, next. */
  private showResults(labels: readonly [string, string]): void {
    if (this.destroyed) return;
    const stats = this.stats?.teams;
    this.hud.showGameOver(this.state, this.onAgain, this.onMenu, labels, {
      stats,
      onReplay: this.recorder.winningShot() ? () => this.startReplay() : undefined,
      onShare: stats ? () => shareMatch(this.state, stats) : undefined,
      reviewUrl: this.reviewAsk() ?? undefined,
    });
  }

  /** Now and then, after a win, ask for a review (src/review.ts). Not when only watching, or in practice. */
  private reviewAsk(): string | null {
    const s = this.state;
    if (s.practice || (this.net && this.net.ls.you < 0)) return null;
    const w = s.turn.winner;
    const won = w >= 0 && (this.net ? w === this.net.ls.you : !s.teams[w].cpu);
    return noteMatchForReview(won);
  }

  private newRenderer(s: WorldState): void {
    this.renderer.destroy();
    this.renderer = new GameRenderer(this.app, s, this.theme);
    this.renderer.onSound = (name) => {
      sfx[name]();
      this.captions.say(name === 'pop' ? t('💨 Pop!') : t('😱 Whoa!'));
    };
    this.renderer.onEgg = (id) => findEgg(id);
  }

  /** Play the turn that decided the match again, on its own copy of the world. */
  private startReplay(): void {
    const rec = this.recorder.winningShot();
    if (!rec || this.replay) return;
    const state = cloneWorld(rec.start);
    this.replay = { state, frames: rec.frames, i: 0, acc: 0, endAt: 0 };
    this.hud.hideGameOver();
    this.ui.classList.add('replaying');
    this.newRenderer(state);
    this.hud.showBanner(t('🎬 The winning shot'), 0xffffff, 2);
  }

  private stopReplay(): void {
    this.replay = null;
    this.ui.classList.remove('replaying');
    this.newRenderer(this.state);
    this.hud.unhideGameOver();
  }

  /** One frame of the replay, at three quarters speed so the shot can be followed. */
  private replayFrame(dt: number): void {
    const r = this.replay!;
    r.acc += dt * 0.75;
    while (r.acc >= TICK_MS && r.i < r.frames.length) {
      r.acc -= TICK_MS;
      this.renderer.capturePrev(r.state);
      tick(r.state, r.frames[r.i++], this.events);
    }
    if (r.i >= r.frames.length && !r.endAt) r.endAt = performance.now() + 2500;
    this.renderer.handleEvents(this.events);
    this.playSounds(this.events.filter((e) => e.t !== 'gameover'));
    this.events.length = 0;
    this.renderer.render(r.state, Math.min(1, r.acc / TICK_MS), dt / 1000, false);
    this.hud.update(this.state, false);
    if (r.endAt && performance.now() > r.endAt) this.stopReplay();
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(250, now - this.last);
    this.last = now;
    if (this.replay) {
      this.replayFrame(dt);
      return;
    }
    // Replays: paused, or played fast.
    this.acc += this.playback ? (this.playback.paused ? 0 : dt * this.playback.speed) : dt;
    if (this.playback?.skipTurn === this.state.turn.turnNumber) {
      // ⏭: play on (at most a minute's worth per frame) until the next turn starts.
      this.acc += TICK_MS * Math.min(3000, this.playback.frames.length - this.playback.i);
    }
    if (this.net) this.netFrame();
    else {
      const s = this.local!;
      while (this.acc >= TICK_MS) {
        this.acc -= TICK_MS;
        // A finished challenge run stops where it ended.
        if (this.challenge?.over) {
          this.acc = 0;
          break;
        }
        const team = s.teams[s.turn.teamIdx];
        const human = this.isHumanTurn();
        // Tap-to-fire (Settings) only applies to weapons you charge.
        this.input.chargeWeapon = WEAPONS[s.turn.weapon]?.kind === 'charge' && human;
        const humanInput = this.input.frame(); // always drain
        const pb = this.playback;
        if (pb && pb.i >= pb.frames.length) {
          // The end of the recording.
          this.acc = 0;
          break;
        }
        if (pb && pb.skipTurn >= 0 && pb.skipTurn !== s.turn.turnNumber) {
          pb.skipTurn = -1;
          this.acc = Math.min(this.acc, TICK_MS);
        }
        const input = pb
          ? pb.frames[pb.i++]
          : this.challenge
            ? this.challenge.frameFor(s, human ? humanInput : EMPTY_INPUT)
            : team.cpu ? this.cpu.get(team.id)!.next(s) : human ? humanInput : EMPTY_INPUT;
        this.matchRec.frame(input);
        this.renderer.capturePrev(s);
        const from = this.events.length;
        this.recorder.before(s, input);
        tick(s, input, this.events);
        const fresh = this.events.slice(from);
        this.recorder.after(fresh);
        if (human && !pb) this.countShots(fresh);
        this.tally?.add(s, fresh);
        this.statsFor(s).add(s, fresh);
        if (this.challenge && this.challenge.played(s, input, fresh)) this.finishChallenge(s);
      }
    }
    this.coach?.update({
      state: this.state,
      events: this.events,
      humanTurn: this.isHumanTurn(),
      panelOpen: this.hud.panelOpen,
      camera: this.renderer.camera,
    });
    this.renderer.handleEvents(this.events);
    this.banter.onEvents(this.state, this.events, (id, text) => this.renderer.say(id, text));
    this.playSounds(this.events);
    this.events.length = 0;
    this.renderer.render(this.state, Math.min(1, this.acc / TICK_MS), dt / 1000, true);
    this.hud.update(this.state, this.isHumanTurn());
    this.captions.update();
  }

  /** The replay controls: pause, speed, next turn, leave. */
  private replayBar(): HTMLElement {
    const pb = this.playback!;
    const bar = pb.bar;
    bar.className = 'replay-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t('Replay controls'));
    const btn = (text: string, label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'hud-btn';
      b.textContent = text;
      b.setAttribute('aria-label', label);
      b.title = label;
      b.onclick = fn;
      return b;
    };
    const pause = btn('⏸', t('Pause'), () => {
      pb.paused = !pb.paused;
      pause.textContent = pb.paused ? '▶' : '⏸';
      pause.setAttribute('aria-label', pb.paused ? t('Play') : t('Pause'));
      pause.title = pb.paused ? t('Play') : t('Pause');
    });
    const speeds = [1, 2, 4].map((n) => {
      const b = btn(`${n}×`, t('Speed {n}×', { n }), () => {
        pb.speed = n;
        for (const x of speeds) x.classList.toggle('on', x === b);
      });
      if (n === 1) b.classList.add('on');
      return b;
    });
    bar.append(
      document.createTextNode('🎬'),
      pause,
      ...speeds,
      btn('⏭', t('Skip to the next turn'), () => (pb.skipTurn = this.state.turn.turnNumber)),
      btn('✕', t('Stop watching'), this.onMenu),
    );
    return bar;
  }

  /** The recording has played out. */
  private replayOver(): void {
    if (this.destroyed) return;
    this.hud.showGameOver(this.state, this.onAgain, this.onMenu, [t('Watch again'), t('Main menu')], { stats: this.stats?.teams });
  }

  /** The end-of-match numbers, started on first use (a rejoined online match starts counting then). */
  private statsFor(s: WorldState): MatchTally {
    return (this.stats ??= new MatchTally(s.teams.length));
  }

  /** Online: play one frame from the server, recording it and counting its events. */
  private netStep(ls: Lockstep): void {
    const from = this.events.length;
    const mine = ls.myTurn;
    ls.onFrame = (st, f) => {
      this.recorder.before(st, f);
      this.matchRec.frame(f);
    };
    ls.step(this.events);
    const fresh = this.events.slice(from);
    this.recorder.after(fresh);
    if (mine) this.countShots(fresh);
    this.statsFor(ls.state).add(ls.state, fresh);
  }

  /** The player's own shots, by weapon (anonymous statistics). */
  private countShots(fresh: SimEvent[]): void {
    for (const e of fresh) if (e.t === 'fire') this.shots.set(e.weapon, (this.shots.get(e.weapon) ?? 0) + 1);
  }

  /** The match is over, or being left: count how it went, how long it took and the shots (docs/USAGE.md). Once. */
  private usageEnd(outcome: 'won' | 'lost' | 'draw' | 'done' | 'left'): void {
    const mode = this.usageMode;
    if (!mode) return;
    this.usageMode = null;
    usage('result', { mode, skill: this.usageSkill, outcome });
    const secs = (performance.now() - this.startedAt) / 1000;
    if (secs >= 1) usage('playtime', { mode }, secs);
    for (const [weapon, n] of this.shots) usage('weapon', { weapon }, n);
    flushUsage();
  }

  /** Online: send our inputs on our turn, and play the frames the server sends. */
  private netFrame(): void {
    const { client, ls } = this.net!;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.input.chargeWeapon = ls.myTurn && WEAPONS[ls.state.turn.weapon]?.kind === 'charge';
      const f = this.input.frame();
      if (ls.myTurn) {
        // The server forgets held buttons when a turn starts.
        if (ls.state.turn.turnNumber !== this.sentTurn) {
          this.sentTurn = ls.state.turn.turnNumber;
          this.sentHeld = 0;
        }
        if (f.held !== this.sentHeld || f.pressed !== 0 || f.cmd) {
          for (const g of this.seen.frames(f, this.sentHeld, ls.state)) client.send({ t: 'input', f: toWire(g) });
          this.sentHeld = f.held;
        }
      }
      if (ls.buffered > 0) {
        this.renderer.capturePrev(ls.state);
        this.netStep(ls);
      } else {
        // Waiting on the server: don't bank time we'd then rush through.
        this.acc = Math.min(this.acc, TICK_MS);
      }
    }
    // Fell behind (slow device or a burst of frames): catch up quickly.
    while (ls.buffered > 6) {
      this.renderer.capturePrev(ls.state);
      this.netStep(ls);
    }
    if (ls.desynced && !this.resyncAsked) {
      this.resyncAsked = true;
      client.send({ t: 'resync' });
    }
    // The server sends frames all match long, so a gap means trouble: say so,
    // and if it goes on, stop waiting on this connection and make a new one.
    if (!this.reconnecting && ls.state.turn.phase !== 'gameover') {
      const health = connectionState(performance.now() - this.heardAt);
      if (health === 'lost' && this.quietDrops < 3) {
        this.quietDrops++;
        client.drop();
      } else if (health === 'lost') this.hud.showBanner(t('Disconnected'), 0xe04848, 1);
      else if (health === 'slow') this.hud.showBanner(t('⚠️ Slow connection…'), 0xe0a030, 1);
    }
  }

  private playSounds(events: SimEvent[]): void {
    let hurt = false; // one voice per batch of damage
    for (const e of events) {
      this.captions.say(captionFor(e));
      switch (e.t) {
        case 'explosion': sfx.explosion(e.r); break;
        case 'fire':
          sfx.fire();
          this.input.stopCharging();
          break;
        case 'shot': sfx.shot(); break;
        case 'jump': sfx.jump(); break;
        case 'splash': sfx.splash(); break;
        case 'bounce': sfx.bounce(); break;
        case 'teleport': case 'respawn': sfx.teleport(); break;
        case 'rope': sfx.rope(); break;
        case 'chute': sfx.chute(); break;
        case 'punch': sfx.punch(); break;
        case 'terrain': sfx.build(); break;
        case 'mineArmed': sfx.tick(); break;
        case 'crateDrop': sfx.chute(); break;
        case 'collect': sfx.collect(); break;
        case 'heal': sfx.collect(); break;
        case 'dud': sfx.bounce(); break;
        case 'suddenDeath':
          sfx.suddenDeath();
          setTimeout(() => this.hud.showBanner(t('SUDDEN DEATH!'), 0xe04848, 2.5), 2100);
          break;
        case 'waterRise': sfx.splash(); break;
        case 'tornado':
          findEgg('tornado');
          sfx.suddenDeath();
          this.hud.showBanner(t('🌪️ TORNADO!'), 0xffffff, 2.5);
          break;
        case 'gas': sfx.chute(); break;
        case 'damage':
          if (!hurt) {
            hurt = true;
            if (e.amount >= 35) sfx.oof();
            else sfx.squeak();
          }
          break;
        case 'drown': sfx.gargle(); break;
        case 'finish': {
          sfx.collect();
          const tm = this.state.teams[e.team];
          const secs = (e.ticks / TICK_RATE).toFixed(1);
          this.hud.showBanner(e.best ? t('{team}: {s}s — best!', { team: teamLabel(tm), s: secs }) : t('{team}: {s}s', { team: teamLabel(tm), s: secs }), shown(tm.color), 2.5);
          break;
        }
        case 'turnStart':
          sfx.turn();
          this.announceTurn();
          break;
        case 'gameover':
          if (!this.over) {
            this.over = true;
            playMusic(null);
            sfx.fanfare();
            // A sad trombone when you lost: a draw, a CPU win, or (online) someone else won.
            const youLost = e.winner < 0 || (this.net ? e.winner !== this.net.ls.you : this.state.teams[e.winner].cpu);
            if (youLost && !(this.net && this.net.ls.you < 0)) sfx.wahwah();
            // Only matches against someone have a winner for the player; the rest are just done.
            const m = this.usageMode;
            this.usageEnd(m !== 'cpu' && m !== 'online' ? 'done' : e.winner < 0 ? 'draw' : youLost ? 'lost' : 'won');
            if (this.tally) {
              noteCpuResult(e.winner === 0);
              void reportCpuMatch({ won: e.winner === 0, ...this.tally.teams[0] }).then((slime) => {
                if (slime > 0 && !this.destroyed) this.hud.showBanner(t('+{n} Slime 🟢', { n: slime }), 0x5aa83a, 3);
              });
            }
            if (this.playback) {
              setTimeout(() => this.replayOver(), 3000);
              break;
            }
            // Kept for Replays (the last few matches, on this device).
            const rec = this.matchRec.finish(this.state, (id) => teamLabel(this.state.teams[id]));
            if (rec) keepReplay(rec);
            if (this.coach || this.challenge) break; // the coach, or the challenge result, says how it went
            const labels: [string, string] = this.net ? [t('Back to room'), t('Leave')] : [t('Play again'), t('Main menu')];
            setTimeout(() => this.showResults(labels), 4200); // after the victory dance
          }
          break;
      }
    }
  }

  /** Which realm and weather this match got, then whose turn it is. */
  private announceMap(): void {
    const s = this.state;
    if (s.race || s.practice || this.coach) {
      this.announceTurn();
      return;
    }
    const sky = WEATHER_NAMES[s.weather.kind];
    this.hud.showBanner(sky ? t('{map} · {weather}', { map: t(mapStyleName(s.realm)), weather: t(sky) }) : t(mapStyleName(s.realm)), 0xffffff, 1.6);
    setTimeout(() => {
      if (!this.destroyed) this.announceTurn();
    }, 1700);
  }

  private announceTurn(): void {
    const s = this.state;
    const team = s.teams[s.turn.teamIdx];
    const who = s.tardis.find((x) => x.id === s.turn.activeTardi);
    const c = this.challenge;
    if (c?.kind === 'targets' && team.id === 0) this.hud.showBanner(t('Turn {n} of {total}', { n: Math.min(TARGET_TURNS, c.turns + 1), total: TARGET_TURNS }), 0xffffff);
    else if (who) this.hud.showBanner(t("{name}'s turn!", { name: tardiLabel(who) || teamLabel(team) }), shown(team.color));
    this.renderer.camera.manualUntil = 0;
    this.renderer.camera.held = false;
    this.renderer.camera.heldAt = null;
  }

  private attachPointer(): void {
    const c = this.app.canvas;
    c.style.touchAction = 'none';
    // Mouse buttons bound in Settings (right-click opens the weapons by default).
    c.oncontextmenu = (e) => e.preventDefault();
    // No middle-click autoscroll, and the mouse's back/forward buttons don't leave the game.
    c.onmousedown = (e) => {
      if (e.button === 1) e.preventDefault();
    };
    c.onmouseup = (e) => {
      if (e.button >= 3) e.preventDefault();
    };
    c.onpointerdown = (e) => {
      unlockAudio();
      // Poked an easter egg (the duck, the saucer)?
      const egg = this.renderer.tapEgg(e.clientX, e.clientY);
      if (egg && findEgg(egg)) return;
      if (e.pointerType === 'mouse' && this.mouseAction(e, true)) return;
      c.setPointerCapture(e.pointerId);
      // A drag that starts on your own tardi aims instead of moving the camera.
      const aim = this.pointers.size === 0 && e.button === 0 && this.nearActiveTardi(e.clientX, e.clientY);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, aim, button: e.button });
      if (this.pointers.size === 2) this.pinchDist = this.pointerSpread();
    };
    c.onpointermove = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const cam = this.renderer.camera;
      if (this.pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const d = this.pointerSpread();
        if (this.pinchDist > 0) cam.zoom = Math.max(this.renderer.minZoom(), Math.min(3, cam.zoom * (d / this.pinchDist)));
        this.pinchDist = d;
        p.moved = true;
        cam.manualUntil = performance.now() + 3000;
        cam.held = true;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 8) p.moved = true;
      if (p.aim) {
        if (p.moved) this.dragAim(e.clientX, e.clientY);
        return;
      }
      if (p.moved) {
        cam.x -= dx / cam.zoom;
        cam.y -= dy / cam.zoom;
        cam.manualUntil = performance.now() + 2500;
        cam.held = true;
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') this.mouseAction(e, false);
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (p && !p.moved && p.button === 0 && this.isHumanTurn()) this.pickTarget(e.clientX, e.clientY);
    };
    c.onpointerup = up;
    c.onpointercancel = up;
    c.onwheel = (e) => {
      e.preventDefault();
      const cam = this.renderer.camera;
      cam.zoom = Math.max(this.renderer.minZoom(), Math.min(3, cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    };
  }

  private pickTarget(sx: number, sy: number): void {
    const w = this.renderer.screenToWorld(sx, sy);
    this.input.command({ t: 'target', x: Math.round(w.x), y: Math.round(w.y) });
  }

  /** Mouse buttons held for an action, so letting go ends it. */
  private mouseHeld = new Set<number>();

  /**
   * A mouse button bound to an action in Settings. Returns true when it did
   * that action (so it doesn't also scroll the map or pick a target).
   */
  private mouseAction(e: PointerEvent, down: boolean): boolean {
    const code = `Mouse${e.button}`;
    if (!down) {
      if (!this.mouseHeld.delete(e.button)) return false;
      this.input.hold(code, 0, false);
      return true;
    }
    const action = actionFor(controls(), code);
    if (!action) return false;
    // Fire on a click, with a weapon that needs a target: the first click picks
    // the spot; clicking that spot again fires.
    const s = this.state;
    const def = WEAPONS[s.turn.weapon];
    if (action === 'fire' && this.isHumanTurn() && s.turn.phase === 'aim' && def && (def.kind === 'target' || def.projectile?.homing)) {
      const tg = s.turn.target;
      const cam = this.renderer.camera;
      const w = this.renderer.screenToWorld(e.clientX, e.clientY);
      if (!tg || Math.hypot(w.x - tg.x, w.y - tg.y) * cam.zoom > 40) {
        this.pickTarget(e.clientX, e.clientY);
        return true;
      }
    }
    this.mouseHeld.add(e.button);
    this.app.canvas.setPointerCapture(e.pointerId);
    doAction(this.input, this.keyHooks, action, code, true);
    return true;
  }

  /** Is this screen point on (or close to) the tardi whose turn it is? */
  private nearActiveTardi(sx: number, sy: number): boolean {
    const s = this.state;
    const me = s.tardis.find((x) => x.id === s.turn.activeTardi);
    if (!me || !this.isHumanTurn() || s.turn.phase !== 'aim' || me.rope) return false;
    const w = this.renderer.screenToWorld(sx, sy);
    return Math.hypot(w.x - me.x, w.y - me.y) * this.renderer.camera.zoom < 48;
  }

  /** Point the crosshair from the active tardi towards a screen point. */
  private dragAim(sx: number, sy: number): void {
    const s = this.state;
    const me = s.tardis.find((x) => x.id === s.turn.activeTardi);
    if (!me || !this.isHumanTurn()) return;
    const w = this.renderer.screenToWorld(sx, sy);
    const dx = w.x - me.x;
    const dy = w.y - me.y;
    if (Math.hypot(dx, dy) < 6) return;
    const facing = Math.abs(dx) < 2 ? me.facing : dx > 0 ? 1 : -1;
    const aim = (Math.atan2(-dy, Math.abs(dx)) * ANGLE_FULL) / (2 * Math.PI);
    this.input.command({ t: 'aim', facing, aim: Math.round(aim) });
  }

  private pointerSpread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  destroy(): void {
    this.destroyed = true;
    this.usageEnd('left');
    onEggFound(null);
    this.offNet?.();
    if (this.net) this.net.client.onDrop = null;
    this.net = null;
    this.app.ticker.remove(this.tickerFn);
    this.detachKeys();
    const c = this.app.canvas;
    c.onpointerdown = c.onpointermove = c.onpointerup = c.onpointercancel = null;
    c.onwheel = null;
    c.oncontextmenu = null;
    c.onmousedown = c.onmouseup = null;
    this.hud.togglePanel(false);
    this.renderer.destroy();
    this.ui.innerHTML = '';
  }
}
