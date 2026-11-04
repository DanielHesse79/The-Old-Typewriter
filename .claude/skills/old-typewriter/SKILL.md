---
name: old-typewriter
description: Renders text as pages typed on a 1950s typewriter and touched up by a secretary (uneven strikes, dirty type, fading ribbon, aged paper, x'ed-out typos with pen corrections). Use when the user wants text, a letter, memo or document to look typewritten, vintage or "skrivet på skrivmaskin", or asks for a typewriter-style PNG.
---

# Old Typewriter

Engine: `typewriter.js` in the project root. CLI: `cli/render.js` (Node, uses `@napi-rs/canvas`; run `npm install` in `cli/` once if `cli/node_modules` is missing).

## Render

```bash
node cli/render.js --in text.txt --out out/letter
node cli/render.js --text "Rad ett\nRad två" --out out/short
```

Writes `out/letter-1.png`, `-2.png`, ... one per page, and prints their absolute paths. Show the PNGs to the user (read the image or send the file) and tell them the paths.

## Period presets

`--preset us1950|us1960|us1970|uk1950|uk1960|uk1970|se1950|se1960|se1970` sets paper, margins, pitch, font, machine wear, touch and the correction method typical for that country and decade (1950s: x-ing out, pen, ink eraser; 1960s: adds Tipp-Ex; 1970s: Tipp-Ex and lift-off tape, evenly struck golf-ball look). Without `--in`/`--text` the preset's sample letter is rendered. Explicit options override the preset.

The presets only set the look. Letter conventions (date format, salutation, closing, indentation, open or mixed punctuation) are in the sample letters in `typewriter.js` (`SAMPLES`); when writing a letter for a preset, copy the sample's layout. They are approximations, not verified rules.

## Markup in the text

- `[fel|rätt]` typed wrong, x'ed out or struck with pen, correct word handwritten above.
- `[|ord]` word inserted by hand with a caret.
- `_text_` underlined the typewriter way.
- `{Name}` a handwritten signature in fountain-pen ink with a flourish, sometimes smeared. Put it on its own line with two or three blank lines above it, then the typed name on the next line. Indent with spaces to place it.
- Every newline is a carriage return; there is no automatic paragraph handling, so write blank lines yourself.

Use the markup sparingly (a handful of corrections per page) unless the user wants more. Use `--typos 0.04` to add random typos that get corrected automatically.

## Options (all `--name value`)

| Option | Values | Default |
|---|---|---|
| font | tt2020, elite, courier, cutive, plain | tt2020 |
| cpi | 10 (pica), 12 (elite) | 10 |
| spacing | 1, 1.5, 2 | 1 |
| paper | a4, letter, quarto | a4 |
| ink | black, blueblack, purple | black |
| pen | blue, black, red | blue |
| inkStrength | 0.4–1 | 0.9 |
| touch | 0.2–1.5 (how hard the keys are hit: heavier ink, deeper dent) | 0.8 |
| relief | 0–1.2 (visible 3D dent in the paper, 0 = flat) | 0.7 |
| slop | 0–1.5 (unevenness) | 0.6 |
| dirt | 0–1 (clogged e/a/o, specks) | 0.5 |
| wear | 0–1 (worn ribbon) | 0.4 |
| typos | 0–0.2 (share of words) | 0.04 |
| corrStyle | mix, x, pen, eraser, tipex, tape, or several joined by `+` (repeats weight): e.g. `x+x+pen+tipex` | mix |
| marginLeft, marginRight, marginTop, marginBottom | inches | 1.25, 0.9, 1.15, 1 |
| sigInk | blue, blueblack, black (signature ink) | blue |
| sigSmudge | 0–1 (chance and strength of a smeared signature) | 0.5 |
| age | 0–1 (yellowing) | 0.5 |
| folds, stain | true/false | true / false |
| seed | integer, same seed gives the same page | 1953 |
| scale | pixels per logical unit (120 = 1 inch) | 2 |

Change `--seed` for a different variation. Handwritten corrections are easier to read with `--spacing 1.5`.

## Notes

- Do not invent historical facts; only restyle the user's text.
- The interactive version is `index.html` (serve with `python -m http.server`).
