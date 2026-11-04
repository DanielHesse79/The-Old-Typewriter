# The Old Typewriter

Genererar sidor som ser ut att vara skrivna på skrivmaskin på 1950-talet och rättade av en sekreterare.

## Köra

Öppna `index.html` via en lokal server (typsnittet laddas från `fonts/`):

```bash
python -m http.server 8765
```

Gå sedan till http://localhost:8765. Utan nätverk används TT2020 (medföljer) eller Courier New. Special Elite, Courier Prime, Cutive Mono och handskriften Reenie Beanie hämtas från Google Fonts.

## Markering i texten

| Skriv | Resultat |
|---|---|
| `[bestälda\|beställda]` | "bestälda" skrivs, överstrukes med x eller penna, "beställda" skrivs för hand ovanför |
| `[\|något]` | ordet infogas för hand med vinkel |
| `_ytterligare_` | understruket med understreck, som på maskin |
| `{Daniel}` | handskriven signatur i blått bläck med svep, ibland utsmetad. Lägg den på egen rad med några tomma rader ovanför och det maskinskrivna namnet på raden under |
| radbrytning | vagnretur |

Reglaget "Skrivfel som rättas" lägger dessutom till slumpmässiga skrivfel som rättas på samma sätt.

## Land och epok

Väljaren "Land och epok" (USA, Storbritannien, Sverige × 1950-, 1960-, 1970-tal) ställer in papper, marginaler, teckentäthet, typsnitt, maskinens slitage och korrigeringsmetod, och laddar ett exempelbrev i tidens format (datumformat, hälsning, avslut, indrag, skiljetecken). Det är approximationer från några handböcker och allmän kunskap, inte verifierade regler för varje kontor. Korrigeringsmetoderna: x och penna (1950), radergummi, Tipp-Ex (från sent 1950-tal, vanligt på 1960-talet) och korrigeringsband (1970-tal).

## Effekter

- Fast teckenbredd (pica 10 eller elite 12 tecken per tum), varje tecken med eget slumpat anslag: position, lutning, tryck.
- Ett par bokstäver sitter alltid något snett eller ligger högre, ett par är svagare (maskinens karaktär).
- Smutsiga typer: e, a, o m.fl. får bläckklumpar. Enstaka dubbelslag och fläckar.
- Färgbandet bleknar längs raden, ojämn pigmentering, mjuka kanter.
- Papper med gulning, korn, fibrer, kanter, veck och kaffefläck. Hela texten sitter lätt snett.
- Slagstyrka och 3D-relief: hårda slag ger tyngre bläck och djupare intryck i papperet.
- Samma slumptal ger alltid samma sida.

## Filer

- `typewriter.js` är motorn utan beroenden: `Typewriter.render(text, options)` returnerar en lista canvas-sidor.
- `index.html` är gränssnittet.
- `fonts/` innehåller TT2020, Special Elite (Apache 2.0), Courier Prime, Cutive Mono, Reenie Beanie och Mrs Saint Delafield (alla OFL-1.1). Licenserna ligger bredvid typsnitten som `LICENSE-*.txt`.
- `cli/render.js` renderar PNG från terminalen (kör `npm install` i `cli/` först).
- `examples/` innehåller ett exempelbrev och `.claude/skills/old-typewriter/` är Claude-skillet.
- Koden är licensierad under MIT (se `LICENSE`). Typsnitten i `fonts/` har sina egna licenser.

## Lånat från GitHub

- [ctrlcctrlv/TT2020](https://github.com/ctrlcctrlv/TT2020), typsnitt (OFL-1.1).
- [bozdoz/typewritesomething](https://github.com/bozdoz/typewritesomething) (MIT), idén och storleksordningen på jitter, rotation och transparens.

## Idéer framåt

- Gör ett Claude-skill som anropar motorn och sparar PNG/PDF.
- Fler TT2020-varianter (StyleB/D/E) med inbyggd teckenvariation.
- Röd/svart tvåfärgsband, hål för pärm, stämplar och handskriven marginalanteckning.
