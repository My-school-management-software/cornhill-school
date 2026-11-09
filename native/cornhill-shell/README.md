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

## Windows EXE installer: unsigned validation build

From this folder on a Windows development machine:

```powershell
cargo install tauri-cli --version "^2" --locked
cargo tauri icon ../../assets/cornhill-school-pwa-512.svg --output src-tauri/icons
cargo tauri build --bundles nsis --no-sign
```

The NSIS installer is emitted under `src-tauri/target/release/bundle/nsis/`. The CI artifact `CORNHILL-Windows-UNSIGNED-TEST-ONLY` is **not a release for distribution**. Do not ask staff to bypass SmartScreen for this unsigned build.

## Windows trusted-publisher signing

The direct-download Windows installer needs a genuine Authenticode code-signing certificate issued by a CA trusted by Windows/Microsoft. It must be a **public OV code-signing certificate for the school's legal publisher identity**, not an SSL/TLS certificate and not a self-signed development certificate.

This certificate has to be obtained and identity-validated by the school's authorised adult/legal representative. Keep the PFX and its password private. Never commit them to the repository, upload them as workflow artifacts, or send them in chat.

After the school has obtained the certificate, the authorised repository administrator adds these encrypted GitHub Actions repository secrets under **Settings → Environments → school-signing**. Configure at least one trusted adult school administrator as a required reviewer and restrict deployments to this release branch, then add the following as environment secrets:

- `WINDOWS_CERTIFICATE`: Base64-encoded contents of the PFX file, including its private key.
- `WINDOWS_CERTIFICATE_PASSWORD`: the PFX export password.

On a trusted Windows computer, the authorised administrator can produce the one-line Base64 value locally with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\\secure\\path\\cornhill-code-signing.pfx"))
```

Do not paste the output anywhere except the matching GitHub Actions secret field. Do not send the PFX or password to ChatGPT or add either value to source files.

Then run **Actions → Build CORNHILL native packages → Run workflow**, select `build_windows = true` and `sign_windows = true`. The signed job uses the protected `school-signing` GitHub Environment, so the required reviewer must approve access before certificate secrets are exposed to the build. It:

1. Imports the certificate only on the temporary Windows runner.
2. Builds the NSIS installer with the certificate thumbprint.
3. Verifies that every produced installer has a valid Authenticode signature from that exact certificate.
4. Creates a SHA-256 checksum and uploads the installer plus checksum as `CORNHILL-Windows-SIGNED-VERIFIED`.
5. Removes the temporary certificate and PFX file when the job finishes.

If either secret is missing, the signed job fails closed. The unsigned validation build is separately labelled TEST ONLY.

**SmartScreen note:** A valid signature identifies the publisher and allows reputation to build across consistent releases, but Microsoft can still show an initial SmartScreen reputation warning for a new publisher or file. A signature is not a promise that every first download will be warning-free.

### No-purchase Windows distribution alternative

For a zero-code-signing-certificate-cost route, CORNHILL can be prepared as an MSIX/PWA package and submitted to the Microsoft Store. After Microsoft approves it, the Store re-signs the package and manages Store delivery/updates. Microsoft currently waives developer registration fees, but account verification and app certification are still required. The school's authorised adult representative must own the publisher account and complete any identity/legal-entity checks. Store packaging and submission are **not yet completed** in this repository.

Microsoft Artifact Signing public trust is not currently offered for Uganda-based publishers, so it is not the route configured here. If the school chooses direct website downloads instead of Store distribution, use a compatible public OV code-signing certificate and confirm its availability with the issuing CA before paying for it.

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
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\\cornhill-upload-key.jks"))
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

Run **Actions → Build CORNHILL native packages → Run workflow**.

- Windows validation build: unsigned and TEST ONLY; not for distribution.
- Windows release build: requires the two certificate secrets and `sign_windows = true`; the workflow verifies its signature and checksum.
- Android release build: requires the three Android signing secrets and produces an installable, release-signed APK artifact.

The APK is not yet submitted to Google Play. Direct internal distribution is possible; Play Store publication is a separate release and policy review.
