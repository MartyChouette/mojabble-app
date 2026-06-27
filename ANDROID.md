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

## Target SDK 35

The project targets `compileSdk`/`targetSdk` 35 in `android/variables.gradle`,
matching the live build (the published AAB is targetSdk 35, minSdk 22). The
Android Gradle Plugin is still 8.2.1, so `android/gradle.properties` sets
`android.suppressUnsupportedCompileSdk=35` to allow building against 35 without an
AGP upgrade. If the CI build complains, the clean fix is to bump AGP to >= 8.6 in
`android/build.gradle` and the Gradle wrapper to a matching version.

API 35 forces edge-to-edge layout, which is exactly why the bottom UI uses
`env(safe-area-inset-bottom)` (see the nav-bar margin fix in `index.html`).

## Signing credentials (recovered)

The keystore was created with alias `mojabble`, store/key password `mojabble123`
(verified against `mojabble-release.keystore`; valid to 2053). These are filled in
to `android/keystore.properties` for local builds. For CI, the same values go into
the four GitHub secrets above.
