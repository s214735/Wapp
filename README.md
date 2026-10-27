# Wapp

A personal, phone-first stretch timer and Counter. The static app is hosted by GitHub Pages from `main/docs`.

## Use on iPhone

Open [Wapp](https://s214735.github.io/Wapp/) in Safari, then choose **Share → Add to Home Screen**. Use the bottom bar to switch between Stretch, Counter, and Settings. App files are cached for offline use after the first successful load.

Stretch shows the full session time, including breaks, and the exercise count. Configure exercises and breaks in Settings. During a session, use Back, Pause/Resume, Skip, and Stop. The timer requests a screen wake lock while running, but the phone may refuse it. Keep Wapp in the foreground for audible transitions; the timer pauses when hidden or the phone is locked.

## Counter

Set a start date and estimated spending avoided: **X DKK every Y days**. Savings accrue evenly by elapsed calendar days, including across daylight-saving changes; the start day counts as zero elapsed days.

**Net DKK saved = elapsed days × DKK per period ÷ period days − oops amounts.**

Register an oops with its date, DKK amount, and reason. Edit or delete entries in Settings. Oops amounts remain fixed when you change the estimate. Savings can be negative. Only entries dated from the start date through today are deducted; entries outside that window remain saved and editable. Changing the estimate recalculates the entire period from the start date. Totals display two decimal places.

## Data and migration

`docs/routine.json` is the starter routine. Personal changes stay in the browser on each device and are not uploaded to GitHub. The repository and website are public; there is no remote database, automatic device sync, or spreadsheet integration.

Counter stores schema version 3 at `wapp.counter.v3`. On first load it reads the current record, otherwise the newer legacy record, otherwise the oldest legacy record. Successful migration saves a new Counter record and **leaves both legacy storage keys untouched**. Subsequent loads use the new record, preventing repeated conversion or duplication. Historical names remain only in the compatibility code and its tests.

Migration converts the saved estimate to DKK per period by multiplying saved price by saved quantity, and each old oops to a fixed DKK amount using that same saved price. Dates and notes are retained; notes become reasons and blank notes become “No reason provided”. Sub-øre precision is retained (binary multiplication noise is removed), including zero-valued entries when the saved price was zero. Duplicate entry IDs are made unique so each remains independently editable.

Limitations: older data contains a single saved price, so migration cannot recover prices that applied historically to individual entries. Legacy numeric prices are treated as DKK; a custom old currency label does not trigger exchange-rate conversion. Missing legacy price/estimate fields use the old defaults (price 0, quantity 1, period 7). Invalid or unsupported Counter records are left untouched, with a recovery message instead of silently erasing them. They require a valid full backup to recover. Browser data already deleted by the phone or user cannot be reconstructed.

## Backups

Settings → Backup exports version 4 JSON containing both `routine` and `counter`. On phones, Share uses the native share sheet when supported, with a clipboard fallback. Import JSON is available on both phone and desktop. Full imports replace this browser’s data after confirmation and accept both historical full-backup formats; routine-only imports update Stretch and preserve Counter. Importing the same old backup again replaces the data with the same converted values rather than adding entries. Malformed imports are rejected before writing data.

There is no automatic sync: a desktop backup contains desktop data only. To transfer phone data, share its backup file from the phone and import it on the computer. Keep backups because browsers can clear website data. New Counter backups are intended for this version or later, not older app versions.

## Publishing

GitHub repository **Settings → Pages → Build and deployment**: **Deploy from a branch**, branch `main`, folder `/docs`. Commit and push changes to `main` to publish. Service worker cache `wapp-v5` includes the new Counter and data modules. Cache updates remove only obsolete app-file caches, never local storage. Keep the same site address and do not clear website data. Reopen Wapp online to receive updates.

## Checks

Run `node --test tests/counter.test.mjs` for calculation, migration, storage, and backup regression tests. With Playwright and its WebKit/Chromium browsers installed, run `node tests/browser.cjs` (optionally pass a screenshot directory). `CHROME_PATH` can select a locally installed Chrome executable.

Browser checks cover 320, 375, 390, 430, and 1280px WebKit layouts; desktop Chrome; adding, editing, deleting, backup import/export, phone share serialization, Stretch controls, and service-worker caching. Offline reload is checked in Chrome because the Windows WebKit test browser reports an internal error on offline navigation. WebKit emulation does not replace a final check on physical iPhone Safari, especially its native date picker and share sheet.
