# CORNHILL Windows full-screen kiosk setup

This optional launcher opens the existing CORNHILL production address in a full-screen browser kiosk. It hides normal browser chrome, including the installed-app menu where Chrome may show **Uninstall**. It does not alter the website address, remove the PWA, change school records, or uninstall a browser.

## Files

- `Launch-CORNHILL-Kiosk.cmd` — launches Microsoft Edge in full-screen kiosk mode when available; otherwise it uses Google Chrome kiosk/app mode.
- Website: https://cornhill-school-cypher-projects1.vercel.app/

## Safe setup on a school Windows 10/11 computer

1. Download the launcher from the CORNHILL repository's `windows` folder.
2. Have the school's authorised IT administrator test it on one non-critical computer first.
3. Close the existing CORNHILL app window, then run the launcher.
4. Confirm the address is the official CORNHILL site and test the normal school sign-in and navigation.
5. If the display needs to be closed, use the school's approved administrator procedure. Kiosk mode is a presentation/access restriction, not a replacement for Windows account security.
6. For shared school computers, create a separate standard Windows account for daily school use. Keep administrator credentials with authorised management only. If stronger lock-down is required, configure Windows Assigned Access / kiosk mode through Windows Settings with an administrator present.

## Important limits and safeguards

- A website cannot remove Chrome's own **Uninstall** command or control browser installation settings. Kiosk launch avoids showing that browser interface during the school session.
- The launcher does not prevent a person with Windows administrator rights from changing installed applications or ending the kiosk session. Use Windows standard-user accounts and Assigned Access for that.
- Do not disable Windows security shortcuts, Task Manager, updates, or administrator recovery as a workaround.
- This launcher targets the current permanent CORNHILL URL. If the website is updated, the same address remains the entry point.
- Test the launcher on one machine before placing it on all school computers. Keep an ordinary administrator desktop route available for maintenance.
- The current web manifest already declares `display: standalone`; no manifest change is required for this Windows kiosk launch.

## Review checklist

- [ ] Edge kiosk opens CORNHILL full-screen without browser toolbar/app menu.
- [ ] Chrome fallback opens CORNHILL without the installed-app Uninstall menu.
- [ ] Sign-in, dashboard, and required workspaces remain usable.
- [ ] Admin maintenance route remains available to authorised staff.
- [ ] Windows 10 and Windows 11 are checked separately.

The kiosk launcher is a Windows-side companion, not a substitute for role-based permissions in CORNHILL or Windows device management.
