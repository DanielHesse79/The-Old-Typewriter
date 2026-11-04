/*
 * The Old Typewriter - rendering engine
 *
 * Turns plain text into pages that look typed on a 1950s typewriter and
 * touched up by a secretary: uneven strikes, fading ribbon, dirty type,
 * x'ed-out typos with pen corrections, aged paper.
 *
 * Markup:
 *   [fel|rätt]   typed "fel", x'ed out, "rätt" written above in pen
 *   [|ord]       word inserted by hand with a caret
 *   _text_       underlined the typewriter way
 *
 * Jitter ranges are inspired by bozdoz/typewritesomething (MIT).
 * Default font TT2020 by ctrlcctrlv (OFL-1.1), see fonts/LICENSE-TT2020.txt.
 */
(function (global) {
  'use strict';

  // Canvas factory: replaced via Typewriter.configure() when running in Node.
  let makeCanvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  const DPI = 120; // logical resolution; 1 inch = 120 units

  const FONTS = {
    tt2020:  { label: 'TT2020 (medföljer)', name: 'TT2020',        family: '"TT2020", "Courier New", monospace' },
    elite:   { label: 'Special Elite',      name: 'Special Elite', family: '"Special Elite", "Courier New", monospace' },
    courier: { label: 'Courier Prime',      name: 'Courier Prime', family: '"Courier Prime", "Courier New", monospace' },
    cutive:  { label: 'Cutive Mono',        name: 'Cutive Mono',   family: '"Cutive Mono", "Courier New", monospace' },
    plain:   { label: 'Courier New',        name: 'Courier New',   family: '"Courier New", monospace' },
  };
  const HAND = '"Reenie Beanie", "Caveat", "Segoe Script", "Bradley Hand", cursive';
  const SIG = '"Mrs Saint Delafield", "Segoe Script", "Brush Script MT", cursive';

  const INKS = { black: '#15130f', blueblack: '#171c2e', purple: '#3a2b58' };
  const PENS = { blue: '#1f3a93', black: '#12110f', red: '#a3201c' };
  const SIG_INKS = { blue: '#1a2f9a', blueblack: '#1b2347', black: '#12110f' }; // fountain pen
  const PAPERS = { a4: [8.27, 11.69], letter: [8.5, 11], quarto: [8, 10] };
  const TYPED = new Set(['tipex', 'eraser', 'tape']); // corrections retyped in place

  const DEFAULTS = {
    seed: 1953, font: 'tt2020', cpi: 10, spacing: 1, paper: 'a4',
    ink: 'black', inkStrength: 0.9, slop: 0.6, dirt: 0.5, wear: 0.4,
    typos: 0.04, corrStyle: 'mix', pen: 'blue',
    touch: 0.8, relief: 0.7, sigInk: 'blue', sigSmudge: 0.5,
    marginLeft: 1.25, marginRight: 0.9, marginTop: 1.15, marginBottom: 1,
    age: 0.5, folds: true, stain: false, scale: 1.5,
  };

  const QWERTY = {
    q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol',
    a: 'qsz', s: 'awdx', d: 'sefc', f: 'drgv', g: 'fthb', h: 'gyjn', j: 'hukm', k: 'jil', l: 'ko',
    z: 'asx', x: 'zsc', c: 'xdv', v: 'cfb', b: 'vgn', n: 'bhm', m: 'nj',
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (rng) => (rng() + rng() + rng() - 1.5) / 0.5;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  /* ---------- parsing ---------- */

  function parse(text) {
    const cells = [];
    let gid = 0;
    const re = /\[([^\]|\n]*)\|([^\]\n]*)\]|_([^_\n]+)_|\{([^}\n]+)\}|([\s\S])/g;
    text = text.replace(/\r/g, '').replace(/\t/g, '    ');
    let m;
    while ((m = re.exec(text))) {
      if (m[2] !== undefined) {
        const g = { right: m[2], style: null, id: ++gid, handDone: false };
        if (m[1] === '') cells.push({ ch: '', marker: true, group: g });
        else for (const ch of m[1]) cells.push({ ch, group: g });
      } else if (m[3] !== undefined) {
        for (const ch of m[3]) cells.push({ ch, ul: true });
      } else if (m[4] !== undefined) {
        cells.push({ ch: '', marker: true, sig: m[4] });
      } else if (m[5] === '\n') {
        cells.push({ nl: true });
      } else {
        cells.push({ ch: m[5] });
      }
    }
    return cells;
  }

  const isLetter = (c) => !c.nl && !c.marker && !c.group && !c.ul && /[A-Za-zÅÄÖåäö]/.test(c.ch);

  function mutate(word, rng) {
    const w = word.split('');
    const kind = Math.floor(rng() * 3);
    if (kind === 0) {
      const k = 1 + Math.floor(rng() * (w.length - 2));
      if (w[k] !== w[k + 1]) { [w[k], w[k + 1]] = [w[k + 1], w[k]]; return w.join(''); }
    } else if (kind === 1) {
      const k = Math.floor(rng() * w.length);
      w.splice(k, 0, w[k]);
      return w.join('');
    }
    for (let tries = 0; tries < 8; tries++) {
      const k = Math.floor(rng() * w.length);
      const nb = QWERTY[w[k].toLowerCase()];
      if (!nb) continue;
      let r = nb[Math.floor(rng() * nb.length)];
      if (w[k] !== w[k].toLowerCase()) r = r.toUpperCase();
      w[k] = r;
      return w.join('');
    }
    return word + word[word.length - 1];
  }

  function injectTypos(cells, rate, rng) {
    if (rate <= 0) return cells;
    const out = [];
    let gid = 10000;
    let i = 0;
    while (i < cells.length) {
      if (!isLetter(cells[i])) { out.push(cells[i++]); continue; }
      let j = i;
      while (j < cells.length && isLetter(cells[j])) j++;
      const run = cells.slice(i, j);
      if (run.length >= 4 && rng() < rate) {
        const right = run.map((c) => c.ch).join('');
        const g = { right, style: null, id: ++gid, handDone: false };
        for (const ch of mutate(right, rng)) out.push({ ch, group: g });
      } else {
        out.push(...run);
      }
      i = j;
    }
    return out;
  }

  /* ---------- layout ---------- */

  function layoutLines(cells, cols) {
    const lines = [];
    let line = [], w = 0, word = [], ww = 0, wrapped = false;
    const pushLine = (isWrap) => { lines.push(line); line = []; w = 0; wrapped = isWrap; };
    const flush = () => {
      if (!word.length) return;
      if (ww > cols) {
        for (const c of word) {
          if (!c.marker && w >= cols) pushLine(true);
          line.push(c);
          if (!c.marker) w++;
        }
      } else {
        if (w + ww > cols) pushLine(true);
        for (const c of word) line.push(c);
        w += ww;
      }
      word = []; ww = 0; wrapped = false;
    };
    for (const c of cells) {
      if (c.nl) { flush(); pushLine(false); continue; }
      if (c.ch === ' ') {
        flush();
        if (w >= cols) pushLine(true);
        else if (!(wrapped && w === 0)) { line.push(c); w++; }
        continue;
      }
      word.push(c);
      if (!c.marker) ww++;
    }
    flush();
    lines.push(line);
    return lines;
  }

  /* ---------- paper ---------- */

  function noiseTile(size, rng, fn) {
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const id = x.createImageData(size, size);
    for (let i = 0; i < size * size; i++) fn(id.data, i * 4, rng);
    x.putImageData(id, 0, 0);
    return c;
  }

  function fillPattern(ctx, tile, w, h, alpha, op) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    if (op) ctx.globalCompositeOperation = op;
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawPaper(ctx, W, H, s, o, rng) {
    const age = o.age;
    const mix = (a, b) => Math.round(a + (b - a) * age);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = `rgb(${mix(246, 232)},${mix(242, 218)},${mix(232, 178)})`;
    ctx.fillRect(0, 0, W, H);

    // low-frequency mottling
    for (let k = 0; k < 36; k++) {
      const x = rng() * W, y = rng() * H, r = 60 + rng() * 260;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = rng() < 0.65;
      const col = dark ? '150,110,50' : '255,255,250';
      g.addColorStop(0, `rgba(${col},${(dark ? 0.06 : 0.05) * (0.3 + age) * rng()})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // paper grain + fibres
    const grain = noiseTile(256, rng, (d, i, r) => {
      const v = 150 + r() * 105;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 40 + r() * 40;
    });
    fillPattern(ctx, grain, W * s, H * s, 0.55, 'multiply');
    ctx.lineWidth = 0.5;
    for (let k = 0; k < 700; k++) {
      const x = rng() * W, y = rng() * H, a = rng() * Math.PI, l = 3 + rng() * 9;
      ctx.strokeStyle = rng() < 0.5 ? 'rgba(255,255,250,0.35)' : `rgba(150,125,80,${0.10 + age * 0.1})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }

    // edge darkening
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    vg.addColorStop(0, 'rgba(120,85,35,0)');
    vg.addColorStop(1, `rgba(120,85,35,${0.08 + 0.3 * age})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (o.folds) {
      for (const y of [H / 3 + (rng() - 0.5) * 6, (2 * H) / 3 + (rng() - 0.5) * 6]) {
        const g = ctx.createLinearGradient(0, y - 5, 0, y + 5);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.42, 'rgba(60,40,10,0.10)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y - 5, W, 10);
      }
    }

    if (o.stain) {
      const cx = W * (0.62 + rng() * 0.25), cy = H * (0.6 + rng() * 0.3), R = 52 + rng() * 25;
      ctx.beginPath();
      const n = 60;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const r = R * (1 + 0.04 * Math.sin(a * 3 + 1) + (rng() - 0.5) * 0.02);
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.97;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.fillStyle = 'rgba(150,100,45,0.05)'; ctx.fill();
      ctx.strokeStyle = 'rgba(115,72,28,0.26)'; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(115,72,28,0.12)'; ctx.lineWidth = 9; ctx.stroke();
    }
  }

  /* ---------- drawing primitives ---------- */

  // f = strike force: harder hits give a heavier, wider line of ink.
  function strike(ctx, ch, x, y, rot, alpha, size, family, color, f = 0.8) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `${size}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.12 + 0.3 * f;
    const h = 0.15 + 0.2 * f;
    ctx.globalAlpha = alpha * 0.35; ctx.fillText(ch, h, h * 0.8);
    ctx.globalAlpha = alpha * 0.5; ctx.strokeText(ch, 0, 0);
    ctx.globalAlpha = alpha; ctx.fillText(ch, 0, 0);
    ctx.restore();
  }

  // The dent a type slug presses into the paper, lit from the upper left:
  // a shadowed wall on the upper-left edge, a lit wall on the lower-right.
  // The glyph interior is knocked out so only the rims are left around the ink.
  function impress(ctx, ch, x, y, rot, f, size, family, relief) {
    const k = clamp(f, 0.2, 1.3) * relief;
    const d = (0.35 + 0.35 * Math.min(f, 1.4)) * Math.min(relief, 1.1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `${size}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.4 + 0.8 * f * relief;
    ctx.fillStyle = ctx.strokeStyle = 'rgb(70,48,20)';
    ctx.globalAlpha = Math.min(1, 0.3 * k);
    ctx.fillText(ch, -d, -d); ctx.strokeText(ch, -d, -d);
    ctx.fillStyle = ctx.strokeStyle = 'rgb(255,252,240)';
    ctx.globalAlpha = Math.min(1, 0.55 * k);
    ctx.fillText(ch, d, d); ctx.strokeText(ch, d, d);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.5;
    ctx.fillText(ch, 0, 0); ctx.strokeText(ch, 0, 0);
    ctx.restore();
  }

  // Wet-looking white patch of correction fluid with ragged edges.
  function fluidPatch(ctx, x0, y0, x1, y1, age, rng) {
    const jit = () => (rng() - 0.5) * 2.2;
    ctx.save();
    ctx.beginPath();
    const steps = Math.max(4, Math.round((x1 - x0) / 5));
    for (let k = 0; k <= steps; k++) { const x = x0 + ((x1 - x0) * k) / steps; k ? ctx.lineTo(x, y0 + jit()) : ctx.moveTo(x, y0 + jit()); }
    ctx.lineTo(x1 + jit(), y0 + (y1 - y0) * 0.5);
    for (let k = steps; k >= 0; k--) ctx.lineTo(x0 + ((x1 - x0) * k) / steps, y1 + jit());
    ctx.lineTo(x0 + jit(), y0 + (y1 - y0) * 0.5);
    ctx.closePath();
    ctx.fillStyle = `rgba(${Math.round(251 - age * 10)},${Math.round(249 - age * 16)},${Math.round(240 - age * 34)},0.97)`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,60,0.18)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.6;
    for (let k = 0; k < 6; k++) {
      const y = y0 + rng() * (y1 - y0);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y + (rng() - 0.5) * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // Grey rubbed-over paper left by an ink eraser.
  function rubSmudge(ctx, x0, y0, x1, y1, rng) {
    ctx.save();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 4, ry = (y1 - y0) / 2 + 3;
    ctx.translate(cx, cy); ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(110,100,90,0.20)');
    g.addColorStop(0.7, 'rgba(110,100,90,0.10)');
    g.addColorStop(1, 'rgba(110,100,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function blob(ctx, x, y, r, alpha, color, rng) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * (0.8 + rng() * 0.4);
      const px = x + Math.cos(a) * rr * 1.1, py = y + Math.sin(a) * rr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.fill();
    ctx.restore();
  }

  // A signed name in fountain-pen ink with a flourish; now and then it is smeared by a hand
  // dragged across the wet ink.
  function signature(ctx, name, x, y, size, color, smudge, rng) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.06 + (rng() - 0.5) * 0.05);
    ctx.font = `${size}px ${SIG}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    const w = ctx.measureText(name).width;
    ctx.globalAlpha = 0.92; ctx.fillText(name, 0, 0);
    ctx.lineWidth = 0.6; ctx.globalAlpha = 0.5; ctx.strokeText(name, 0, 0);
    // flourish under the name
    ctx.lineWidth = 1.2; ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(w * 0.04, size * 0.2);
    ctx.bezierCurveTo(w * 0.4, size * 0.34, w * 0.8, size * 0.1, w * 1.03, -size * 0.06);
    ctx.stroke();
    // pooled ink where the pen paused
    for (let k = 0; k < 3; k++) blob(ctx, w * (0.05 + 0.9 * rng()), -size * (0.05 + 0.3 * rng()), 0.5 + rng() * 0.9, 0.55, color, rng);
    if (rng() < smudge) {
      const reach = size * (0.3 + 0.7 * rng()) * (0.4 + smudge);
      const ang = (rng() * 0.7 - 0.15); // mostly dragged to the right and a little down
      const x0 = w * (0.3 + 0.4 * rng());
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, -size * 1.1, w * 1.2, size * 1.9); ctx.clip();
      const steps = 32;
      for (let k = 1; k <= steps; k++) {
        ctx.globalAlpha = 0.028 * (1 - k / (steps + 2)) * (0.6 + smudge);
        ctx.fillText(name, reach * Math.cos(ang) * (k / steps), reach * Math.sin(ang) * (k / steps));
      }
      ctx.restore();
      const g = ctx.createRadialGradient(x0 + reach * 0.5, -size * 0.1, 0, x0 + reach * 0.5, -size * 0.1, reach * 0.9);
      g.addColorStop(0, 'rgba(25,45,150,0.18)'); g.addColorStop(1, 'rgba(25,45,150,0)');
      ctx.globalAlpha = 0.5 + smudge * 0.5; ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x0 + reach * 0.5, -size * 0.1, reach * 0.9, size * 0.35, ang, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function penLine(ctx, x0, x1, y, color, rng) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = pass ? 0.5 : 0.9;
      ctx.lineWidth = pass ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x0, y + (rng() - 0.5) * 2);
      const steps = Math.max(2, Math.round((x1 - x0) / 14));
      for (let k = 1; k <= steps; k++) ctx.lineTo(x0 + ((x1 - x0) * k) / steps, y + (rng() - 0.5) * 1.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function handWord(ctx, word, cx, y, size, color, rng) {
    ctx.save();
    ctx.font = `${size}px ${HAND}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.translate(cx, y);
    ctx.rotate(-0.04 + (rng() - 0.5) * 0.1);
    ctx.globalAlpha = 0.92;
    ctx.fillText(word, 0, 0);
    ctx.globalAlpha = 0.35;
    ctx.fillText(word, 0.35, 0.2);
    ctx.restore();
  }

  function caret(ctx, x, y, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(x - 3.5, y + 4); ctx.lineTo(x, y); ctx.lineTo(x + 3.5, y + 4); ctx.stroke();
    ctx.restore();
  }

  /* ---------- main ---------- */

  async function ensureFonts(font) {
    if (typeof document === 'undefined' || !document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load(`20px "${font.name}"`, 'Aa'),
        document.fonts.load('24px "Reenie Beanie"', 'Aa'),
        document.fonts.load('40px "Mrs Saint Delafield"', 'Aa'),
      ]);
    } catch (e) { /* fallbacks are fine */ }
  }

  async function render(text, userOpts) {
    const o = Object.assign({}, DEFAULTS, userOpts);
    const font = FONTS[o.font] || FONTS.tt2020;
    await ensureFonts(font);

    const s = o.scale;
    const [pw, ph] = PAPERS[o.paper] || PAPERS.a4;
    const W = Math.round(pw * DPI), H = Math.round(ph * DPI);
    const pitch = DPI / o.cpi;
    const lineH = (DPI / 6) * o.spacing;
    const left = o.marginLeft * DPI, topBase = o.marginTop * DPI, bottom = o.marginBottom * DPI, rightM = o.marginRight * DPI;
    const cols = Math.floor((W - left - rightM) / pitch);
    const perPage = Math.floor((H - topBase - bottom) / lineH) + 1;

    const meas = makeCanvas(10, 10).getContext('2d');
    meas.font = `100px ${font.family}`;
    const adv = meas.measureText('0').width / 100 || 0.6;
    const size = clamp(pitch / adv, 14, 30);

    const rngInk = mulberry32(o.seed);
    const rngTypo = mulberry32(o.seed + 101);
    const rngStyle = mulberry32(o.seed + 202);

    // permanent quirks of "this" machine
    const pick = (pool, n) => {
      const a = pool.split('');
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rngInk() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a.slice(0, n);
    };
    const dirtyLetters = new Set(pick('aeopbdgqADRB', Math.round(o.dirt * 5)));
    const skewed = {};
    for (const l of pick('etnsraiolhdc', o.slop > 0.05 ? 3 : 0)) {
      skewed[l] = { dy: (rngInk() < 0.5 ? -1 : 1) * (0.8 + rngInk() * 0.8) * o.slop, rot: (rngInk() - 0.5) * 0.06 * o.slop };
    }
    const weak = pick('lcsmw', 1)[0];

    const ink = INKS[o.ink] || INKS.black;
    const penColor = PENS[o.pen] || PENS.blue;
    const handSize = size * 1.1;

    const cells = injectTypos(parse(text), o.typos, rngTypo);
    const lines = layoutLines(cells, cols);

    const pages = [];
    for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));

    const canvases = [];
    pages.forEach((pageLines, pi) => {
      const canvas = makeCanvas(Math.round(W * s), Math.round(H * s));
      const pctx = canvas.getContext('2d');
      const rngPaper = mulberry32(o.seed * 7 + pi * 13 + 5);
      drawPaper(pctx, W, H, s, o, rngPaper);

      const skew = ((rngPaper() - 0.5) * 0.5 * Math.PI) / 180;
      const mk = () => {
        const c = makeCanvas(canvas.width, canvas.height);
        const x = c.getContext('2d');
        x.setTransform(s, 0, 0, s, 0, 0);
        x.translate(W / 2, H / 2);
        x.rotate(skew);
        x.translate(-W / 2, -H / 2);
        return [c, x];
      };
      const [inkC, ictx] = mk();
      const [penC, xctx] = mk();
      const [embC, ectx] = mk();
      const extra = {}; // layers that only exist when a correction needs them
      const layer = (k) => extra[k] || (extra[k] = mk());

      // Erase / correction fluid / lift-off tape: hide the wrong word, retype the right one on top.
      const correctTyped = (g, sp, base) => {
        const rightN = g.right.length, n = Math.max(sp.c1 - sp.c0, rightN);
        const cx0 = left + sp.c0 * pitch - 1.5, cx1 = left + (sp.c0 + n) * pitch + 1.5;
        const top = base - size * 0.78, bot = base + size * 0.3;
        if (g.style === 'tipex') {
          fluidPatch(layer('fluid')[1], cx0, top, cx1, bot, o.age, rngInk);
        } else {
          ictx.save();
          ictx.globalCompositeOperation = 'destination-out';
          ictx.globalAlpha = g.style === 'eraser' ? 0.8 : 0.93;
          ictx.fillRect(cx0, top, cx1 - cx0, bot - top);
          ictx.restore();
          if (g.style === 'eraser') rubSmudge(layer('fluid')[1], cx0, top, cx1, bot, rngInk);
        }
        const extraDy = g.style === 'tipex' ? 0.7 : g.style === 'eraser' ? 0.4 : 0;
        for (let i = 0; i < rightN; i++) {
          const ch = g.right[i];
          if (ch === ' ') continue;
          const x = left + (sp.c0 + i) * pitch + pitch / 2 + gauss(rngInk) * 0.6 * o.slop;
          const y = base + gauss(rngInk) * 0.6 * o.slop + extraDy;
          const rot = gauss(rngInk) * 0.015 * o.slop;
          const f = o.touch * (0.9 + 0.2 * rngInk());
          const a = clamp(o.inkStrength * lineInkNow * (0.85 + 0.15 * rngInk()), 0.2, 1);
          strike(layer('ink2')[1], ch, x, y, rot, a, size, font.family, ink, f);
          if (o.relief > 0) impress(layer('emb2')[1], ch, x, y, rot, f, size, font.family, o.relief);
        }
      };
      let lineInkNow = 1;

      pageLines.forEach((line, li) => {
        const base = topBase + li * lineH + gauss(rngInk) * 0.15 * o.slop;
        const lineInk = 1 - o.wear * 0.3 * rngInk();
        lineInkNow = lineInk;
        const lineForce = 0.85 + 0.3 * rngInk();
        const phase = rngInk() * 6;
        const groups = new Map();
        let col = 0;

        const sigs = [];
        for (const c of line) {
          if (c.sig) { sigs.push({ name: c.sig, x: left + col * pitch }); continue; }
          if (c.marker) {
            groups.set(c.group, { c0: col, c1: col, marker: true });
            continue;
          }
          const cx = left + col * pitch + pitch / 2;
          const ribbon = lineInk * (1 - o.wear * 0.15 * (0.5 + 0.5 * Math.sin(col * 0.12 + phase)));
          const draw = (ch, extraAlpha, rotMul) => {
            const q = skewed[ch] || { dy: 0, rot: 0 };
            const x = cx + gauss(rngInk) * 0.45 * o.slop;
            const y = base + gauss(rngInk) * 0.6 * o.slop + q.dy;
            const rot = gauss(rngInk) * 0.012 * o.slop * rotMul + q.rot;
            let f = o.touch * lineForce * (0.8 + 0.4 * rngInk());
            if (/[mwMW@%&]/.test(ch)) f *= 1.15;
            if (rngInk() < 0.03) f *= 1.5; // an occasional bang
            let a = o.inkStrength * ribbon * (0.8 + 0.2 * rngInk()) * extraAlpha * ((0.7 + 0.4 * f) / 1.02);
            if (ch === weak) a *= 0.7;
            if (ch >= 'A' && ch <= 'Z') a *= 1.08;
            a = clamp(a, 0.12, 1);
            strike(ictx, ch, x, y, rot, a, size, font.family, ink, f);
            if (o.relief > 0) impress(ectx, ch, x, y, rot, f, size, font.family, o.relief);
            if (dirtyLetters.has(ch)) {
              const cap = /[A-Z0-9]/.test(ch);
              blob(ictx, x, y - size * (cap ? 0.34 : 0.2), size * (0.05 + 0.05 * rngInk()) * (0.6 + o.dirt), a * 0.85, ink, rngInk);
            }
            if (rngInk() < o.slop * 0.01) strike(ictx, ch, x + 1.6, y + 0.9, rot, a * 0.25, size, font.family, ink);
            if (rngInk() < o.dirt * 0.004) blob(ictx, x + gauss(rngInk) * 6, y + gauss(rngInk) * 6, 0.6 + rngInk() * 1.2, 0.5, ink, rngInk);
          };

          if (c.ch !== ' ' && c.ch !== '') draw(c.ch, 1, 1);
          if (c.ul) strike(ictx, '_', cx + gauss(rngInk) * 0.3, base + gauss(rngInk) * 0.3, 0, 0.85 * o.inkStrength * ribbon, size, font.family, ink);

          if (c.group) {
            const g = c.group;
            if (g.style === null) {
              // corrStyle is one method or several joined by '+', repeats act as weights
              const choices = (o.corrStyle === 'mix' ? 'x+x+pen' : o.corrStyle).split('+');
              g.style = choices[Math.floor(rngStyle() * choices.length)];
            }
            if (g.style === 'x' && c.ch !== ' ') {
              const xx = cx + gauss(rngInk) * 0.7, xy = base + gauss(rngInk) * 0.6, xr = gauss(rngInk) * 0.02, xf = o.touch * 1.2;
              strike(ictx, 'x', xx, xy, xr, clamp(o.inkStrength * ribbon * 1.05, 0.2, 1), size, font.family, ink, xf);
              if (o.relief > 0) impress(ectx, 'x', xx, xy, xr, xf, size, font.family, o.relief);
            }
            const sp = groups.get(g);
            if (sp) sp.c1 = col + 1; else groups.set(g, { c0: col, c1: col + 1 });
          }
          col++;
        }

        for (const sg of sigs) {
          signature(xctx, sg.name, sg.x, base - lineH * 0.4, size * 2.5, SIG_INKS[o.sigInk] || SIG_INKS.blue, o.sigSmudge, rngInk);
        }

        for (const [g, sp] of groups) {
          const x0 = left + sp.c0 * pitch, x1 = left + sp.c1 * pitch;
          if (TYPED.has(g.style) && !sp.marker) {
            if (!g.handDone) { g.handDone = true; correctTyped(g, sp, base); }
            continue;
          }
          if (g.style === 'pen' && !sp.marker) penLine(xctx, x0 - 1, x1 + 1, base - size * 0.28, penColor, rngInk);
          if (g.right && !g.handDone) {
            g.handDone = true;
            const mid = (x0 + x1) / 2;
            // sits in the gap just above the typed line, small enough not to hit the line above
            if (sp.marker) caret(xctx, mid, base - size * 0.5, penColor);
            handWord(xctx, g.right, mid, base - size * 0.66, handSize, penColor, rngInk);
          }
        }
      });

      // uneven ink: lift pigment with paper-grain noise and specks
      const wearTile = noiseTile(256, rngPaper, (d, i, r) => {
        d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = r() < 0.55 ? r() * 255 : 0;
      });
      const wearOut = (cx) => {
        fillPattern(cx, wearTile, canvas.width, canvas.height, 0.2 + 0.55 * o.wear, 'destination-out');
        cx.save();
        cx.globalCompositeOperation = 'destination-out';
        for (let k = 0, n = 2500 * o.wear; k < n; k++) {
          cx.globalAlpha = 0.3 + rngPaper() * 0.6;
          cx.beginPath();
          cx.arc(rngPaper() * W, rngPaper() * H, 0.3 + rngPaper() * 0.7, 0, Math.PI * 2);
          cx.fill();
        }
        cx.restore();
      };
      wearOut(ictx);
      if (extra.ink2) wearOut(extra.ink2[1]);

      // paper first (dents), then ink, then fluid patches, then text retyped over them
      pctx.save();
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      if (o.relief > 0) {
        pctx.filter = `blur(${0.55 * s}px)`;
        pctx.drawImage(embC, 0, 0);
      }
      pctx.globalCompositeOperation = 'multiply';
      pctx.filter = `blur(${0.35 * s}px)`;
      pctx.drawImage(inkC, 0, 0);
      pctx.globalCompositeOperation = 'source-over';
      if (extra.fluid) { pctx.filter = `blur(${0.25 * s}px)`; pctx.drawImage(extra.fluid[0], 0, 0); }
      if (extra.emb2 && o.relief > 0) { pctx.filter = `blur(${0.55 * s}px)`; pctx.drawImage(extra.emb2[0], 0, 0); }
      pctx.globalCompositeOperation = 'multiply';
      if (extra.ink2) { pctx.filter = `blur(${0.35 * s}px)`; pctx.drawImage(extra.ink2[0], 0, 0); }
      pctx.filter = `blur(${0.2 * s}px)`;
      pctx.drawImage(penC, 0, 0);
      pctx.restore();

      canvases.push(canvas);
    });
    return canvases;
  }


  /* ---------- period presets (country x decade) ----------
   * Approximate typical conventions, compiled from a few period handbooks and
   * general knowledge. They are starting points, not verified house rules for
   * every office. */

  const ERA = {
    1950: { font: 'tt2020', ink: 'black', inkStrength: 0.88, touch: 0.85, relief: 0.75, slop: 0.7, dirt: 0.55, wear: 0.45, age: 0.55, typos: 0.03, corrStyle: 'x+x+pen+eraser', cpi: 10, folds: true },
    1960: { font: 'cutive', ink: 'black', inkStrength: 0.92, touch: 0.8, relief: 0.6, slop: 0.55, dirt: 0.4, wear: 0.35, age: 0.4, typos: 0.03, corrStyle: 'x+pen+tipex+eraser', cpi: 10, folds: true },
    1970: { font: 'courier', ink: 'black', inkStrength: 0.95, touch: 0.65, relief: 0.35, slop: 0.25, dirt: 0.1, wear: 0.2, age: 0.2, typos: 0.02, corrStyle: 'tipex+tape+tape', cpi: 12, folds: false },
  };
  const REGION = {
    us: { name: 'USA', paper: 'letter', marginLeft: 1.25, marginRight: 1.0, marginTop: 1.5 },
    uk: { name: 'Storbritannien', paper: 'a4', marginLeft: 1.25, marginRight: 0.8, marginTop: 1.3 },
    se: { name: 'Sverige', paper: 'a4', marginLeft: 1.2, marginRight: 0.9, marginTop: 1.15 },
  };

  const SAMPLES = {
    us1950: `                               March 14, 1953

Mr. Frank Lindquist, Director
Northern Bearings, Inc.
418 Lake Street
Chicago 6, Illinois

Dear Mr. Lindquist:

     Referring to your letter of March 2, we are
pleased to advise that the [orderd|ordered] bearings will
leave our warehouse by rail on [Mondey|Monday] next.

     We regret the [|slight] delay and trust it has not
caused you inconvenience. Should you have any
_further_ questions, please do not hesitate to call.

                               Yours very truly,

                               MIDWEST SUPPLY CO.

                               {Helen Marsh}
                               Helen Marsh
                               Secretary
HM:mk
Enc.`,
    us1960: `                               March 14, 1963

Mr. Frank Lindquist, Director
Northern Bearings, Inc.
418 Lake Street
Chicago, Illinois 60606

Dear Mr. Lindquist:

     Referring to your letter of March 2, we are
pleased to advise that the [orderd|ordered] bearings will
leave our warehouse by rail on [Mondey|Monday] next.

     We regret the [|slight] delay and trust it has not
caused you inconvenience. Should you have any
_further_ questions, please call us.

                               Sincerely yours,

                               MIDWEST SUPPLY CO.

                               {Helen Marsh}
                               Helen Marsh
                               Secretary
hm/mk
Enclosure`,
    us1970: `March 14, 1973

Mr. Frank Lindquist, Director
Northern Bearings, Inc.
418 Lake Street
Chicago, Illinois 60606

Dear Mr. Lindquist:

Re: Your order of March 2

The [orderd|ordered] bearings will leave our warehouse by
rail on [Mondey|Monday] next. We regret the [|slight] delay and
trust it has not caused you inconvenience.

Should you have any _further_ questions, please call me.

Sincerely,

MIDWEST SUPPLY CO.


{Helen Marsh}
Helen Marsh
Secretary

HM/mk
Enclosure`,
    uk1950: `Our Ref: HM/MK
Your Ref: FL/2217
                                    14th March, 1953

Messrs. Northern Bearings Ltd.,
12 Lime Street,
London, E.C.3.

Dear Sirs,

     We thank you for your letter of the 2nd instant
and have pleasure in informing you that the
[orderd|ordered] bearings will be despatched on [Mondey|Monday].

     We regret the [|slight] delay and trust that it has
not caused you inconvenience. Should you require any
_further_ information we shall be glad to supply it.

                                    Yours faithfully,

                                    MIDWEST SUPPLY CO., LTD.

                                    {H. Marsh}
                                    H. MARSH,
                                    Secretary.
Enc.`,
    uk1960: `Our Ref: HM/MK
Your Ref: FL/2217
                                    14th March, 1963

Messrs. Northern Bearings Ltd.,
12 Lime Street,
London, E.C.3.

Dear Sirs,

     We thank you for your letter of the 2nd instant
and have pleasure in informing you that the
[orderd|ordered] bearings will be despatched on [Mondey|Monday].

     We regret the [|slight] delay and trust that it has
not caused you inconvenience. Should you require any
_further_ information we shall be glad to supply it.

                                    Yours faithfully,

                                    MIDWEST SUPPLY CO. LTD

                                    {H. Marsh}
                                    H. Marsh
                                    Secretary
Enc`,
    uk1970: `Our Ref HM/MK
Your Ref FL/2217

14 March 1973

Messrs Northern Bearings Ltd
12 Lime Street
London EC3

Dear Sirs

Thank you for your letter of 2 March. The [orderd|ordered]
bearings will be despatched on [Mondey|Monday].

We regret the [|slight] delay and trust that it has not
caused you inconvenience. Should you require any
_further_ information please let us know.

Yours faithfully

MIDWEST SUPPLY CO LTD


{H Marsh}
H Marsh
Secretary

Enc`,
    se1950: `Stockholm den 14 mars 1953

Herr Direktör Erik Lindqvist
AB Nordiska Kullager
Göteborg


Ang. leverans av kullager

Herr Direktören!

Med hänvisning till Eder skrivelse av den 2 dennes
får vi meddela att de [bestälda|beställda] kullagren
sändes med tåg på [mamdag|måndag].

Vi beklagar den [|något] sena leveransen och hoppas
att Herr Direktören har överseende med detta. Skulle
_ytterligare_ frågor uppstå står vi givetvis till tjänst.

Högaktningsfullt
AB SVENSKA LAGERVERK

{Elsa Bergström}
Elsa Bergström
Sekreterare`,
    se1960: `Stockholm den 14 mars 1963

Direktör Erik Lindqvist
AB Nordiska Kullager
Göteborg


Ang. leverans av kullager

Bäste herr Lindqvist!

Med hänvisning till Er skrivelse av den 2 dennes
får vi meddela att de [bestälda|beställda] kullagren
sändes med tåg på [mamdag|måndag].

Vi beklagar den [|något] sena leveransen och hoppas
att Ni har överseende med detta. Skulle _ytterligare_
frågor uppstå står vi givetvis till tjänst.

Med vänlig hälsning
AB SVENSKA LAGERVERK

{Elsa Bergström}
Elsa Bergström
Sekreterare`,
    se1970: `Stockholm 1973-03-14

Direktör Erik Lindqvist
AB Nordiska Kullager
Box 120
401 22 GÖTEBORG


Leverans av kullager

Bäste Erik Lindqvist,

Med anledning av Er skrivelse 1973-03-02 meddelar vi att
de [bestälda|beställda] kullagren sänds med tåg på [mamdag|måndag].

Vi beklagar den [|något] sena leveransen. Hör gärna av Er
om _ytterligare_ frågor uppstår.

Med vänlig hälsning
AB SVENSKA LAGERVERK

{Elsa Bergström}
Elsa Bergström
Sekreterare`,
  };

  const PRESETS = {};
  for (const r of Object.keys(REGION)) {
    for (const d of [1950, 1960, 1970]) {
      const key = r + d;
      const opts = Object.assign({ spacing: 1 }, ERA[d], REGION[r]);
      delete opts.name;
      if (r === 'uk' && d === 1950) opts.paper = 'quarto';
      PRESETS[key] = { label: `${REGION[r].name} ${d}-tal`, opts, sample: SAMPLES[key] };
    }
  }

  function configure(cfg) { if (cfg.createCanvas) makeCanvas = cfg.createCanvas; }

  global.Typewriter = { render, configure, DEFAULTS, FONTS, INKS, PENS, PAPERS, PRESETS };
  if (typeof module !== 'undefined') module.exports = global.Typewriter;
})(typeof window !== 'undefined' ? window : globalThis);
