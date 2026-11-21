# CSV Reader Speed — Fast CSV Reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/sakasaki919-cmd/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/sakasaki919-cmd/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Entry for the [make.fun](https://make.fun) bounty [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121) — "Read broken CSV files faster".

## Approach

A drop-in for csv-reader 1.0.0 that returns byte-identical answers, but faster:

- **No char-by-char loop.** Each unquoted field is found with three native `indexOf` calls (comma, LF, CR) and taken with a single `slice()`, instead of building it one character at a time.
- **Quoted fields by search, not scan.** The closing quote is found with `indexOf('"')`, skipping doubled quotes; a clean quoted field is one `slice()`, and only fields with doubled quotes or embedded line breaks take the segment-building path.
- **No regex in the hot path, one pass, minimal allocation.** Fields are sliced, not concatenated character by character.
- **Same broken-row policy as csv-reader 1.0.0** (BOM, stray CR, unterminated quotes, quote junk, short/long rows) — verified identical on the practice set.
