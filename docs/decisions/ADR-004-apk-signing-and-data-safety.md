---
description: One permanent signing key for every Swapsmith APK, deck backup and restore in the app, and the rules that keep users' decks across updates
status: current
updated: 2026-11-02
---
# ADR-004: APK signing and keeping decks across updates

## Context

Decks, owned cards and preferences live in the app's own storage on the phone ([ADR-001](ADR-001-swapsmith-stack-and-hosting.md)). Android keeps that storage when a new APK is installed over the old one, but only if both have the same package name and the same signing key. If the key differs, Android refuses the update, and uninstalling first deletes the data. The first APK ([ADR-003](ADR-003-android-apk-capacitor.md)) was signed with a throwaway debug key that existed only on a temporary build machine.

## Decision

- **One key for every build that anyone installs.** Builds are signed through `android/keystore.properties` (gitignored) or `SWAPSMITH_*` environment variables. `npm run apk` builds the signed release APK and fails with a clear message when no key is configured. `npm run apk:debug` still works without a key but prints a warning that its result cannot update an app installed from another key.
- **The key is the one the first APK was signed with** (the standard Android debug certificate generated on 2026-11-02, SHA-256 `C7:ED:BA:6C:3F:B9:F5:3C:59:59:77:BB:6A:98:5B:CF:3D:3B:1E:27:69:C6:05:C6:9D:FE:6E:21:DA:E3:FC:3C`), so phones that already have the app can update in place. Its passwords are the public defaults (`android`), so it protects against accidents but not against someone deliberately signing a fake update. That is acceptable for a personal sideloaded app.
- **The key file lives outside the repo.** `*.keystore`, `*.jks` and `android/keystore.properties` are gitignored. The owner keeps a copy somewhere safe; losing it means a one-time reinstall.
- **Backup and restore in the app.** The home screen can write all decks, owned cards and the view setting to a JSON file (share sheet in the app, download in a browser) and restore from one. Restore only merges: decks missing locally are added, a deck in both keeps the later edit, owned cards are combined, nothing is deleted. A file that is not a Swapsmith backup is rejected before anything changes.
- **Storage rules:** the package name `io.github.saturnskies.swapsmith` and the storage key `swapsmith:v1` do not change. A change to the stored shape needs a migration that reads the old data.
- **Releases come from CI.** `.github/workflows/android.yml` builds on a `v*` tag, signs with the key held in repository secrets, refuses to publish an APK that is not signed with the original certificate, and attaches it to a GitHub Release. `versionCode` is the workflow run number plus 100, so it only goes up; local builds use a lower default and must not be handed out.

## Alternatives Considered

### Make a new strong key now
- Pros: a real secret; the right key for a future Play Store listing.
- Cons: phones with the first APK could not update, and the first APK has no backup button, so installing the new build means uninstalling and losing decks.
- Deferred. When a strong key is wanted: back up in the app, uninstall, install the build signed with the new key, restore.

### Rely on Android auto-backup
- Pros: no work.
- Cons: not confirmed to include the WebView's storage, and only helps on restore to a new phone.
- Kept on, but not relied on.

## Consequences

- Updates install over the existing app and keep decks as long as the same key and package name are used.
- Anyone who builds the APK needs the key file and its passwords; `docs/android-build.md` says how.
- Moving to a strong key or to Play App Signing later costs users one backup, reinstall and restore.
