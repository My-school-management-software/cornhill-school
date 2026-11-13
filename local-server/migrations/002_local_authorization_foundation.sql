-- CORNHILL local authorization foundation.
-- Additive migration for a NEW, isolated local PostgreSQL database only.
-- It deliberately grants no database privileges and assigns no permissions.
-- Do not run against the live Supabase project.

BEGIN;

CREATE TABLE cornhill_auth.permission_catalog (
    permission_code text PRIMARY KEY,
    category text NOT NULL,
    description text NOT NULL,
    high_risk boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT permission_code_format
        CHECK (permission_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT permission_category_nonempty
        CHECK (length(trim(category)) > 0),
    CONSTRAINT permission_description_nonempty
        CHECK (length(trim(description)) > 0)
);

INSERT INTO cornhill_auth.permission_catalog
    (permission_code, category, description, high_risk)
VALUES
    ('learners.read', 'learners', 'View learner records permitted by staff scope.', false),
    ('learners.manage', 'learners', 'Create or update learner records.', true),
    ('academics.marks_enter', 'academics', 'Enter or amend marks within assigned academic scope.', false),
    ('academics.results_publish', 'academics', 'Approve and publish academic results.', true),
    ('finance.payments_record', 'finance', 'Record and receipt authorised school payments.', true),
    ('finance.payments_reverse', 'finance', 'Reverse a posted payment with an audit reason.', true),
    ('finance.reports_read', 'finance', 'View authorised finance reports.', false),
    ('staff.attendance_manage', 'staff', 'Manage and correct staff attendance records.', true),
    ('staff.payroll_read', 'staff', 'View authorised payroll information.', true),
    ('staff.payroll_manage', 'staff', 'Prepare or approve payroll changes.', true),
    ('staff.accounts_manage', 'security', 'Create, suspend and administer staff accounts.', true),
    ('guardians.access_approve', 'security', 'Approve or revoke a guardian-to-learner link.', true),
    ('system.roles_manage', 'security', 'Grant or revoke staff role permissions.', true),
    ('system.backups_manage', 'system', 'Create, inspect and restore protected backups.', true)
ON CONFLICT (permission_code) DO NOTHING;

-- Role-to-permission grants are intentionally empty at creation.
-- School leadership must review and approve a permission matrix before any
-- role receives a capability. No role is implicitly all-powerful in the API.
CREATE TABLE cornhill_auth.staff_role_permissions (
    role_code text NOT NULL
        REFERENCES cornhill_auth.staff_roles(role_code) ON DELETE RESTRICT,
    permission_code text NOT NULL
        REFERENCES cornhill_auth.permission_catalog(permission_code) ON DELETE RESTRICT,
    granted_by_staff_id uuid
        REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (role_code, permission_code)
);

-- Class IDs remain UUIDs without a foreign key until the local class schema
-- and its data-preservation mapping have been validated.
CREATE TABLE cornhill_auth.staff_class_assignments (
    staff_account_id uuid NOT NULL
        REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    class_id uuid NOT NULL,
    assignment_type text NOT NULL
        CHECK (assignment_type IN ('class_teacher', 'subject_teacher', 'support_teacher')),
    assigned_by_staff_id uuid
        REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    is_active boolean NOT NULL DEFAULT true,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    PRIMARY KEY (staff_account_id, class_id, assignment_type),
    CONSTRAINT class_assignment_end_consistent CHECK (
        (is_active = true AND ended_at IS NULL)
        OR (is_active = false AND ended_at IS NOT NULL)
    )
);

CREATE INDEX staff_class_assignments_active_class_idx
    ON cornhill_auth.staff_class_assignments (class_id, staff_account_id)
    WHERE is_active = true;

CREATE INDEX staff_role_permissions_permission_idx
    ON cornhill_auth.staff_role_permissions (permission_code, role_code);

REVOKE ALL ON TABLE
    cornhill_auth.permission_catalog,
    cornhill_auth.staff_role_permissions,
    cornhill_auth.staff_class_assignments
FROM PUBLIC;

COMMIT;