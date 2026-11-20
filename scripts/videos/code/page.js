// Plays an episode (window.__episode, made by scripts/videos/code.mjs) back in
// the editor page: chat messages, files opening, lines deleted and typed, the
// terminal. Immediate mode: every frame is drawn from the state at time T (ms
// since start), and T only comes from requestAnimationFrame, so on the virtual
// clock (site/capture/virtual-clock.js) each filmed frame is exact.
(() => {
  const E = window.__episode;
  const PAL = E.palette;
  const LH = E.layout.lineHeight;
  const FS = E.layout.fontSize;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  let charW = 9;
  let cols = 80;
  let viewH0 = 500;
  let gutterW = 60;
  let textX = 70;
  const TEXT_PAD = 14;

  function measure() {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${FS}px "JetBrains Mono"`;
    charW = c.measureText('MMMMMMMMMM').width / 10;
    const box = $('code').getBoundingClientRect();
    viewH0 = box.height;
    gutterW = Math.round(charW * 4 + 26);
    textX = gutterW + TEXT_PAD;
    cols = Math.max(20, Math.floor((box.width - textX - 22) / charW));
    $('code').style.fontSize = FS + 'px';
    $('code').style.lineHeight = LH + 'px';
  }

  /** A line from [[text, colour], …] tokens: its text and one palette colour per character. */
  const rowOf = (toks) => {
    let text = '';
    const colors = [];
    for (const [s, c] of toks) {
      text += s;
      for (let i = 0; i < s.length; i++) colors.push(c);
    }
    return { text, colors, h: 1, kind: '', mark: '', born: -1e9, sel: null };
  };

  /** Where a line wraps (word wrap at the editor's width, continuation lines indented like the first). */
  function segsOf(r) {
    if (r._st === r.text && r._cols === cols) return r._sg;
    const t = r.text;
    const out = [[0, t.length]];
    if (t.length > cols) {
      out.length = 0;
      const ind = Math.min(t.match(/^ */)[0].length, cols >> 1);
      let s = 0;
      let width = cols;
      while (t.length - s > width) {
        let b = s + width;
        for (let i = b; i > s + (width >> 1); i--)
          if (' ,;(.'.includes(t[i - 1])) {
            b = i;
            break;
          }
        out.push([s, b]);
        s = b;
        width = cols - ind;
      }
      out.push([s, t.length]);
      out.ind = ind;
    }
    r._st = t;
    r._cols = cols;
    r._sg = out;
    return out;
  }

  // ---- state ----
  const S = {
    files: {},
    tabs: [],
    active: null,
    chat: [],
    term: { open: 0, cmd: '', cmdShown: 0, lines: [], shown: 0, opening: null },
    card: null,
    pill: null,
    lastType: -1e9,
    status: 'idle',
  };
  window.__S = S; // (for debugging)
  const file = () => S.files[S.active];

  function openFile(i) {
    const f = E.files[i];
    if (!S.files[f.path]) {
      S.files[f.path] = { path: f.path, lang: f.lang, rows: f.before.map(rowOf), scroll: 0, caret: { row: 0, col: 0 }, dirty: false, total: 0, follow: false };
      S.tabs.push(f.path);
    }
    S.active = f.path;
  }

  /** Top of row `i` (px from the top of the file). */
  function yOf(f, i) {
    let y = 0;
    for (let k = 0; k < i && k < f.rows.length; k++) y += segsOf(f.rows[k]).length * LH * f.rows[k].h;
    return y;
  }
  const viewH = () => viewH0 - S.term.open * termH();
  const termH = () => E.layout.termH;

  // ---- ops ----
  function begin(op, T) {
    const f = file();
    switch (op.type) {
      case 'card':
        S.card = op;
        $('card').innerHTML = op.html;
        break;
      case 'user':
        S.chat.push({ who: 'user', text: op.text, name: op.name, tag: op.tag, born: T });
        break;
      case 'think':
        S.chat.push({ who: 'think', born: T, id: op.id });
        break;
      case 'reply':
        S.chat = S.chat.filter((m) => m.who !== 'think');
        S.chat.push({ who: 'ai', text: op.text, shown: 0, born: T });
        op.msg = S.chat.at(-1);
        break;
      case 'tool': {
        const m = S.chat.find((x) => x.id === op.id);
        if (m) Object.assign(m, { text: op.text, add: op.add, rem: op.rem, done: op.done });
        else S.chat.push({ who: 'tool', id: op.id, text: op.text, add: op.add, rem: op.rem, done: op.done, born: T });
        break;
      }
      case 'open':
        openFile(op.file);
        S.status = 'editing';
        break;
      case 'save':
        if (f) f.dirty = false;
        break;
      case 'scroll': {
        const vh = viewH();
        const total = yOf(f, f.rows.length);
        op.from = f.scroll;
        op.to = clamp(yOf(f, op.row) - vh * op.at, 0, Math.max(0, total - vh * 0.5));
        f.follow = false;
        S.scrolling = op;
        f.caret = { row: op.row, col: (f.rows[op.row]?.text.match(/^ */) ?? [''])[0].length };
        break;
      }
      case 'del':
        for (const i of op.rows) Object.assign(f.rows[i], { kind: 'del', mark: '' });
        f.caret = { row: op.rows[0], col: 0 };
        f.dirty = true;
        break;
      case 'edit': {
        const r = f.rows[op.row];
        const n = rowOf(op.toks);
        op.newText = n.text;
        op.newColors = n.colors;
        op.old = r.text;
        op.oldColors = r.colors;
        f.caret = { row: op.row, col: op.p };
        f.dirty = true;
        break;
      }
      case 'type': {
        const r = rowOf(op.toks);
        op.full = r;
        const row = { text: r.text.slice(0, op.indent), colors: r.colors.slice(0, op.indent), h: 0, kind: '', mark: 'add', born: T, sel: null };
        f.rows.splice(op.row, 0, row);
        op.r = row;
        f.caret = { row: op.row, col: op.indent };
        f.dirty = true;
        break;
      }
      case 'paste':
        op.n = 0;
        op.full = op.lines.map(rowOf);
        S.pill = { text: op.label, from: T, to: T + op.d + 500 };
        f.dirty = true;
        break;
      case 'quiet': {
        const rows = op.lines.map(rowOf);
        for (const r of rows) r.mark = 'add';
        f.rows.splice(op.row, op.del, ...rows);
        f.dirty = true;
        break;
      }
      case 'term':
        S.term.opening = T;
        S.term.cmd = op.cmd;
        S.term.lines = op.lines;
        S.term.cmdShown = 0;
        S.term.shown = 0;
        S.status = 'running tests';
        break;
      case 'done':
        S.status = 'idle';
        break;
    }
  }

  function update(op, t, T) {
    const f = file();
    const p = op.d > 0 ? clamp(t / op.d, 0, 1) : 1;
    switch (op.type) {
      case 'reply': {
        const n = Math.round(op.text.length * p);
        // whole words only
        let k = n;
        while (k < op.text.length && k > 0 && !/\s/.test(op.text[k])) k++;
        op.msg.shown = k;
        break;
      }
      case 'scroll':
        f.scroll = op.from + (op.to - op.from) * ease(p);
        break;
      case 'del': {
        const q = clamp((t - op.mark) / Math.max(1, op.d - op.mark), 0, 1);
        for (const i of op.rows) f.rows[i].h = 1 - ease(q);
        break;
      }
      case 'edit': {
        const r = f.rows[op.row];
        const oldMid = op.old.length - op.p - op.s;
        if (t < op.selD) {
          r.sel = [op.p, op.p + Math.round(oldMid * ease(t / op.selD))];
          f.caret = { row: op.row, col: r.sel[1] };
        } else if (t < op.selD + op.holdD) {
          r.sel = [op.p, op.p + oldMid];
          f.caret = { row: op.row, col: r.sel[1] };
        } else {
          r.sel = null;
          const tt = t - op.selD - op.holdD;
          let k = 0;
          while (k < op.times.length && op.times[k] <= tt) k++;
          const nt = op.newText;
          const ns = nt.length - op.s;
          r.text = nt.slice(0, op.p + k) + nt.slice(ns);
          r.colors = op.newColors.slice(0, op.p + k).concat(op.newColors.slice(ns));
          f.caret = { row: op.row, col: op.p + k };
          if (k > 0) S.lastType = T;
        }
        break;
      }
      case 'type': {
        op.r.h = clamp(t / 90, 0, 1);
        let k = 0;
        while (k < op.times.length && op.times[k] <= t) k++;
        const n = op.indent + k;
        op.r.text = op.full.text.slice(0, n);
        op.r.colors = op.full.colors.slice(0, n);
        f.caret = { row: op.row, col: n };
        if (k > 0) S.lastType = T;
        break;
      }
      case 'paste': {
        const want = Math.min(op.full.length, Math.floor(t / op.every) + 1);
        while (op.n < want) {
          const r = op.full[op.n];
          r.mark = 'add';
          r.born = T;
          f.rows.splice(op.row + op.n, 0, r);
          op.n++;
        }
        f.caret = { row: op.row + op.n - 1, col: op.full[op.n - 1].text.length };
        f.follow = true;
        S.lastType = T;
        break;
      }
      case 'term': {
        const tt = t - 350;
        S.term.cmdShown = clamp(Math.floor(tt / op.cmdEvery), 0, op.cmd.length);
        const out = tt - op.cmd.length * op.cmdEvery - op.runD;
        S.term.shown = out < 0 ? 0 : Math.min(op.lines.length, Math.floor(out / op.lineEvery) + 1);
        break;
      }
    }
  }

  function end(op, T) {
    const f = file();
    switch (op.type) {
      case 'card':
        S.card = null;
        break;
      case 'scroll':
        S.scrolling = null;
        break;
      case 'del':
        for (const i of [...op.rows].sort((a, b) => b - a)) f.rows.splice(i, 1);
        f.caret = { row: Math.min(op.rows[0], f.rows.length - 1), col: 0 };
        break;
      case 'edit': {
        const r = f.rows[op.row];
        r.text = op.newText;
        r.colors = op.newColors;
        r.sel = null;
        r.mark = r.mark || 'mod';
        r.born = T;
        break;
      }
      case 'type':
        op.r.text = op.full.text;
        op.r.colors = op.full.colors;
        op.r.h = 1;
        break;
    }
  }

  // ---- drawing ----
  function spans(r, a, b) {
    let h = '';
    let i = a;
    const sel = r.sel;
    while (i < b) {
      const c = r.colors[i];
      const s = sel && i >= sel[0] && i < sel[1];
      let j = i + 1;
      while (j < b && r.colors[j] === c && (sel && j >= sel[0] && j < sel[1]) === s) j++;
      const txt = esc(r.text.slice(i, j));
      h += `<span style="color:${PAL[c] ?? '#d4d4d4'}"${s ? ' class="sel"' : ''}>${txt}</span>`;
      i = j;
    }
    return h;
  }

  let lastChat = '';
  let lastSide = '';
  let lastTabs = '';
  function render(T, dt) {
    const f = file();
    const code = $('code');
    // Terminal height
    if (S.term.opening != null) S.term.open = ease(clamp((T - S.term.opening) / 350, 0, 1));
    $('term').style.height = Math.round(S.term.open * termH()) + 'px';
    if (f) {
      const vh = viewH();
      // Follow the caret while typing, like an editor does.
      const cr = f.caret.row;
      let y = 0;
      let num = 0;
      let html = '';
      let caretY = null;
      let caretX = textX;
      let caretSeg = 0;
      const marks = [];
      const rowsY = [];
      for (let i = 0; i < f.rows.length; i++) {
        const r = f.rows[i];
        const sg = segsOf(r);
        rowsY.push(y);
        const hh = sg.length * LH * r.h;
        if (r.kind !== 'del') num++;
        if (r.mark) marks.push([y, r.mark]);
        if (i === cr) {
          const col = Math.min(f.caret.col, r.text.length);
          let si = sg.length - 1;
          for (let k = 0; k < sg.length; k++)
            if (col < sg[k][1] || k === sg.length - 1) {
              si = k;
              break;
            }
          caretSeg = si;
          caretY = y + si * LH;
          caretX = textX + (si > 0 ? (sg.ind ?? 0) * charW : 0) + (col - sg[si][0]) * charW;
        }
        r._y = y;
        r._n = num;
        y += hh;
      }
      f.total = y;
      if (caretY != null && !S.scrolling) {
        const rel = caretY - f.scroll;
        if (rel > vh * 0.72 || rel < vh * 0.1) f.follow = true;
        if (f.follow) {
          const target = clamp(caretY - vh * 0.42, 0, Math.max(0, y - vh * 0.5));
          const k = 1 - Math.exp(-dt / 140);
          f.scroll += (target - f.scroll) * k;
          if (Math.abs(target - f.scroll) < 0.5) {
            f.scroll = target;
            f.follow = false;
          }
        }
      }
      const sc = f.scroll;
      for (let i = 0; i < f.rows.length; i++) {
        const r = f.rows[i];
        const top = rowsY[i];
        const sg = segsOf(r);
        const hh = sg.length * LH * r.h;
        if (hh < 0.5 || top + hh < sc || top > sc + vh) continue;
        let segs = '';
        for (let k = 0; k < sg.length; k++) {
          const left = textX + (k > 0 ? (sg.ind ?? 0) * charW : 0);
          segs += `<div class="seg" style="top:${k * LH}px;left:${left}px;height:${LH}px">${spans(r, sg[k][0], sg[k][1])}</div>`;
        }
        let bg = '';
        if (r.kind !== 'del' && r.mark && T - r.born < 2400) {
          const a = 0.26 * (1 - clamp((T - r.born - 600) / 1800, 0, 1));
          bg = `background:rgba(${r.mark === 'add' ? '46,160,67' : '0,120,212'},${a.toFixed(3)});`;
        }
        const cur = i === cr && r.kind !== 'del' ? ' cur' : '';
        const ln = r.kind === 'del' ? '' : String(r._n);
        html +=
          `<div class="row ${r.kind}${cur}" style="top:${(top - sc).toFixed(2)}px;height:${hh.toFixed(2)}px;${bg}">` +
          `<span class="ln${cur ? ' on' : ''}" style="width:${gutterW - 12}px;height:${LH}px">${ln}</span>` +
          (r.mark && r.kind !== 'del' ? `<span class="mk ${r.mark}" style="left:${gutterW - 6}px"></span>` : '') +
          segs +
          '</div>';
      }
      // Scrollbar with change markers
      const total = Math.max(y, vh);
      let sb = `<div class="thumb" style="top:${((sc / total) * vh).toFixed(1)}px;height:${Math.max(20, (vh / total) * vh).toFixed(1)}px"></div>`;
      for (const [my, m] of marks) sb += `<div class="m" style="top:${((my / total) * vh).toFixed(1)}px;background:${m === 'add' ? '#2ea043' : '#0078d4'}"></div>`;
      html += `<div id="sbar">${sb}</div>`;
      // Caret: solid while typing, blinking when idle.
      const idle = T - S.lastType;
      const on = idle < 500 || Math.floor((idle - 500) / 530) % 2 === 0;
      if (caretY != null && caretY - sc > -LH && caretY - sc < vh) {
        html += `<div id="caret" style="left:${caretX.toFixed(1)}px;top:${(caretY - sc + 2).toFixed(1)}px;height:${LH - 4}px;opacity:${on ? 1 : 0}"></div>`;
        // The name flag shows when Claude's cursor jumps to a new place, then fades so it never hides the code.
        const where = `${S.active}:${cr}`;
        if (where !== S.flagWhere && !(S.flagWhere?.startsWith(S.active + ':') && Math.abs(+S.flagWhere.split(':').pop() - cr) <= 1)) S.flagAt = T;
        S.flagWhere = where;
        const fa = clamp(1 - (T - (S.flagAt ?? -1e9) - 1300) / 400, 0, 1);
        if (fa > 0) html += `<div id="flag" style="opacity:${fa.toFixed(2)};left:${caretX.toFixed(1)}px;top:${(caretY - sc < 20 ? caretY - sc + LH : caretY - sc - 17).toFixed(1)}px">Claude</div>`;
      }
      if (S.pill && T >= S.pill.from && T < S.pill.to) {
        const a = clamp(Math.min((T - S.pill.from) / 150, (S.pill.to - T) / 250), 0, 1);
        html += `<div id="pill" style="opacity:${a.toFixed(2)}">${esc(S.pill.text)}</div>`;
      }
      code.innerHTML = html;
      // Tabs, breadcrumbs, title, status
      const tabs = S.tabs
        .map((p) => {
          const g = S.files[p];
          return `<div class="tab${p === S.active ? ' on' : ''}${g.dirty ? ' dirty' : ''}"><span class="fi">${ext(p)}</span>${esc(base(p))}<span class="x"></span></div>`;
        })
        .join('');
      if (tabs !== lastTabs) {
        $('tabs').innerHTML = tabs;
        lastTabs = tabs;
      }
      $('crumbs').innerHTML = f.path.split('/').map(esc).join(' <span>›</span> ');
      $('title-name').textContent = `${base(f.path)} — TardiGeddon`;
      const r = f.rows[cr];
      $('st-pos').textContent = `Ln ${r ? r._n : 1}, Col ${f.caret.col + 1}`;
      $('st-lang').textContent = E.langNames[f.lang] ?? f.lang;
    } else {
      code.innerHTML = '';
    }
    $('st-claude').textContent = `Claude: ${S.status}`;
    renderSide();
    renderChat(T);
    renderTerm();
    // Title card
    const card = $('card');
    if (S.card) {
      const t = T - S.card.t;
      const a = clamp(Math.min(t / 300, (S.card.d - t) / 350), 0, 1);
      card.style.display = 'flex';
      card.style.opacity = (S.card.fadeIn === false ? Math.min(1, (S.card.d - t) / 350) : a).toFixed(3);
    } else card.style.display = 'none';
  }

  const base = (p) => p.split('/').pop();
  const ext = (p) => {
    const e = p.split('.').pop();
    return { ts: 'TS', tsx: 'TSX', js: 'JS', mjs: 'JS', css: '#', md: 'M↓', json: '{}', html: '<>', swift: 'SW', java: 'J' }[e] ?? '•';
  };

  function renderSide() {
    let h = '';
    for (const n of E.tree) {
      if (n.dir) h += `<div class="tr" style="padding-left:${8 + n.depth * 10}px"><span class="chev">▾</span><span class="nm">${esc(n.name)}</span></div>`;
      else h += `<div class="tr ${n.status}${n.path === S.active ? ' on' : ''}" style="padding-left:${8 + n.depth * 10 + 16}px"><span class="fi">${ext(n.path)}</span><span class="nm">${esc(n.name)}</span><span class="st">${n.status}</span></div>`;
    }
    if (h !== lastSide) {
      $('tree').innerHTML = h;
      lastSide = h;
    }
  }

  function renderChat(T) {
    let h = '';
    for (const m of S.chat) {
      const a = clamp((T - m.born) / 250, 0, 1).toFixed(2);
      if (m.who === 'user') h += `<div class="msg user" style="opacity:${a}"><div class="who">${esc(m.name)}${m.tag ? ` <span class="tag">${esc(m.tag)}</span>` : ''}</div><div class="bubble">${md(m.text)}</div></div>`;
      else if (m.who === 'ai') h += `<div class="msg ai" style="opacity:${a}"><div class="who"><i class="dot"></i>Claude</div><div class="txt">${md(m.text.slice(0, m.shown))}</div></div>`;
      else if (m.who === 'think') h += `<div class="msg ai" style="opacity:${a}"><div class="who"><i class="dot"></i>Claude</div><div class="think">Thinking${'.'.repeat(1 + (Math.floor((T - m.born) / 300) % 3))}</div></div>`;
      else if (m.who === 'tool')
        h += `<div class="tool" style="opacity:${a}"><span class="ic">${m.done ? '✓' : '✎'}</span><span class="p">${esc(m.text)}</span>${m.add != null ? `<span class="a">+${m.add}</span><span class="r">−${m.rem}</span>` : ''}</div>`;
    }
    const log = $('chat-log');
    if (h !== lastChat) {
      log.innerHTML = h;
      lastChat = h;
    }
    log.scrollTop = log.scrollHeight;
  }

  function renderTerm() {
    if (!S.term.opening && S.term.opening !== 0) return;
    const t = S.term;
    let h = `<div class="th"><span>PROBLEMS</span><span>OUTPUT</span><b>TERMINAL</b></div><pre><span class="ps">$</span> ${esc(t.cmd.slice(0, t.cmdShown))}\n${t.lines.slice(0, t.shown).join('\n')}</pre>`;
    if (h !== renderTerm.last) {
      $('term').innerHTML = h;
      renderTerm.last = h;
      const pre = $('term').querySelector('pre');
      pre.scrollTop = pre.scrollHeight;
    }
    const pre = $('term').querySelector('pre');
    // Keep the newest output in view (the panel is a fixed height).
    const over = pre.scrollHeight - (termH() - 30);
    pre.style.transform = over > 0 ? `translateY(${-over}px)` : '';
  }

  // ---- the clock ----
  const ops = E.ops;
  let next = 0;
  const live = [];
  let lastT = 0;
  // Strictly in order: a step that ends this frame finishes before the next one begins
  // (a deletion must take its rows out before the next line is typed in their place).
  const finish = (T) => {
    for (let i = 0; i < live.length; i++)
      if (T - live[i].t >= live[i].d) {
        update(live[i], live[i].d, T);
        end(live[i], T);
        live.splice(i--, 1);
      }
  };
  function frame(T) {
    finish(T);
    while (next < ops.length && ops[next].t <= T) {
      const op = ops[next++];
      finish(op.t);
      begin(op, T);
      live.push(op);
      finish(T);
    }
    for (const op of live) update(op, T - op.t, T);
    S.T = T;
    S.live = live;
    render(T, Math.max(0, T - lastT));
    lastT = T;
  }

  let t0 = 0;
  let started = false;
  function loop(now) {
    if (started) frame(now - t0);
    requestAnimationFrame(loop);
  }
  window.__player = {
    total: E.total,
    ready: false,
    start() {
      t0 = performance.now();
      started = true;
    },
    thumb(on) {
      document.body.classList.toggle('thumbing', on);
    },
  };
  // Load the code font before measuring it: until something uses it, a canvas would measure a fallback.
  Promise.all([`${FS}px "JetBrains Mono"`, `bold ${FS}px "JetBrains Mono"`, '14px Nunito', '800 14px Nunito', '40px "Luckiest Guy"'].map((f) => document.fonts.load(f)))
    .then(() => document.fonts.ready)
    .then(() => {
    measure();
    window.__player.ready = true;
    requestAnimationFrame(loop);
    if (E.autoplay) window.__player.start();
  });
})();
