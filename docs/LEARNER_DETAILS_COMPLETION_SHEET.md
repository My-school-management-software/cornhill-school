# CORNHILL learner information completion sheet

## Purpose
The main administrator Learner Register includes a class-wise information completion sheet. It is intended for an administrator to work through a class roster with learners and guardians, completing missing identity and parent/guardian information without leaving the class register.

## How to use it
1. Sign in to the main school system with an administrator account.
2. Open **Learner register** and choose a class card (Baby, Middle, Top, P.1–P.7, a stream, or All learners).
3. Use the existing register search to find a learner by name, pupil code or LIN.
4. Use the information filter to show all learners or only learners missing a date/year of birth, parent/guardian name, contact details or LIN.
5. Select a learner in the new **Learner information completion sheet**.
6. Enter verified details and save. The editor remains in the register workspace; the full admission editor remains available for additional fields.

## Information available in the quick editor
- Learner's first, middle and last names and gender
- Full date of birth and verified year of birth
- Ministry LIN and P.7 examination index number
- Parent/guardian name and relationship
- Guardian phone and email
- Alternative guardian name and phone
- Home address / village
- SMS and WhatsApp consent preferences

## Important data rules
- Enter a full date only when the day, month and year have been confirmed.
- Where only the year is known, enter the verified birth year and leave the full date blank. Never guess a date.
- A corrected birth year or gender can cause the existing pupil-code workflow to issue a corrected permanent code. Historical code links are retained by the main admission process.
- The quick editor does not change bursary awards, fee schedules, payments, attendance or marks.
- The update is submitted through the existing administrator Learner Register save handler, preserving its validation and database permission checks.
- Guardian contact details, learner dates of birth and LIN are private school records. Exported CSV sheets must be stored only on school-controlled devices and handled as confidential records.

## Current verification
The new sheet's source is checked by the CORNHILL Node test workflow, including JavaScript parsing, admin-only rendering, core fields, reuse of the existing update handler, and offline shell registration. These automated checks do not replace visual testing on the school's Windows computers and Android phones or a supervised test with a designated test learner.
