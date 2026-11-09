# CORNHILL Windows and Android Compatibility Review — 2026-11-07

## Scope and honesty boundary

This is a source and deployed-HTTP compatibility review of the latest preview, not a claim that a physical Windows 10, Windows 11, or Android device has been operated. No real learner, guardian, attendance, assessment, payment, or finance records were changed.

Preview tested:
- URL: https://cornhill-school-7x98846jh-cypher-projects1.vercel.app/
- Vercel deployment: `dpl_DFxu4MNqNE8VDctyrVXxLqspV22W`
- Branch: `feature/cornhill-v3-foundation`
- Commit: `50de2e51dfdafcaf5da23e81b51be37804789f1e`
- Deployment state: READY

## Checks completed

| Check | Result | Evidence |
|---|---|---|
| Main application route | PASS | HTTP 200, HTML returned |
| Parent portal route | PASS | `/parents.html` HTTP 200 |
| PWA manifest route | PASS | `/manifest.webmanifest` HTTP 200; valid JSON |
| Service worker route | PASS | `/service-worker.js` HTTP 200; JavaScript returned |
| App icon | PASS | SVG icon HTTP 200 |
| School crest | PASS | JPEG crest HTTP 200 |
| Viewport configuration | PASS | Responsive viewport meta tag present |
| Responsive CSS coverage | PASS (source check) | 31 media-query rules; breakpoints include 380, 390, 400, 420, 480, 520, 600, 650, 700, 760, 900 and 1100 px |
| Inline JavaScript syntax | PASS | All 3 inline script blocks compile; zero syntax errors |
| PWA display metadata | PASS (manifest check) | `display: standalone`, scope and start URL are `/` |
| Service-worker registration | PASS (source check) | HTTPS registration of `/service-worker.js` is present |
| Online/offline event listeners | PASS (source check) | App listens for online and offline events |
| Cached shell resources | PASS (source check) | Root, index, manifest, SVG icon and crest are in cache shell |

## Findings requiring correction or real-device verification

1. **PWA icon sizes:** The manifest currently has an SVG icon with `sizes: any` and a 128×128 JPEG. It does not declare the conventional 192×192 and 512×512 PNG icons used by Chromium installability checks. The site can still be opened in Chrome, but the Android install prompt may not qualify consistently until suitable icons are supplied.
2. **Offline dependency gap:** The service worker deliberately does not cache cross-origin requests. The main page loads Supabase JS and SheetJS from jsDelivr CDNs. The offline fallback can return the cached HTML shell, but those libraries are not part of the cached shell. Therefore a cached page response alone does not prove that the application can initialise or that offline features work. Test and likely bundle/cache these dependencies before promising full offline operation.
3. **Teacher marks register on phones:** The marks grid intentionally retains a wide table (minimum 980 px) and uses horizontal scrolling on narrow screens. This preserves columns but requires a real Android usability test for scrolling, sticky headings, score entry and save feedback.
4. **Browser APIs:** Camera, microphone, recording, printing, IndexedDB and service-worker behaviour require actual browser permission/device testing. HTTP checks cannot validate these capabilities.
5. **Windows print workflow:** Receipt print CSS is present, but Windows printer selection, 58 mm/80 mm thermal output, page scaling and paper cut behaviour have not been tested.

## Device acceptance matrix

| Platform | Browser target | Status |
|---|---|---|
| Windows 10 | Current Microsoft Edge / Chrome | Pending physical-device test |
| Windows 11 | Current Microsoft Edge / Chrome | Pending physical-device test |
| Android | Current Chrome | Pending physical-device test |
| Android | Samsung Internet | Pending physical-device test |

Internet-facing route checks passed for the listed resources. No claim is made that all modules, role permissions, OTP, payments, printing, camera/microphone, or offline synchronisation passed end-to-end on any device.

## Safe test sequence for device owners

Use the preview URL above and test with authorised test accounts only:
1. Open the page and confirm it loads without horizontal page overflow.
2. Sign in and navigate through dashboard, learner list, admissions, academics, teacher workspace and finance screens without submitting real transactions.
3. On Android, rotate portrait/landscape and test navigation, search fields, forms and the marks grid.
4. Test offline mode only with a non-production account and disposable test data; verify that the page initialises, drafts remain local, reconnect does not duplicate data, and payment posting remains blocked while offline.
5. On Windows, preview a receipt without posting a real payment. Test printer output only with an approved test receipt and printer.
6. Record device model, OS version, browser version, screen orientation and any error message for each failed check.

## Release conclusion

The latest preview is reachable and its HTML, manifest, service worker and key image assets return HTTP 200. Responsive and PWA/offline source checks are partially positive. Windows 10/11 and Android physical-device acceptance is **not yet passed**. The PWA icon-size gap and offline CDN dependency gap should be addressed before describing CORNHILL as fully installable or fully offline-capable.
