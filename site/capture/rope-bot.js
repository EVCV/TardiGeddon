// A tiny Rope Race "player" for the capture script: injected into the game
// page, called once per video frame. It throws the Silk Rope at the furthest
// rock it can reach ahead, swings forwards, and lets go on the upswing.
(() => {
  const RIGHT = 2;
  const FIRE = 16;
  const JUMP = 1;
  const UP = 4;
  const ROPE_MAX = 310;
  let cool = 0;
  let fire = false;
  let swing = 0;

  /** Where a rope thrown at `deg` degrees above the horizontal (facing right) would stick. */
  function ropeHit(w, t, deg) {
    const dx = Math.cos((deg * Math.PI) / 180);
    const dy = -Math.sin((deg * Math.PI) / 180);
    const { mask, w: W, h: H } = w.terrain;
    for (let i = 12; i < ROPE_MAX; i++) {
      const x = Math.floor(t.x + dx * i);
      const y = Math.floor(t.y + dy * i);
      if (x < 0 || y < 0 || x >= W || y >= H) return null;
      if (mask[y * W + x]) return { x, y, d: i };
    }
    return null;
  }

  window.__bot = () => {
    const m = window.__tardi;
    const w = m.world;
    const t = w.tardis.find((x) => x.id === w.turn.activeTardi);
    if (!t || w.turn.phase !== 'aim') return;
    if (t.rope) {
      m.input.hold('botfire', FIRE, (fire = false));
      // Swing forwards; let go on the upswing once well past the pivot.
      m.input.hold('bot', RIGHT, true);
      // Reel in to a lively length.
      m.input.hold('botreel', UP, t.rope.len > 110);
      swing++;
      const upswing = t.vx > 1.5 && t.vy < 0 && t.x - t.rope.x > t.rope.len * 0.45;
      const stuck = swing > 40 && Math.abs(t.vx) + Math.abs(t.vy) < 0.3;
      if (upswing || stuck || swing > 150) {
        swing = 0;
        m.input.hold('bot', RIGHT, false);
        m.input.hold('botreel', UP, false);
        m.input.press(JUMP);
        cool = 8;
      }
      return;
    }
    if (cool > 0) return void cool--;
    let best = null;
    for (let deg = 25; deg <= 85; deg += 3) {
      const hit = ropeHit(w, t, deg);
      if (hit && hit.d > 70 && hit.y < t.y - 70 && (!best || hit.x > best.hit.x)) best = { deg, hit };
    }
    if (!best) {
      // Nothing in reach: hop forwards (rock may come into reach mid-air).
      if (!t.airborne) {
        m.input.press(JUMP);
        cool = 20;
      }
      return;
    }
    m.input.command({ t: 'aim', facing: 1, aim: Math.round((4096 * best.deg) / 360) });
    // Firing needs a fresh press each time.
    fire = !fire;
    m.input.hold('botfire', FIRE, fire);
  };
})();
