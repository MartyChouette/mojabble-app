# MojAbble - Build & Release (read this first)

This is the single source of truth for building and updating MojAbble on **iOS**
and **Android**. If you only read one thing, read the Golden Rule.

---

## Golden Rule: GitHub is the source of truth, not this folder

The real code lives at **https://github.com/MartyChouette/mojabble-app** (branch
`main`). This Desktop folder is just a working copy and it WILL go stale.

**Before doing any work, always:**
```powershell
cd C:\Users\jerma\OneDrive\Desktop\mojabble
git checkout main
git pull
```
We once lost a day because this clone was 38 commits behind `main` - the live
app's source looked "missing" when it was just un-pulled. Don't trust local
files until you've pulled. When in doubt: `git fetch && git log origin/main --oneline -10`.

---

## How releases work (both platforms, fully automated)

Every push to `main` runs two GitHub Actions workflows:

- **`.github/workflows/build-ios.yml`** - builds a signed `.ipa` and uploads it
  straight to **TestFlight**. Build number = the CI run number.
- **`.github/workflows/build-android.yml`** - builds a signed `.aab` and uploads
  it as a downloadable **artifact**. `versionCode` = the CI run number (injected
  automatically), so it always increases. You then upload the `.aab` to Google Play.

You do **not** edit version numbers by hand. The run number handles it.

Watch builds: `gh run list` / `gh run watch` or the Actions tab on GitHub.

---

## To update the app (the normal flow)

1. `git pull` (Golden Rule).
2. Edit the web game at the repo root: `index.html`, `js/*.js`, `words.txt`, `docs.html`.
   The app is a Capacitor wrapper; these files are bundled into the build (there is
   no live URL, so a web change requires a new build).
3. Commit and push to `main` (a PR is nice but pushing to main is what triggers builds).
4. **iOS:** nothing else - the build lands in TestFlight automatically. Open
   TestFlight on the iPhone to test; submit for App Store review in App Store Connect.
5. **Android:** open the **Build Android** run, download the **MojAbble-Android**
   artifact (`app-release.aab`), then in Google Play Console create a new release
   (Internal testing or Production) and upload it.

---

## Where everything lives

```
mojabble/                     <- the git repo = the one place
├── RELEASE.md                <- this file
├── index.html, js/, words.txt, docs.html   <- the web game (bundled into apps)
├── ios/                      <- Capacitor iOS project
├── android/                  <- Capacitor Android project
├── .github/workflows/        <- build-ios.yml, build-android.yml
├── docs/                     <- design docs (architecture, screen flow, signing, etc.)
└── _release_kit/             <- LOCAL ONLY, gitignored: keystores, certs, base64, last AAB
                                 see _release_kit/README.md for credentials + inventory
```

Identity: appId/bundle `com.mojabble.app`. Apple Team `2TR68DXJ5D`. Backend PHP
(`scores.php`, `room.php`) is hosted separately; `API_BASE` in `js/main.js` points
native builds at it.

---

## Signing & secrets

All signing secrets are already configured as **GitHub Actions secrets** on the
repo, so CI builds need nothing from you. The originals are backed up locally in
`_release_kit/` (gitignored) - see `_release_kit/README.md` for the keystore
credentials, the certs, and the list of secret names.

**Back up `_release_kit/` off this machine.** The Android keystore is
irreplaceable: lose it and you can never update the Play listing again.

---

## Android specifics

- Targets `compileSdk`/`targetSdk` 35 (`android/variables.gradle`); live build is
  targetSdk 35, minSdk 22.
- `android/app/build.gradle` keeps `versionCode 1` literally - CI rewrites it to
  the run number. Don't "fix" that 1.
- Edge-to-edge (SDK 35) is why the bottom UI uses `env(safe-area-inset-bottom)` and
  the meta tag uses `viewport-fit=cover` (the nav-bar margin fix in `index.html`).

## Building locally (optional - CI is preferred)

- **Android:** needs Android Studio + SDK and a JDK 17/21. Create
  `android/keystore.properties` pointing at `_release_kit/android/mojabble-release.keystore`
  (alias `mojabble`), then `npm run sync:android` and `cd android && ./gradlew bundleRelease`.
- **iOS:** needs a Mac with Xcode. This is why we build on GitHub Actions instead.
