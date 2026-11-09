# CORNHILL Windows and Android app shells

This project packages the **same hosted CORNHILL application** as a Windows installer and Android APK. It does not fork the learner database, finance ledger, staff accounts or application UI.

## How updates work

The native shell points to:

`https://cornhill-school-swart.vercel.app/`

CORNHILL screens and web code continue to be served by the existing production site. Normal web releases therefore appear in the installed desktop/mobile app after the webview is refreshed/reopened; staff do not need a new installer for ordinary website changes.

A new native installer/APK is needed only when the native shell itself changes (for example, native permissions, app identity, icon or platform integration). The native shell deliberately has no Tauri plugins, commands, file-system permissions or remote IPC capabilities.

Private school records continue to require the existing Supabase sign-in and row-level security. Offline availability remains limited to the web app's existing public shell and safe local drafts; it does not make finance posting, approval, official marks publication or other server transactions available offline.

## Build requirements

- Windows installer: Windows 10/11 build runner, Rust, Microsoft C++ Build Tools and WebView2.
- Android APK: JDK 17, Android SDK platform/tools, Android NDK, Rust Android target and a persistent private Android signing keystore.

## Windows EXE installer

From this folder on a Windows development machine:

```powershell
cargo install tauri-cli --version "^2" --locked
cargo tauri icon ../../assets/cornhill-school-pwa-512.svg --output src-tauri/icons
cargo tauri build --bundles nsis --no-sign
```

The NSIS installer is emitted under `src-tauri/target/release/bundle/nsis/`. It is not code-signed in this free internal build, so Windows may display an unknown-publisher warning. A trusted publisher signature requires a separately purchased/managed signing certificate.

## Android APK signing (one time)

Create one long-lived school key on a trusted Windows PC. Keep the `.jks` file and its password private and make at least two secure offline copies.

```powershell
keytool -genkeypair -v -keystore cornhill-upload-key.jks -alias cornhill -keyalg RSA -keysize 2048 -validity 10000
```

Do **not** commit or send the keystore/password in chat. Add these encrypted repository Actions secrets under GitHub → Settings → Secrets and variables → Actions:

- `ANDROID_KEYSTORE_BASE64`: Base64 content of the `.jks` file.
- `ANDROID_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_KEY_ALIAS`: `cornhill`.

PowerShell can encode the keystore for the secret value:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD/cornhill-upload-key.jks"))
```

The workflow reconstructs the key only on its temporary build runner and removes it when the job ends. Never rotate or discard the original key: Android will reject an update signed with a different key.

## Build APK locally (after the one-time signing setup)

```powershell
cargo install tauri-cli --version "^2" --locked
cargo tauri icon ../../assets/cornhill-school-pwa-512.svg --output src-tauri/icons
cargo tauri android init
# Add keystore.properties and the release signing block to app/build.gradle.kts
# as performed automatically by scripts/configure-android-signing.py in CI.
cargo tauri android build --apk --target aarch64
```

The build is ARM64 for modern Android phones. Tauri's current Android minimum is API 24 / Android 7.0. Test camera capture, file selection, printing, sign-in, back navigation and offline behaviour on the actual phones before wide distribution.

## CI build

Run **Actions → Build CORNHILL native packages → Run workflow**. The Windows job produces an unsigned NSIS `.exe`. The Android job requires the three signing secrets above and produces an installable, release-signed APK artifact.

The APK is not yet submitted to Google Play. Direct internal distribution is possible; Play Store publication is a separate release and policy review.
