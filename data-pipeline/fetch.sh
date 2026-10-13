#!/usr/bin/env bash
# Downloads the raw source data into data-pipeline/.raw (gitignored). Then run: npm run data
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
R="$HERE/.raw"; mkdir -p "$R"; cd "$R"
curl -sSfLO https://download.geonames.org/export/dump/cities1000.zip
curl -sSfLO https://download.geonames.org/export/dump/countryInfo.txt
curl -sSfLO https://download.geonames.org/export/dump/admin1CodesASCII.txt
curl -sSfLO https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_map_units.zip
curl -sSfLO https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip
curl -sSfLO https://davidmegginson.github.io/ourairports-data/airports.csv
for z in *.zip; do unzip -o -q "$z" -d "${z%.zip}"; done
node "$HERE/fetch-boundaries.mjs"
echo "Raw data ready in $R"
