// Vector-cartoon tardigrade, drawn from layered shapes so cosmetics
// (hats, colours) can be swapped as extra layers later.

import { Container, Graphics, Text } from 'pixi.js';
import type { Tardi } from '../sim/types';
import { PALETTE, hex } from './palette';
import { drawHatPixi } from './hats';
import { patternMarks, skinById, type SkinDef } from './skins';

const O = PALETTE.outline;

export function drawTardiBody(g: Graphics, teamColor: number, hat = 'beanie', skinId = 'classic'): void {
  const skin = skinById(skinId);
  // Back legs (darker, behind the body)
  for (const lx of [-5, 4]) {
    g.roundRect(lx - 1.6, 1, 3.4, 6.5, 1.6).fill(skin.shade).stroke({ width: 1.2, color: O });
  }
  // Body: plump segmented capsule
  g.ellipse(0, -1, 12, 7.5).fill(skin.body).stroke({ width: 1.6, color: O });
  // Skin pattern (spots, stripes...)
  const marks = patternMarks(skin.pattern);
  for (const [x0, y0, x1, y1] of marks.stripes) g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1.6, color: skin.mark, cap: 'round' });
  for (const [x, y, r] of marks.circles) g.circle(x, y, r).fill(skin.mark);
  // Belly shade
  g.ellipse(-1, 2.5, 9, 3).fill({ color: skin.shade, alpha: 0.55 });
  // Segment creases
  for (const sx of [-6, -1.5, 3]) {
    g.moveTo(sx, -7).quadraticCurveTo(sx - 1.5, -2, sx, 2).stroke({ width: 0.9, color: skin.shade });
  }
  // Round mouth / snout
  g.circle(11.5, 0.5, 2.4).fill(skin.mouth).stroke({ width: 1.2, color: O });
  g.circle(11.9, 0.5, 0.9).fill(O);
  // Eyes (big and expressive)
  g.circle(4.5, -4.5, 2.1).fill(PALETTE.eyeWhite).stroke({ width: 1, color: O });
  g.circle(7.6, -3.8, 2.7).fill(PALETTE.eyeWhite).stroke({ width: 1.1, color: O });
  g.circle(5, -4.4, 1.1).fill(PALETTE.pupil);
  g.circle(8.3, -3.6, 1.4).fill(PALETTE.pupil);
  g.circle(8.7, -4.2, 0.5).fill(PALETTE.eyeWhite);
  // Hat (first cosmetic slot)
  drawHatPixi(g, hat, teamColor, 2.5, -6.6, 4);
}

/** Leaf canopy with silk strings, drawn above the tardi's origin. */
export function drawLeafChute(g: Graphics): void {
  g.moveTo(-8, -6).lineTo(-15, -26).moveTo(8, -6).lineTo(15, -26).moveTo(0, -8).lineTo(0, -28);
  g.stroke({ width: 1, color: O, alpha: 0.7 });
  g.moveTo(-24, -26).quadraticCurveTo(0, -52, 24, -26).quadraticCurveTo(0, -34, -24, -26).closePath();
  g.fill(0x6fcf4a).stroke({ width: 1.6, color: O });
  g.moveTo(-20, -28).quadraticCurveTo(0, -38, 20, -28).stroke({ width: 1, color: 0x2e5a1c });
  for (const x of [-12, -4, 4, 12]) g.moveTo(x * 0.4, -36).lineTo(x, -30).stroke({ width: 0.9, color: 0x2e5a1c });
}

/** Cosmetic moods layered over the normal animation. */
export type Mood = 'none' | 'dance' | 'teeter';

export class TardiView {
  readonly root = new Container();
  mood: Mood = 'none';
  /** Which way a teetering tardi is about to fall (-1 left, 1 right). */
  teeterDir = 1;
  /** 0..1 while curling up into a tun before popping (comedy death), else -1. */
  dying = -1;
  private body = new Container();
  private legs = new Graphics();
  private label: Text;
  private hpText: Text;
  private shownHp: number;
  private chute = new Graphics();
  private skin: SkinDef;

