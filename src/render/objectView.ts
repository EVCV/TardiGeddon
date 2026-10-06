// Vector-cartoon art for map objects: mines, brine drums and supply crates.

import { Container, Graphics } from 'pixi.js';
import type { MapObject } from '../sim/types';
import { PALETTE } from './palette';
import { drawLeafChute } from './tardiView';

const O = PALETTE.outline;

function drawMine(g: Graphics): void {
  for (const [dx, dy] of [[-6, 0], [6, 0], [-4, -4], [4, -4]]) {
    g.moveTo(0, 0).lineTo(dx, dy).stroke({ width: 2, color: O });
  }
  g.ellipse(0, 1, 6, 4).fill(0x4a4658).stroke({ width: 1.4, color: O });
  g.ellipse(-1.5, -0.5, 2, 1).fill({ color: 0xffffff, alpha: 0.35 });
}

function drawDrum(g: Graphics): void {
  g.roundRect(-7, -8, 14, 16, 3).fill(0x3a8fd6).stroke({ width: 1.6, color: O });
  g.moveTo(-7, -3).lineTo(7, -3).moveTo(-7, 3).lineTo(7, 3).stroke({ width: 1.2, color: 0x1f5e99 });
  g.ellipse(0, -8, 7, 2).fill(0x6fb4ee).stroke({ width: 1.2, color: O });
  // Salt crystal badge
  g.poly([0, -2, 3, 0.5, 0, 3, -3, 0.5]).fill(0xffffff).stroke({ width: 1, color: O });
  g.roundRect(-5, -6, 2, 10, 1).fill({ color: 0xffffff, alpha: 0.25 });
}

function drawCrate(g: Graphics, health: boolean): void {
  g.roundRect(-8, -8, 16, 16, 2).fill(0xc08a4a).stroke({ width: 1.6, color: O });
  g.moveTo(-8, -8).lineTo(8, 8).moveTo(8, -8).lineTo(-8, 8).stroke({ width: 1.1, color: 0x8f5f2e });
  if (health) {
    g.roundRect(-5, -5, 10, 10, 2).fill(0xffffff).stroke({ width: 1, color: O });
    g.rect(-1.3, -3.6, 2.6, 7.2).fill(0x3cb34a);
    g.rect(-3.6, -1.3, 7.2, 2.6).fill(0x3cb34a);
  } else {
    g.circle(0, 0, 5).fill(0xffd84a).stroke({ width: 1, color: O });
    g.moveTo(-1.8, -1.8).quadraticCurveTo(0, -4, 1.8, -1.8).quadraticCurveTo(1.8, 0, 0, 0.6).lineTo(0, 1.6);
    g.stroke({ width: 1.2, color: O });
    g.circle(0, 3, 0.7).fill(O);
  }
}

export class ObjectView {
  readonly root = new Container();
  private light = new Graphics();
  private chute = new Graphics();

  constructor(o: MapObject) {
    const g = new Graphics();
    if (o.kind === 'mine') drawMine(g);
    else if (o.kind === 'drum') drawDrum(g);
    else drawCrate(g, o.contents === 'health');
    this.root.addChild(g);
    if (o.kind === 'mine') this.root.addChild(this.light);
    if (o.kind === 'crate') {
      drawLeafChute(this.chute);
      this.chute.position.set(0, -2);
      this.root.addChild(this.chute);
    }
  }

  update(o: MapObject, x: number, y: number, time: number): void {
    this.root.position.set(x, y);
    this.chute.visible = o.chute;
    if (o.chute) this.chute.rotation = Math.sin(time * 2.5 + o.id) * 0.12;
    if (o.kind === 'mine') {
      // Slow green blink when idle, fast red when armed, grey when a dud.
      const armed = o.fuse > 0;
      const on = armed ? Math.sin(time * 18) > 0 : Math.sin(time * 3 + o.id) > 0.6;
      const color = o.fuse === -2 ? 0x777777 : armed ? 0xff3b3b : 0x5cff7a;
      this.light.clear();
      this.light.circle(0, -3.5, 1.8).fill({ color, alpha: on || o.fuse === -2 ? 1 : 0.35 }).stroke({ width: 0.8, color: O });
    }
  }
}
