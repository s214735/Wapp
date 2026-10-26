# Wapp

A personal, phone-first stretch timer and CandyCounter. The app is a static website hosted by GitHub Pages from the `docs/` directory on `main`.

## Use on iPhone

Open [Wapp](https://s214735.github.io/Wapp/) in Safari, then choose **Share → Add to Home Screen**. Use the bottom bar to switch between Stretch, CandyCounter, and Settings. Wapp caches its app files for offline use after the first successful load. The stretch timer requests a screen wake lock while it runs. Keep Wapp in the foreground for audible transitions; the timer pauses when Wapp is hidden or the phone is locked. Wake lock support depends on the phone and browser, and the system can refuse it (for example when battery is low).

Stretch shows the full session time, including breaks, and the number of exercises. Exercise details and break lengths are configured in Settings. During a session, use Back, Pause/Resume, Skip, and Stop.

CandyCounter takes a start date, price per sugary serving, and estimated servings every specified number of days. A serving can be a sweet snack or drink. Estimated servings avoided = elapsed calendar days × servings per period ÷ period days − servings registered as oops. Savings = estimated servings avoided × price per serving. Oops can be registered on the CandyCounter page and edited in Settings.

## Data

`docs/routine.json` is the starter routine. Changes made in the app are saved in that device's browser storage. Existing NicoCounter entries are loaded as CandyCounter servings so the rename does not erase saved data; review the estimate and entries in Settings for the new purpose. Desktop Settings offers a full JSON export/import for both tools and accepts older routine-only and NicoCounter backups. The phone Settings page uses the native share sheet for a backup file when supported, with a clipboard fallback. Browser storage may be cleared by the device or when website data is deleted.

There is no automatic sync between phone and computer: a desktop export contains desktop data only. To transfer phone data, share its backup file from the phone and import it on the computer. Import replaces this browser's saved data.

The GitHub repository and Pages website are public. Personal edits stored only in your browser are not uploaded to GitHub. There is no spreadsheet integration or remote database yet.

## Publishing

GitHub repository **Settings → Pages → Build and deployment**: choose **Deploy from a branch**, branch `main`, folder `/docs`. Changes pushed to `main` are then published automatically.