  constructor(
    t: Tardi,
    teamColor: number,
    hat = 'beanie',
    skin = 'classic',
  ) {
    this.skin = skinById(skin);
    const g = new Graphics();
    drawTardiBody(g, teamColor, hat, skin);
    this.body.addChild(g, this.legs);
    // Lift the art so the claws rest on the physics circle's bottom.
    this.body.y = -2;
    this.root.addChild(this.body);
    drawLeafChute(this.chute);
    this.chute.visible = false;
    this.root.addChild(this.chute);
    const style = {
      fontFamily: 'Luckiest Guy, Arial Black, sans-serif',
      fontSize: 12,
      fill: hex(teamColor),
      stroke: { color: '#1b1016', width: 3, join: 'round' as const },
      letterSpacing: 0.5,
    };
    this.label = new Text({ text: t.name, style });
    this.label.anchor.set(0.5, 1);
    this.label.position.set(0, -30);
    this.label.resolution = 3;
    this.hpText = new Text({ text: String(t.hp), style: { ...style, fontSize: 12 } });
    this.hpText.anchor.set(0.5, 1);
    this.hpText.position.set(0, -17);
    this.hpText.resolution = 3;
    this.root.addChild(this.label, this.hpText);
    this.shownHp = t.hp;
  }

  update(t: Tardi, x: number, y: number, time: number, active: boolean, showLabels: boolean): void {
    this.root.position.set(x, y);
    this.body.scale.x = t.facing;
    // Breathing / bobbing
    const breathe = 1 + Math.sin(time * 3 + t.id) * 0.03;
    this.body.scale.y = breathe;
    this.body.rotation = t.airborne && t.knocked ? Math.sin(time * 12 + t.id) * 0.6 : 0;

    // Front legs, animated by walk position
    const phase = x * 0.5;
    const g = this.legs;
    g.clear();
    const legXs = [-7.5, -2.5, 2, 6.5];
    legXs.forEach((lx, i) => {
      const lift = t.airborne ? -1.5 : Math.max(0, Math.sin(phase + i * 1.6)) * 1.6;
      const sway = t.airborne ? (i - 1.5) * 0.8 : 0;
      g.roundRect(lx - 1.7 + sway, 2, 3.6, 6 - lift, 1.7).fill(this.skin.body).stroke({ width: 1.2, color: O });
      // Claws
      g.moveTo(lx - 1 + sway, 8 - lift).lineTo(lx - 1.6 + sway, 9.2 - lift).stroke({ width: 0.9, color: O });
      g.moveTo(lx + 1 + sway, 8 - lift).lineTo(lx + 1.6 + sway, 9.2 - lift).stroke({ width: 0.9, color: O });
    });

    // Moods (cosmetic): victory dance, teetering on a cliff edge.
    this.body.y = -2;
    if (this.mood === 'dance') {
      this.body.y = -2 - Math.abs(Math.sin(time * 8 + t.id)) * 7;
      this.body.rotation = Math.sin(time * 6 + t.id) * 0.3;
      this.body.scale.x = Math.sin(time * 3 + t.id) > 0 ? 1 : -1;
    } else if (this.mood === 'teeter') {
      this.body.rotation = this.teeterDir * (0.15 + Math.abs(Math.sin(time * 9 + t.id)) * 0.35);
    }
    if (this.dying >= 0) {
      // Curl up into a tun, wobbling faster and faster, then pop.
      const d = this.dying;
      this.body.scale.set(t.facing * (1 - 0.45 * d), 1 - 0.35 * d);
      this.body.rotation = Math.sin(time * (10 + d * 30)) * 0.25 * d;
    }

    // Poisoned tardis turn sickly green.
    this.body.tint = t.poison ? 0xa8e890 : 0xffffff;
    this.chute.visible = t.chute;
    if (t.chute) this.chute.rotation = Math.sin(time * 2.5 + t.id) * 0.12;

    if (this.shownHp !== t.hp) {
      this.shownHp = t.hp;
      this.hpText.text = String(t.hp);
    }
    this.label.visible = showLabels;
    this.hpText.visible = showLabels;
    const bounce = (active ? Math.abs(Math.sin(time * 4)) * 3 : 0) + (t.chute ? 34 : 0);
    this.label.y = -30 - bounce;
    this.hpText.y = -17 - bounce;
  }
}
