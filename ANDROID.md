# MojAbble - Android Build & Update Guide

The Android app is a Capacitor wrapper around the web game. The web source
(`index.html`, `js/`, `words.txt`, `docs.html`) lives at the repo root and gets
bundled into the app. There is **no live URL** - shipping a web change means
building and uploading a new AAB.

- App ID: `com.mojabble.app`
- Live on Google Play at **versionCode 14** (versionName 1.0)
- Native Android project: `android/` (committed to this repo)
- Builds run in GitHub Actions: `.github/workflows/build-android.yml`

> The web source for the live build was recovered from inside the published AAB
> on 2026-06-27 (it had never been committed). The repo is now the source of truth.

---

## One-time setup: GitHub secrets

CI signs the AAB with your existing upload key. Add these 4 repository secrets at
`https://github.com/MartyChouette/mojabble-app/settings/secrets/actions`:

| Secret | Value |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | Contents of `Desktop\mojabble-keystore-base64.txt` (already generated) |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore (store) password |
| `ANDROID_KEY_ALIAS` | The key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | The key password (often same as the store password) |

**Back up `mojabble-release.keystore` somewhere safe.** If it is lost you can
never update this Play listing again - you would have to publish a brand-new app.

---

## To ship an update (the normal flow)

1. Make your web changes (`index.html`, `js/*`, etc.).
2. Bump the version in `android/app/build.gradle`:
   ```gradle
   versionCode 16      // must be HIGHER than the last uploaded build
   versionName "1.0.2" // human-facing, your call
   ```
   Play rejects any upload whose `versionCode` is not greater than the live one.
3. Commit and push to `main` (or run the **Build Android** workflow manually via
   the Actions tab). CI builds and signs the AAB.
4. In the workflow run, download the **MojAbble-Android-AAB** artifact.
5. Google Play Console -> your app -> create a new release on the desired track
   (Internal testing / Production) -> upload the `.aab` -> roll out.

---

## Building locally (optional, needs Android Studio + SDK)

CI is the recommended path. To build on this PC instead:

1. Install Android Studio (bundles the SDK) and a JDK 17 or 21
   (the system JDK 26 is too new for this Gradle version).
2. Copy `android/keystore.properties.example` to `android/keystore.properties`
   and fill in real values (this file is gitignored).
3. From the repo root:
   ```powershell
   npm run sync:android
   cd android
   .\gradlew bundleRelease
   ```
4. Output: `android/app/build/outputs/bundle/release/app-release.aab`.

---

## Known follow-up: target SDK 35

The project currently targets `compileSdk`/`targetSdk` 34 (matching the toolchain
that produced the live build). Google Play now requires **API 35** for updates, so
before the next Play upload is accepted you will likely need to bump
`compileSdkVersion`/`targetSdkVersion` to 35 in `android/variables.gradle`, which
also requires bumping the Android Gradle Plugin (`android/build.gradle`) and the
Gradle wrapper. Do this after confirming the pipeline produces a green signed AAB
at 34, so any failures are easy to isolate.

API 35 forces edge-to-edge layout, which is exactly why the bottom UI uses
`env(safe-area-inset-bottom)` (see the nav-bar margin fix in `index.html`).
