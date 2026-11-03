# Cornhill School Management System

A mobile-friendly starter for Cornhill Nursery and Primary School (Uganda).

## Current foundation
- Staff sign-in through Supabase Auth
- Student register and search
- Class and stream setup
- Student and class totals
- Student data stored in Supabase with Row Level Security
- Currency and future finance modules are planned for UGX

## One-time Supabase setup
1. Open the Cornhill project in Supabase.
2. Go to **SQL Editor** → **New query**.
3. Open `supabase/migrations/202611030001_initial_schema.sql` in this repository, copy all its contents, paste into the SQL Editor, and click **Run**.
4. In Supabase, go to **Authentication → Users → Add user** and create the first administrator account using an email and a strong password.
5. Copy the new user's exact email into the final commented SQL update in the migration (replace `YOUR_ADMIN_EMAIL` and set the administrator's name), uncomment those four lines, and run that update in SQL Editor. This promotes only that account to Admin.
6. Create additional staff accounts under **Authentication → Users → Add user**. New accounts receive the Staff role automatically.

Do not put a Supabase service-role/secret key in this website or share it in chat. The website uses only the public publishable key. Keep Row Level Security enabled.

## Preview and publish
This work is on branch `feature/cornhill-v3-foundation`; the live `main` branch has not been changed. Review the branch, then open a Pull Request into `main` on GitHub. Merge it after testing to publish through the existing Vercel connection.

## Important
The current version is the first foundation, not the complete school system. It currently covers sign-in, student registration, and classes. Attendance, marks/UNEB grading, report cards, fees, bursaries, staff/payroll, parent communication, and backups still need to be built and tested before the school relies on this system for daily operations.
