// Injected into the game page before it loads (Playwright addInitScript).
// Lets the capture script freeze time and then advance it one video frame at
// a time, so recorded clips are perfectly smooth however slowly the headless
// browser renders. Until __virt.freeze() is called everything runs normally.
(() => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancelRaf = window.cancelAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);

  let frozen = false;
  let now = 0;
  let nextId = 1e7;
  let rafQueue = [];
  let timers = [];

  performance.now = () => (frozen ? now : realNow());
  window.requestAnimationFrame = (cb) => {
    if (!frozen) return realRaf(cb);
    const id = ++nextId;
    rafQueue.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    rafQueue = rafQueue.filter((r) => r.id !== id);
    realCancelRaf(id);
  };
  window.setTimeout = (cb, ms = 0, ...args) => {
    if (!frozen || typeof cb !== 'function') return realSetTimeout(cb, ms, ...args);
    const id = ++nextId;
    timers.push({ id, due: now + ms, cb, args });
    return id;
  };
  window.clearTimeout = (id) => {
    timers = timers.filter((t) => t.id !== id);
    realClearTimeout(id);
  };

  // With window.__seed set (by an earlier init script), Math.random is
  // seeded too, so a whole run (map, CPU, effects) can be replayed exactly.
  if (typeof window.__seed === 'number') {
    let a = window.__seed >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.__virt = {
    /** Stop the clock. Resolves once the frame already requested from the
     *  real clock has run, so the game's next frame is in our queue. */
    freeze() {
      now = realNow();
      frozen = true;
      return new Promise((resolve, reject) => {
        const t0 = realNow();
        const check = () => {
          if (rafQueue.length > 0) resolve();
          else if (realNow() - t0 > 5000) reject(new Error('the game never asked for a frame'));
          else realSetTimeout(check, 20);
        };
        check();
      });
    },
    /** Advance the clock by `ms`, firing due timers and then one animation frame. */
    step(ms) {
      now += ms;
      for (;;) {
        const due = timers.filter((t) => t.due <= now).sort((a, b) => a.due - b.due)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        due.cb(...due.args);
      }
      const q = rafQueue;
      rafQueue = [];
      for (const r of q) r.cb(now);
    },
  };
})();
