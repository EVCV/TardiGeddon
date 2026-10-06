// Vector-cartoon tardigrade, drawn from layered shapes so cosmetics
// (hats, colours) can be swapped as extra layers later.

import { Container, Graphics, Text } from 'pixi.js';
import type { Tardi } from '../sim/types';
import { PALETTE, hex } from './palette';

const O = PALETTE.outline;

export function drawTardiBody(g: Graphics, teamColor: number): void {
  // Back legs (darker, behind the body)
  for (const lx of [-5, 4]) {
    g.roundRect(lx - 1.6, 1, 3.4, 6.5, 1.6).fill(PALETTE.tardiShade).stroke({ width: 1.2, color: O });
  }
  // Body: plump segmented capsule
  g.ellipse(0, -1, 12, 7.5).fill(PALETTE.tardiBody).stroke({ width: 1.6, color: O });
  // Belly shade
  g.ellipse(-1, 2.5, 9, 3).fill({ color: PALETTE.tardiShade, alpha: 0.55 });
  // Segment creases
  for (const sx of [-6, -1.5, 3]) {
    g.moveTo(sx, -7).quadraticCurveTo(sx - 1.5, -2, sx, 2).stroke({ width: 0.9, color: PALETTE.tardiShade });
  }
  // Round mouth / snout
  g.circle(11.5, 0.5, 2.4).fill(PALETTE.tardiMouth).stroke({ width: 1.2, color: O });
  g.circle(11.9, 0.5, 0.9).fill(O);
  // Eyes (big and expressive)
  g.circle(4.5, -4.5, 2.1).fill(PALETTE.eyeWhite).stroke({ width: 1, color: O });
  g.circle(7.6, -3.8, 2.7).fill(PALETTE.eyeWhite).stroke({ width: 1.1, color: O });
  g.circle(5, -4.4, 1.1).fill(PALETTE.pupil);
  g.circle(8.3, -3.6, 1.4).fill(PALETTE.pupil);
  g.circle(8.7, -4.2, 0.5).fill(PALETTE.eyeWhite);
  // Team beanie (first cosmetic slot)
  g.moveTo(-1.5, -6.6).arc(2.5, -6.6, 4, Math.PI, 0).closePath().fill(teamColor).stroke({ width: 1.3, color: O });
  g.circle(2.5, -11.2, 1.6).fill(0xffffff).stroke({ width: 1, color: O });
}

export class TardiView {
  readonly root = new Container();
  private body = new Container();
  private legs = new Graphics();
  private label: Text;
  private hpText: Text;
  private shownHp: number;

  constructor(
    t: Tardi,
    teamColor: number,
  ) {
    const g = new Graphics();
    drawTardiBody(g, teamColor);
    this.body.addChild(g, this.legs);
    // Lift the art so the claws rest on the physics circle's bottom.
    this.body.y = -2;
    this.root.addChild(this.body);
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
      g.roundRect(lx - 1.7 + sway, 2, 3.6, 6 - lift, 1.7).fill(PALETTE.tardiBody).stroke({ width: 1.2, color: O });
      // Claws
      g.moveTo(lx - 1 + sway, 8 - lift).lineTo(lx - 1.6 + sway, 9.2 - lift).stroke({ width: 0.9, color: O });
      g.moveTo(lx + 1 + sway, 8 - lift).lineTo(lx + 1.6 + sway, 9.2 - lift).stroke({ width: 0.9, color: O });
    });

    if (this.shownHp !== t.hp) {
      this.shownHp = t.hp;
      this.hpText.text = String(t.hp);
    }
    this.label.visible = showLabels;
    this.hpText.visible = showLabels;
    const bounce = active ? Math.abs(Math.sin(time * 4)) * 3 : 0;
    this.label.y = -30 - bounce;
    this.hpText.y = -17 - bounce;
  }
}
