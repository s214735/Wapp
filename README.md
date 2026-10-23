# Wapp

A personal, phone-first stretch timer and NicoCounter. The app is a static website hosted by GitHub Pages from the `docs/` directory on `main`.

## Use on iPhone

Open [Wapp](https://s214735.github.io/Wapp/) in Safari, then choose **Share → Add to Home Screen**. Use the bottom bar to switch between Stretch, NicoCounter, and Settings. Wapp caches its app files for offline use after the first successful load. Keep the screen open for audible timer transitions; the timer pauses when Wapp is hidden or the phone is locked.

Stretch shows the full session time, including breaks, and the number of exercises. Exercise details and break lengths are configured in Settings. During a session, use Back, Pause/Resume, Skip, and Stop.

NicoCounter takes a start date, price per packet, and estimated packets every specified number of days. Estimated packets avoided = elapsed calendar days × packets per period ÷ period days − packets registered as oops. Savings = estimated packets avoided × price per packet. Oops can be registered on the NicoCounter page and edited in Settings.

## Data

`docs/routine.json` is the starter routine. Changes made in the app are saved in that device's browser storage. Desktop Settings offers a full JSON export/import for both tools and accepts older routine-only exports. The phone Settings page uses the native share sheet for a backup file when supported, with a clipboard fallback. Browser storage may be cleared by the device or when website data is deleted.

There is no automatic sync between phone and computer: a desktop export contains desktop data only. To transfer phone data, share its backup file from the phone and import it on the computer. Import replaces this browser's saved data.

The GitHub repository and Pages website are public. Personal edits stored only in your browser are not uploaded to GitHub. There is no spreadsheet integration or remote database yet.

## Publishing

GitHub repository **Settings → Pages → Build and deployment**: choose **Deploy from a branch**, branch `main`, folder `/docs`. Changes pushed to `main` are then published automatically.
