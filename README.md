# Inkmap

A personal, fully offline travel log. Log the cities you've visited; the app shades a globe, a world map and each country.
Runs on Android (Capacitor), Windows (Electron) and the web (Vercel), from one codebase. No backend, no accounts, no network calls.

**Status: Tier 0 (feasibility).** The app is currently a test screen: the globe with every country filled, a frame-rate meter, and the place-data load time.

## Develop

```sh
npm ci
npm run dev          # web, http://localhost:5173
npm test             # vitest
npm run electron:dev # Windows/desktop shell against the dev server (run `npm run dev` first)
```

## Reference data

The bundled data in `public/data` is built by `data-pipeline/` and committed.

```sh
npm run data:fetch   # downloads GeoNames, Natural Earth, OurAirports, geoBoundaries into data-pipeline/.raw
npm run data         # writes public/data and prints file sizes
```

| File | Source | Contents |
|---|---|---|
| `countries.json` | UN M49 (`data-pipeline/sources/m49.csv`) + GeoNames names | 250 entries: the 248 ISO entries M49 lists, plus Taiwan and Kosovo; each with one of 7 continents |
| `places.tsv` | GeoNames `cities1000` | id, name, ASCII name, lat, lon, country, admin1, population, Latin-script alternate names |
| `countries.topo.json` | Natural Earth 10m admin-0 map units (+ US Minor Outlying Islands from admin-0 countries) | One shape per ISO code, simplified |
| `regions/XX.json` | geoBoundaries gbOpen ADM1 + ADM2 (per-country licences, listed in `boundary-sources.json` and in Settings) | One file per country: states (`adm1`) and districts (`adm2`), simplified to 500 m (keeps the APK under 30 MB); loaded when that country's view opens |
| `airports.tsv` | OurAirports | Airports with an IATA code that are large, medium or have scheduled service |

Continent rule: M49 region, with Northern America, Central America and the Caribbean → North America. Antarctica (no M49 region) → Antarctica, Taiwan → Asia, Kosovo → Europe.

## Builds and releases

`.github/workflows/build.yml` runs on every push: tests, web build, an **unsigned** Android APK (build check only; fails if the APK
declares the `INTERNET` permission or is over 80 MB) and the Windows NSIS installer (downloadable from the run's artifacts).

### Signed Android APK

The release key is never in this repo or in CI. Build the signed APK on a machine with the Android SDK and the keystore:

```sh
KEYSTORE_PASSWORD=... ANDROID_HOME=/path/to/sdk scripts/build-apk.sh /path/to/inkmap-release.jks
# -> release/Inkmap-0.1.<commits>.apk
```

The version code is the commit count, so every new build installs over the previous one. The same key must sign every release forever.

### Web

Vercel deploys `main` (framework preset: Vite, output `dist`). A service worker precaches the whole app and data on the first visit.

## Third-party licences

| Component | Licence |
|---|---|
| React, Vite, Motion, vite-plugin-pwa (Workbox) | MIT |
| Dexie | Apache-2.0 |
| MapLibre GL JS | BSD-3-Clause |
| topojson-client | ISC |
| Capacitor (core, android), Electron, electron-builder | MIT |
| mapshaper (build-time only) | MPL-2.0 |
| Inter, Space Grotesk fonts (Fontsource) | SIL OFL 1.1 |
| flag-icons | MIT |
| exifr (photo location and date) | MIT |
| zxing-wasm (boarding pass barcodes; built from zxing-cpp, Apache-2.0) | MIT |
| GeoNames data | CC BY 4.0 — © GeoNames, geonames.org |
| Natural Earth data | Public domain |
| geoBoundaries (gbOpen) | Per country: CC BY, ODbL, OGL, Etalab, public domain and others, all open; full list in `public/data/boundary-sources.json` |
| OurAirports data | Public domain |
| UN M49 table | United Nations Statistics Division |
