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

## Each release

1. Raise `versionCode` by 1 in `android/app/build.gradle` (and `versionName` if it makes sense).
2. `npm run apk` — builds the site with `--base=./`, syncs it into `android/`, and signs the release APK.
3. The file is `android/app/build/outputs/apk/release/app-release.apk`.
4. Install it **over** the old app (tap the file, choose Update). Never uninstall first: that deletes the decks.

## If an update will not install ("App not installed")

The new APK is signed with a different key than the installed app. Do not uninstall. Rebuild with the original keystore. If that key is gone: in the old app tap **Back up my decks**, uninstall, install the new APK, then **Restore from backup**.

## Gradle download errors (HTTP 429)

Maven Central rate-limits some networks. Gradle keeps what it already downloaded, so run the same command again until it passes.
