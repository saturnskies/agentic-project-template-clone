---
description: Builds the Android APK with Capacitor, bundling the built site, with debug-signed builds for sideloading and no Play Store release yet
status: current
updated: 2026-11-02
---
# ADR-003: Android APK with Capacitor

## Context

[ADR-002](ADR-002-installable-pwa.md) made Swapsmith an installable PWA. The owner wants a real `.apk` to sideload. Play Store release and monetization are on hold.

## Decision

- **Wrapper:** Capacitor 8 (`capacitor.config.ts`, `android/`). The APK bundles the built `dist/`, so it opens offline and does not depend on GitHub Pages being up or a custom domain.
- **Build:** `npm run apk:debug` builds the site with `--base=./` (the APK serves from its own origin, not `/swapsmith/`), syncs it into `android/`, and runs Gradle `assembleDebug`. The result is `android/app/build/outputs/apk/debug/app-debug.apk`. It needs JDK 21 and the Android SDK (platform 35, build-tools 35.0.0) with `ANDROID_HOME` set.
- **Signing:** debug-signed only, which installs by sideloading. A release keystore and signing config are deferred to the Play Store decision. No keystore is ever committed.
- **Service worker:** not registered inside the APK; the files already ship in it.
- **Icons:** `node tools/make-icons.mjs` also writes the Android launcher icons (adaptive foreground over a black background, plus legacy and round) when `android/` exists.
- **App id:** `io.github.saturnskies.swapsmith`. It cannot change once people install the app, so change it before sharing builds if a different one is wanted.
- **Repo:** the generated `android/` project is committed (minus build output, which its own `.gitignore` covers) so the build is reproducible; CI does not build the APK yet.

## Alternatives Considered

### Trusted Web Activity (Bubblewrap)
- Pros: thin shell, updates by deploying the site.
- Cons: loads the live site, so it needs the PWA deployed first, and on a `github.io` path it shows a browser address bar unless the origin is verified with a custom domain.
- Deferred: revisit with a custom domain if a Play listing is wanted.

### Install the PWA from Chrome only
- Pros: no build at all.
- Cons: not an APK file to hand to someone.
- Kept as the zero-effort path; both exist.

## Consequences

- APK size is small (static assets plus the WebView), and Scryfall calls still come from the browser engine; they work from the app's `https://localhost` origin because Scryfall allows any origin.
- Web fixes reach the APK only when it is rebuilt and reinstalled.
- Any later Play release needs a release keystore, an `.aab` build, a privacy policy and the policy checks listed in the PWA discussion; that gets its own ADR.
