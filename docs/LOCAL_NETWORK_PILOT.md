# CORNHILL local network pilot — Windows test page

## Purpose

This is the first, deliberately small connectivity test for the separate local-first experiment. It starts a temporary HTTP server on the Windows PC and serves a static CORNHILL test page to a browser on that PC or another device on the same Wi-Fi/hotspot.

It is **not** the full school management system, does not connect to any database, and does not contain or request learner, parent, staff, login, finance or attendance data. It has no connection to the production Supabase or Vercel services.

## Requirements

- Windows 10 or Windows 11 with Windows PowerShell 5.1.
- The PC connected to the Wi-Fi or Android hotspot that the phone will use.
- A browser on the PC and phone.

No Docker, Node.js, Python, administrator account, installation wizard, internet connection, or firewall-rule creation is required by the script.

## Run the test

1. Download the file at windows/Start-CORNHILL-LAN-Pilot.ps1 from the experimental branch.
2. Save it in the PC's Downloads folder.
3. Open Windows PowerShell.
4. Run:

   ~~~powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\Start-CORNHILL-LAN-Pilot.ps1"
   ~~~

5. Leave the PowerShell window open. It prints two addresses:
   - On the PC: http://127.0.0.1:8088/
   - On the phone: use the exact http://<PC-IPv4-address>:8088/ address printed by the script.
6. Open the PC address in the PC browser first. Then open the printed phone address on a phone connected to the same Wi-Fi/hotspot.
7. The phone test passes when the page displays **Connected to the CORNHILL test server**.
8. Press Ctrl+C in PowerShell to stop the temporary server.

## Network and firewall notes

- The script binds to the PC's active IPv4 address associated with its default gateway, not to every network adapter.
- It does not create, remove or modify Windows Firewall rules.
- If Windows displays an app-access prompt, only allow access on a trusted **Private** network. Do not enable Public network access.
- If the page opens on the PC but not on the phone, report that result. Possible causes include Windows Firewall or Android hotspot client isolation. Do not disable the firewall or change router settings just to make this test pass.

## What a pass means

A pass proves that a second device can reach a temporary web service on the PC over that particular local network. It is an initial network test only; it does not prove database, authentication, multi-user, offline transaction, backup, remote-parent access or production readiness.

## Hardware constraint

The readiness check on the current test PC reported approximately 3.9 GB RAM and 8.2 GB free on the system drive. That is below the published minimum target for a full self-hosted Supabase stack. Use this PC for this lightweight network test only. Do not install Docker or attempt a full local database stack here. A separate, adequately provisioned host will be required for the full backend pilot.

## Protection boundary

All files and instructions belong to feat/local-first-server-pilot-20261113. Do not merge this branch into the live branch or deploy it to production as part of this test. The live Vercel application, managed Supabase project, accounts and school records remain outside the experiment.
