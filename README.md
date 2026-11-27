# dunes-ledger

A farming journal for Path of Exile map sessions that tells apart what the whole session made and what a typical map made.

This first slice is the accounting core: pure functions over a plain JSON session, the bundled synthetic sample, and the malformed files the importer must refuse.

```sh
npm ci
npm test
```

`samples/synthetic-dunes-session.json` is invented data: ten five-minute maps at 5 chaos each, nine returning 7 chaos and one returning 107. It is there to make the arithmetic easy to check (120 chaos net, a median of 2 chaos per map, 144 chaos per hour), not to describe real drop rates.
