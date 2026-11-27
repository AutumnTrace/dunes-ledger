# dunes-ledger

[![CI](https://github.com/AutumnTrace/dunes-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/AutumnTrace/dunes-ledger/actions/workflows/ci.yml)

After a run of maps, one lucky drop makes the session total look like every map was worth farming; dunes-ledger keeps "what did the whole session make?" and "what did a typical map make?" as two separate numbers, and shows which drop made the difference.

![Recording of dunes-ledger in Chromium. The empty journal offers "Load the synthetic sample"; the pointer clicks it. The session summary appears under a "Synthetic sample" note: "How much did the whole session make? 120 chaos" next to "What did a typical map make? 2 chaos", above a row reading gross value 170 chaos, map costs 50 chaos, net 120 chaos, elapsed 50 min, session rate 144 chaos/hour, currency chaos. The pointer clicks the bar "Most profitable map: Map #7: +102 chaos net, 100 above the typical map". A panel opens on map #7 (5 min, cost 5 chaos, gross 107 chaos) listing Divine Orb ×1 at 100, highlighted, then Chaos Orb ×4 and Orb of Alchemy ×6, and the sentence: largest drop Divine Orb ×1, worth 100 chaos; without it map #7 would have netted 2 chaos, the same as the typical map.](docs/media/outlier-drilldown.gif)

## Try the example in the recording

```sh
git clone https://github.com/AutumnTrace/dunes-ledger.git
cd dunes-ledger
npm ci
npm run demo
```

Open <http://127.0.0.1:4173/>, choose **Load the synthetic sample**, then click **Most profitable map**. Without cloning: download `dunes-ledger-0.1.0-site.zip` from the release, unzip it, and serve the folder with any static server, for example `python -m http.server 4173` inside `dunes-ledger-0.1.0/`. Opening `index.html` from disk does not work: browsers only run service workers over `http://localhost` or `https://`.

The sample is synthetic: invented round numbers chosen so the arithmetic can be checked by hand. It says nothing about real drop rates or prices.

## Input and output

`samples/synthetic-dunes-session.json` holds ten five-minute maps that cost 5 chaos each. Nine return 7 chaos of loot; one also drops a Divine Orb, priced at 100 in the session's price snapshot:

```json
{
	"id": "sample-run-07",
	"finishedAt": "2026-11-27T18:35:00.000Z",
	"elapsedSeconds": 300,
	"mapCost": 5,
	"loot": [
		{ "item": "Chaos Orb", "count": 4, "unitValue": 1 },
		{ "item": "Orb of Alchemy", "count": 6, "unitValue": 0.5 },
		{ "item": "Divine Orb", "count": 1, "unitValue": 100 }
	]
}
```

| Question | Shown | Worked out as |
| --- | --- | --- |
| How much did the whole session make? | 120 chaos | 170 gross − 50 map costs |
| What did a typical map make? | 2 chaos | median net per map; ten maps, so the mean of the 5th and 6th sorted values (2 and 2) |
| Session rate | 144 chaos/hour | 120 × 3600 ÷ 3000 seconds |
| Most profitable map | Map #7, +102 chaos | 100 above the typical map; the Divine Orb line is worth 100 of it |

Loot with no known price is left out and the totals say so ("Priced loot only: 2 unpriced items on 1 line are left out of every total"). A price of 0 is a real zero and is not counted as unpriced. With no recorded time the rate reads "no time recorded" instead of Infinity.

## The decision that matters: a loot line keeps its price

Each loot line stores the unit value it was recorded with. The price list only supplies a default when the line is typed, through the session's timestamped snapshot. So when tomorrow's prices go into the price list, yesterday's session still adds up to what it did yesterday, and the accounting (`src/lib/ledger/accounting.ts`) can be a set of pure functions over one JSON object, with no lookups and no storage imports.

The cost: a price that was wrong at the time stays wrong in that session until the affected maps are edited. Refreshing the snapshot only changes lines recorded afterwards.

Import follows the same idea of never rewriting data behind the player's back (`src/lib/ledger/exchange.ts`, `src/lib/storage/import.ts`). The whole file is validated before anything is written, and every problem is reported with its path (`session.runs[1].mapCost: expected a number`). Re-importing runs whose ids and content are already stored does nothing. When a run id exists with different content, nothing is written until the player chooses "keep mine" or "use the file's" for each conflict.

Files worth reading first:

- `src/lib/ledger/accounting.ts`: session net, median, rate, and the best map's top line.
- `src/lib/ledger/exchange.ts`: the versioned file format, validation, and the import plan.
- `src/service-worker/index.ts`: why one build works from any folder offline.

## Verify it

| Command | What it checks | Result on the tested setup |
| --- | --- | --- |
| `npm test` | Vitest: the sample's numbers, medians of even and odd counts, zero time, unknown and zero prices, validation, import plans, and the IndexedDB layer through fake-indexeddb (reload, malformed, duplicate and conflicting imports) | 61 passed |
| `npm run test:e2e` | Builds, then Playwright in Chromium: the recording's numbers and drill-down, keyboard entry, unknown and zero prices, zero time, reload, duplicate, malformed and conflicting imports, export into a fresh browser, price-list edits, an offline edit that survives a browser restart, the manifest's icons | 12 passed |
| `npm run check` | svelte-check over the app, tests and scripts, plus the service worker's own type check | 0 errors |
| `npm run release && npm run release:smoke` | Builds the release assets, then checks their checksums, serves the unzipped site from a sub-folder, imports the released sample, checks the numbers, stops the server and reloads offline, and loads the hosted build at `/dunes-ledger/` | 18 checks passed |

The offline test (`e2e/offline.spec.ts`) loads the app once, shuts the site's server down, sets the browser offline, edits a run, closes the browser, starts it again on the same profile and checks that the page came from the service worker and the edit from IndexedDB.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server at <http://localhost:5173/> |
| `npm run demo` | Production build served at <http://127.0.0.1:4173/> |
| `npm run build` | Static site into `build/` |
| `npm run serve` | Serve an existing `build/` at port 4173 (`node scripts/serve.mjs build --mount /folder/` serves it from a sub-folder) |
| `npm test` | Unit tests |
| `npm run test:e2e` | Build, then the Playwright tests (needs `npx playwright install chromium` once) |
| `npm run check` | Type checks |
| `npm run record` | Re-record `docs/media/outlier-drilldown.gif` from `build/` |
| `npm run release` | Release assets into `release/` |
| `npm run release:smoke` | Smoke-test the assets in `release/` |

## Supported scope

- Manual entry: one session at a time, maps finished from the keyboard (Enter adds a loot line, Ctrl+Enter finishes the map), the previous map's cost offered for the next one, finished maps editable and deletable.
- Several sessions per browser, each with its league label, map strategy, currency and price snapshot.
- Export and import of one session as versioned JSON (`"format": "dunes-ledger.session", "version": 1`).
- Data in IndexedDB; the app is a static site that works offline after the first load and can be installed as a web app from the browser.
- Tested in Chromium 159 through Playwright on Windows 11. Firefox and Safari have not been tested.

## Limitations

- **Prices are typed by hand.** There is no market lookup, so a stale price list makes the net wrong without any warning; only prices that are missing entirely are flagged.
- **One currency per session.** An import whose session uses another currency is refused, so a session recorded in divines cannot be merged into the same session recorded in chaos.
- **Data lives in one browser profile.** Clearing the site's data, or a browser evicting storage, deletes every session; export is the only backup.
- **The timer runs from the previous "Finish map".** Breaks between maps count as map time unless the player types the minutes or presses "Restart timer", which lowers the chaos-per-hour figure.
- **The typical map can be a value no map made.** With an even number of maps the median is the mean of the two middle maps: maps netting 0 and 7 give a typical map of 3.5.
- **Item names match exactly, apart from case and spaces.** A typo such as "Divne Orb" finds no price and is recorded as unpriced loot.
- **Ids are random per browser.** A session started separately in two browsers has two ids, so importing one into the other adds a second session instead of merging their maps.
- **Only Chromium is tested.** How Firefox and Safari keep IndexedDB and service-worker caches across restarts is unverified, so the offline restart guarantee holds only where it was tested.

## Release and hosting

`npm run release` writes to `release/`:

- `dunes-ledger-0.1.0-site.zip`: the app with relative links in a `dunes-ledger-0.1.0/` folder. It works at the root of a server or in any sub-folder.
- `dunes-ledger-0.1.0-pages.zip`: the hosted-demo build for `https://<owner>.github.io/dunes-ledger/`, with `.nojekyll`. Another base path: `PAGES_BASE=/other npm run release`.
- `synthetic-dunes-session.json`: the sample, importable as is.
- `SHA256SUMS.txt`.

The app version is pinned to `<version>-<commit>` and zip timestamps to the commit time; two runs on the same commit gave identical checksums. Pushing a `v*` tag runs `.github/workflows/release.yml`: tests, packaging, the smoke test, then a GitHub release with `docs/releases/<tag>.md` as notes. `.github/workflows/pages.yml` publishes the hosted demo and only runs when started by hand.

To build for a sub-path yourself: `BASE_PATH=/dunes-ledger npm run build`. Git Bash on Windows rewrites values that start with `/`, so there use `MSYS_NO_PATHCONV=1 BASE_PATH=/dunes-ledger npm run build`, or set `$env:BASE_PATH` in PowerShell.

## Tested toolchain

| Tool | Version |
| --- | --- |
| OS | Windows 11 Pro 10.0.26200 (x64) |
| Node.js | 24.21.0 |
| npm | 11.19.0 |
| Playwright / Chromium | 1.65.1 / 159.0.8154.6 |
| Svelte / SvelteKit / Vite | 5.59.2 / 3.4.1 / 8.4.0 |
| TypeScript / Vitest | 6.0.3 / 5.1.2 |

Exact dependency versions are pinned in `package.json` and `package-lock.json`. CI runs the same commands on `ubuntu-latest` with Node 24.

## Data and artwork

- `samples/synthetic-dunes-session.json` and `samples/fixtures/*.json` were written for this project. Every run, loot line and price in them is invented; the session carries `"synthetic": true` and a note saying so, and the app labels it on screen.
- The icon (`static/icons/*.svg`, PNGs rendered by `npm run icons`) is original artwork under this repository's MIT licence.
- Item names are plain text typed by the player. No game assets are used.

dunes-ledger is not affiliated with or endorsed by Grinding Gear Games. Path of Exile is a trademark of Grinding Gear Games.

## Licence

MIT, see [LICENSE](LICENSE).
