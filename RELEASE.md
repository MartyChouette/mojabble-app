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

## Push an update - step by step

### Step 1 - Pull, then make your change
```powershell
cd C:\Users\jerma\OneDrive\Desktop\mojabble
git checkout main
git pull
```
Edit the web game at the repo root: `index.html`, `js/*.js`, `words.txt`, `docs.html`.
(It's a Capacitor wrapper - these files are bundled in, there is no live URL, so any
change needs a new build.)

### Step 2 - Commit and push (this triggers the builds)
```powershell
git add -A
git commit -m "describe the change"
git push origin main
```
That's it for building. Every push to `main` builds **both** platforms. You do not
touch version numbers - CI sets them from the run number automatically.
Watch it: `gh run watch` or the Actions tab on GitHub.

### Step 3a - iOS: nothing to do
The signed build uploads to **TestFlight** by itself. Open TestFlight on the iPhone
to test. To ship publicly: App Store Connect -> select the build -> submit for review.

### Step 3b - Android: download the AAB, upload to Play
1. Download the freshly built bundle (or use the Actions tab -> Build Android run ->
   Artifacts -> **MojAbble-Android**):
   ```powershell
   $rid = gh run list --workflow=build-android.yml --status success --limit 1 --json databaseId --jq '.[0].databaseId'
   gh run download $rid --name MojAbble-Android --dir _release_kit\builds\new
   ```
2. Google Play Console (play.google.com/console) -> **MojAbble** -> **Test and release**.
3. Pick a track: **Internal testing** (fast, no review - do this first to verify) or
   **Production** (public, Google reviews it).
4. **Create new release** -> drag in `app-release.aab` (Play App Signing is already on;
   just upload). Confirm the versionCode shown is higher than the last one.
5. Add a release note, **Save** -> **Review release** -> **Start rollout**. Yellow
   warnings (no deobfuscation file, etc.) are safe to ignore.
6. Install from the testing opt-in link and check the change on a real phone. When
   happy, promote that same build: release -> **Promote -> Production** (no rebuild).

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
