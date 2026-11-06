# Draft additions (not live)

`node tools/draft-additions.js` writes one JSON file here per question that customers keep asking and the assistant could not match. The assistant never reads this folder.

A draft has an empty `answer` and no `sources`, so it cannot pass `npm run validate` as it is. To use one: get Derek's wording, add a verified source, copy the `suggested_entry` into `bank/entries.json` (keeping 10 entries per category, so replace or merge an existing entry), then run `npm test`.
