# dunes-ledger

A farming journal for Path of Exile map sessions that tells apart what the whole session made and what a typical map made.

```sh
npm ci
npm run demo        # builds and serves http://127.0.0.1:4173/
```

Open the page, choose "Load the synthetic sample", then click "Most profitable map".

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm test` | Unit tests: accounting, import validation, IndexedDB layer |
| `npm run test:e2e` | Builds, then runs the Playwright tests in Chromium |
| `npm run check` | svelte-check and the service worker's type check |

`samples/synthetic-dunes-session.json` is invented data: ten five-minute maps at 5 chaos each, nine returning 7 chaos and one returning 107. It is there to make the arithmetic easy to check (120 chaos net, a median of 2 chaos per map, 144 chaos per hour), not to describe real drop rates.
