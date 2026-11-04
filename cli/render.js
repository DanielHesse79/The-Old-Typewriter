#!/usr/bin/env node
// CLI for the typewriter engine. Usage:
//   node cli/render.js --in letter.txt --out out/brev [--font elite --seed 7 --typos 0.06 ...]
//   node cli/render.js --text "Hej [vörld|världen]" --out out/hej
//   node cli/render.js --in letter.txt --preset se1950 --out out/brev   (us|uk|se + 1950|1960|1970)
//   node cli/render.js --preset uk1970 --out out/exempel                (renders the preset's sample letter)
// Writes <out>-1.png, <out>-2.png ... (one per page).
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const Typewriter = require('../typewriter.js');

const fontDir = path.join(__dirname, '..', 'fonts');
for (const [file, name] of [
  ['TT2020Base-Regular.ttf', 'TT2020'], ['SpecialElite-Regular.ttf', 'Special Elite'],
  ['CourierPrime-Regular.ttf', 'Courier Prime'], ['CutiveMono-Regular.ttf', 'Cutive Mono'],
  ['ReenieBeanie.ttf', 'Reenie Beanie'], ['MrsSaintDelafield-Regular.ttf', 'Mrs Saint Delafield'],
]) GlobalFonts.registerFromPath(path.join(fontDir, file), name);

Typewriter.configure({ createCanvas });

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2), next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[k] = true; else { args[k] = next; i++; }
}

const booleans = ['folds', 'stain'];
const preset = args.preset ? Typewriter.PRESETS[args.preset] : null;
if (args.preset && !preset) { console.error('Okänd preset. Välj bland: ' + Object.keys(Typewriter.PRESETS).join(', ')); process.exit(1); }
const opts = Object.assign({ scale: 2 }, preset ? preset.opts : {});
for (const k of Object.keys(Typewriter.DEFAULTS)) {
  if (args[k] === undefined) continue;
  const v = args[k];
  opts[k] = booleans.includes(k) ? !(v === 'false' || v === '0' || v === 'no')
    : typeof Typewriter.DEFAULTS[k] === 'number' ? parseFloat(v) : v;
}

const text = args.text !== undefined ? String(args.text).split('\\n').join('\n')
  : args.in ? fs.readFileSync(args.in, 'utf8') : preset ? preset.sample : null;
if (text === null) { console.error('Ange --in <fil>, --text "<text>" eller --preset <namn> (ger exempelbrev)'); process.exit(1); }

(async () => {
  const pages = await Typewriter.render(text, opts);
  const out = args.out || 'typewriter';
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  pages.forEach((c, i) => {
    const file = `${out}-${i + 1}.png`;
    fs.writeFileSync(file, c.toBuffer('image/png'));
    console.log(path.resolve(file));
  });
})();
