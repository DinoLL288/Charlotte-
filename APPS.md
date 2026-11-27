# Charlotte & Luke — native apps

Real installable apps for the site, built with **Capacitor** (Android + iOS)
and **Tauri** (Linux + Mac + Windows). Tauri was picked over Electron on
purpose: it uses the system's own web view instead of bundling a whole
browser, so it stays light — the Discord problem Luke complained about.

## Honest note: what these apps are

These are native shells around the live site (`https://charlotte-3ts.pages.dev`),
not a rewrite of the site in Swift/Kotlin. The app opens the live site in a
system web view, so login, the calendar, moods, the APIs and realtime
features all work exactly as on the web — and the app never needs an update
when the site changes, because it loads the live site every time. The
trade-off: the apps need the internet (the site is a live service anyway).

The one layout change for app mode: the "Add to home screen" banner is
hidden inside the native apps, since the site is already installed there
(`assets/js/install-prompt.js` checks for `window.Capacitor` /
`window.__TAURI__`). Nothing else about the site was redesigned.

## Apple: no paid account needed

You do **not** need a paid Apple Developer account for any of this. A free
Apple ID is enough — Xcode lets you sign with a "personal team" and install
the app on your own devices. Limits of the free route: the app certificate
lasts 7 days, so you re-sign/re-install about once a week, and you can only
install on your own devices (no App Store). That is all Luke needs.

## Android

**What you need:** Android Studio (free) on any computer, or the Android
SDK + JDK 17 on the command line.

1. `npm install`
2. `npx cap sync android` (copies the config + fallback page in)
3. Open `android/` in Android Studio, plug in the phone, press Run — or
   build a debug APK from the command line:
   `cd android && ./gradlew assembleDebug`
   The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.
   Copy it to the phone and tap it to install (allow "install unknown apps"
   for your file manager the first time).
4. App icon/splash: the defaults are Capacitor's placeholders — replace
   `android/app/src/main/res/mipmap-*/ic_launcher*.png` with the site's
   `icons/icon-512.png` (or run `npx @capacitor/assets generate`).

## iOS (free Apple ID, no paid account)

**What you need:** a Mac with Xcode (free from the Mac App Store) and a free
Apple ID. You cannot build iOS apps on Linux or Windows.

1. On the Mac: `npm install`, then `npx cap sync ios`.
2. Open `ios/App/App.xcworkspace` in Xcode (open the `.xcworkspace`, not the
   `.xcodeproj`).
3. Select the **App** target → **Signing & Capabilities** → tick
   **Automatically manage signing** → pick your **Personal Team** (your free
   Apple ID — add it in Xcode → Settings → Accounts if it is not there).
   No paid developer account is needed; leave the bundle ID as
   `com.charlotte.luke`.
4. Plug in the iPhone, pick it as the run destination, press Run. Xcode
   installs the app on the phone.
5. On the phone the first time: Settings → General → VPN & Device
   Management → trust your Apple ID.
6. The free certificate lasts **7 days** — after that, plug the phone in
   and press Run again to re-sign. (AltStore automates this over Wi-Fi if
   you get tired of the weekly plug-in.)
7. App icon: replace the placeholder in
   `ios/App/App/Assets.xcassets/AppIcon.appiconset/` with the site's
   `icons/icon-512.png` (or run `npx @capacitor/assets generate`).

## Mac (free Apple ID, no paid account)

**What you need:** a Mac with Xcode command-line tools and Rust
(`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`).

1. `npm install`
2. `npx @tauri-apps/cli build` (or `cargo tauri build` if the Tauri CLI is
   installed). This produces `Charlotte & Luke.app` and a `.dmg` in
   `src-tauri/target/release/bundle/`.
3. The app is **ad-hoc signed** — no Apple ID or certificate is needed to
   run it on your own Mac. The first time you open it, macOS Gatekeeper
   may block it: right-click the app → Open → Open, and it will run from
   then on.
4. No paid developer account is needed unless you want to put it on the
   Mac App Store or share a notarised copy with other people.

## Windows

**What you need:** a Windows PC with Rust and the WebView2 runtime (comes
with Windows 11 / Edge; installable free on Windows 10).

1. `npm install`
2. `npx @tauri-apps/cli build` — produces an `.msi` and an `.nsis` installer
   in `src-tauri/target/release/bundle/`.
3. Run the installer. No signing certificate is needed for your own PC;
   Windows SmartScreen may ask "run anyway" the first time.

Cross-compiling the Windows build from Linux was not attempted — build it
on a Windows machine.

## Linux

**What you need:** Rust plus the Tauri system libraries.

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm install
npx @tauri-apps/cli build
```

This produces an `.AppImage` and a `.deb` in
`src-tauri/target/release/bundle/`. Run the AppImage directly, or install
the `.deb` with `sudo dpkg -i`.

## Files

| Path | What it is |
| --- | --- |
| `capacitor.config.json` | Capacitor config — app id `com.charlotte.luke`, live site URL |
| `android/` | Capacitor Android project |
| `ios/` | Capacitor iOS project (Xcode) |
| `apps/capacitor-web/` | Tiny offline fallback page bundled in the mobile apps |
| `src-tauri/` | Tauri desktop project (Rust) |
| `tests/native-apps.test.mjs` | Tests that the app configs are valid and point at the live site |
