# Changelog

## 0.1.0

First release.

- Record map sessions by hand: map cost, elapsed time (timer or typed minutes) and loot lines with item, count and unit value. Enter adds a loot line, Ctrl+Enter finishes the map, and the previous map's cost is offered for the next one.
- Session summary with two separate answers: session net ("How much did the whole session make?") and median net per map ("What did a typical map make?"), plus gross value, map costs, elapsed minutes, chaos per hour and the currency.
- One click on the most profitable map opens its loot lines with the drop that accounts for the gap to the typical map.
- Unknown prices are counted and qualify the totals as "priced loot only"; an explicit price of 0 stays 0; no recorded time shows "no time recorded" instead of Infinity.
- Finished maps stay editable and deletable. Each loot line keeps the unit value it was recorded with, so price-list edits never rewrite a finished session.
- Versioned JSON export and import. The whole file is validated before anything is written, identical ids are a no-op, and conflicting content needs an explicit choice.
- Sessions, prices and the map in progress are stored in IndexedDB. A service worker keeps the app working offline after the first load, and the app can be installed from the browser.
- Bundled synthetic sample session: ten five-minute maps at 5 chaos, nine returning 7 and one returning 107.
