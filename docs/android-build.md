---
description: How to build, sign and update the Swapsmith Android APK, and what keeps users' decks safe across updates
status: current
updated: 2026-11-02
---
# Building the Android APK

Decisions: [ADR-003](decisions/ADR-003-android-apk-capacitor.md) (Capacitor wrapper), [ADR-004](decisions/ADR-004-apk-signing-and-data-safety.md) (signing and keeping decks).

## One-time setup

1. JDK 21 and the Android SDK (platform 35, build-tools 35.0.0). Set `ANDROID_HOME`.
2. Put the signing keystore file somewhere outside the repo, for example `~/.swapsmith/swapsmith.keystore`.
3. Copy `android/keystore.properties.example` to `android/keystore.properties` and fill in the path, passwords and alias. That file is gitignored. (Or set `SWAPSMITH_KEYSTORE`, `SWAPSMITH_KEYSTORE_PASSWORD`, `SWAPSMITH_KEY_ALIAS`, `SWAPSMITH_KEY_PASSWORD`.)

## Publishing from GitHub (the normal way)

`.github/workflows/android.yml` builds the signed APK and publishes it as a GitHub Release, so a phone can update straight from the repo.

**One-time: add four repository secrets** (Settings → Secrets and variables → Actions → New repository secret):

| Secret | Value |
|---|---|
| `SWAPSMITH_KEYSTORE_BASE64` | the keystore file, base64: `base64 -w0 swapsmith-signing.keystore` (on a Mac: `base64 -i swapsmith-signing.keystore`) |
| `SWAPSMITH_KEYSTORE_PASSWORD` | `android` |
| `SWAPSMITH_KEY_ALIAS` | `androiddebugkey` |
| `SWAPSMITH_KEY_PASSWORD` | `android` |

The keystore is the one every installed phone was signed with. Never commit it (the repo is public). The workflow fails with a clear message if a secret is missing, and also fails if the built APK is not signed with the original key.

**Each release:** merge to `main`, then either run `git tag v0.3.0 && git push origin v0.3.0`, or on github.com open the repo → **Releases** → **Draft a new release**, type `v0.3.0` in **Choose a tag** → **Create new tag**, and click **Publish release**. Or, with no tag handling at all: **Actions** → **Android APK** → **Run workflow**, choose branch `main`, type `v0.3.0` in **release_tag** and run it. That run creates the tag and the release itself and attaches the APK. (This is also how an assistant that cannot push tags can publish a release.) Either way the workflow attaches the APK to the release. Releases can only be published from `main`, and the tag must look like `v1.2.3`. The workflow builds, then attaches `swapsmith-0.3.0.apk` to a new Release. On the phone, open the repo's **Releases** page in Chrome, download the APK, tap it and choose **Update**. Running the workflow by hand (Actions → Android APK → Run workflow) builds the APK as a downloadable artifact without publishing a release.

Version numbers: CI sets `versionName` from the tag and `versionCode` to the run number plus 100, so each CI build is newer than the last. A local `npm run apk` uses the lower defaults in `android/app/build.gradle`, so **do not install local builds on a phone that already has a CI build**; Android refuses a downgrade. Hand out CI builds only.

## Building locally

Use this for testing. The steps below build the same signed APK on your machine.

### Each local build

1. Only if you will install it on a phone that has never had a CI build: raise the default `versionCode` in `android/app/build.gradle` above what the phone has.
2. `npm run apk` — builds the site with `--base=./`, syncs it into `android/`, and signs the release APK.
3. The file is `android/app/build/outputs/apk/release/app-release.apk`.
4. Install it **over** the old app (tap the file, choose Update). Never uninstall first: that deletes the decks.

## If an update will not install ("App not installed")

The new APK is signed with a different key than the installed app. Do not uninstall. Rebuild with the original keystore. If that key is gone: in the old app tap **Back up my decks**, uninstall, install the new APK, then **Restore from backup**.

## Gradle download errors (HTTP 429)

Maven Central rate-limits some networks. Gradle keeps what it already downloaded, so run the same command again until it passes.
