# Wapp

A personal, phone-first stretch routine and timer. The app is a static website hosted by GitHub Pages from the `docs/` directory on `main`.

## Use on iPhone

Open the GitHub Pages URL in Safari, then choose **Share → Add to Home Screen**. Wapp caches its app files for offline use after the first successful load. Keep the screen open for audible timer transitions; the timer pauses when Wapp is hidden or the phone is locked.

## Data

`docs/routine.json` is the starter routine. Changes made in the app are saved in that phone's browser storage. Use **Export JSON** to back up your routine and **Import JSON** to restore it, including when moving from the former Sites URL to GitHub Pages. Browser storage may be cleared by the phone or when website data is deleted.

The GitHub repository and Pages website are public. Personal edits stored only in your browser are not uploaded to GitHub. There is no spreadsheet integration or remote database yet.

## Publishing

GitHub repository **Settings → Pages → Build and deployment**: choose **Deploy from a branch**, branch `main`, folder `/docs`. Changes pushed to `main` are then published automatically.
