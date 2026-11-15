-- CORNHILL local academic year, term, subject and assessment foundation.
-- Additive migration for the isolated local database only; no live data is touched.

BEGIN;

CREATE TABLE cornhill_school.academic_years (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    year_label text NOT NULL UNIQUE,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    status text NOT NULL DEFAULT 'Planned'
      CHECK (status IN ('Planned', 'Active', 'Completed', 'Archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT academic_year_dates_valid CHECK (ends_on >= starts_on),
    CONSTRAINT academic_year_label_valid CHECK (year_label ~ '^[0-9]{4}([/-][0-9]{4})?$')
);

CREATE UNIQUE INDEX one_active_academic_year
  ON cornhill_school.academic_years ((status))
  WHERE status = 'Active';

CREATE TABLE cornhill_school.academic_terms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL REFERENCES cornhill_school.academic_years(id) ON DELETE RESTRICT,
    term_number smallint NOT NULL CHECK (term_number BETWEEN 1 AND 3),
    term_name text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    status text NOT NULL DEFAULT 'Planned'
      CHECK (status IN ('Planned', 'Active', 'Completed', 'Archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT term_dates_valid CHECK (ends_on >= starts_on),
    UNIQUE (academic_year_id, term_number),
    UNIQUE (id, academic_year_id)
);

CREATE UNIQUE INDEX one_active_term_per_year
  ON cornhill_school.academic_terms (academic_year_id)
  WHERE status = 'Active';

CREATE TABLE cornhill_school.subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_code text NOT NULL UNIQUE,
    subject_name text NOT NULL,
    subject_group text NOT NULL
      CHECK (subject_group IN ('Nursery', 'Lower Primary', 'Upper Primary')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT subject_code_valid CHECK (subject_code ~ '^[A-Z0-9_]{2,32}$'),
    CONSTRAINT subject_name_valid CHECK (length(trim(subject_name)) BETWEEN 2 AND 80)
);

INSERT INTO cornhill_school.subjects (subject_code, subject_name, subject_group) VALUES
 ('NUMBERS', 'Numbers', 'Nursery'),
 ('LANGUAGE_DEV', 'Language Development', 'Nursery'),
 ('READING', 'Reading', 'Nursery'),
 ('HEALTH_HABITS', 'Health Habits', 'Nursery'),
 ('SOCIAL_DEV', 'Social Development', 'Nursery'),
 ('WRITING', 'Writing', 'Nursery'),
 ('DRAWING', 'Drawing', 'Nursery'),
 ('ENGLISH', 'English', 'Lower Primary'),
 ('MATHEMATICS', 'Mathematics', 'Lower Primary'),
 ('LITERACY_I', 'Literacy I', 'Lower Primary'),
 ('LITERACY_II', 'Literacy II', 'Lower Primary'),
 ('LOCAL_LANGUAGE', 'Local Language', 'Lower Primary'),
 ('RELIGIOUS_ED', 'Religious Education', 'Lower Primary'),
 ('SCIENCE', 'Science', 'Upper Primary'),
 ('SOCIAL_STUDIES', 'Social Studies', 'Upper Primary')
ON CONFLICT (subject_code) DO NOTHING;

CREATE TABLE cornhill_school.class_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id uuid NOT NULL REFERENCES cornhill_school.classes(id) ON DELETE RESTRICT,
    subject_id uuid NOT NULL REFERENCES cornhill_school.subjects(id) ON DELETE RESTRICT,
    display_order smallint NOT NULL CHECK (display_order BETWEEN 1 AND 20),
    is_compulsory boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    UNIQUE (class_id, subject_id),
    UNIQUE (class_id, subject_id, id)
);

INSERT INTO cornhill_school.class_subjects (class_id, subject_id, display_order)
SELECT c.id, s.id, mapping.display_order
FROM (VALUES
 ('BABY','NUMBERS',1),('BABY','LANGUAGE_DEV',2),('BABY','READING',3),('BABY','HEALTH_HABITS',4),('BABY','SOCIAL_DEV',5),('BABY','WRITING',6),('BABY','DRAWING',7),
 ('MIDDLE','NUMBERS',1),('MIDDLE','LANGUAGE_DEV',2),('MIDDLE','READING',3),('MIDDLE','HEALTH_HABITS',4),('MIDDLE','SOCIAL_DEV',5),('MIDDLE','WRITING',6),('MIDDLE','DRAWING',7),
 ('TOP','NUMBERS',1),('TOP','LANGUAGE_DEV',2),('TOP','READING',3),('TOP','HEALTH_HABITS',4),('TOP','SOCIAL_DEV',5),('TOP','WRITING',6),('TOP','DRAWING',7),
 ('P1','ENGLISH',1),('P1','MATHEMATICS',2),('P1','LITERACY_I',3),('P1','LITERACY_II',4),('P1','LOCAL_LANGUAGE',5),('P1','RELIGIOUS_ED',6),
 ('P2','ENGLISH',1),('P2','MATHEMATICS',2),('P2','LITERACY_I',3),('P2','LITERACY_II',4),('P2','LOCAL_LANGUAGE',5),('P2','RELIGIOUS_ED',6),
 ('P3','ENGLISH',1),('P3','MATHEMATICS',2),('P3','LITERACY_I',3),('P3','LITERACY_II',4),('P3','LOCAL_LANGUAGE',5),('P3','RELIGIOUS_ED',6),
 ('P4','ENGLISH',1),('P4','MATHEMATICS',2),('P4','SCIENCE',3),('P4','SOCIAL_STUDIES',4),
 ('P5','ENGLISH',1),('P5','MATHEMATICS',2),('P5','SCIENCE',3),('P5','SOCIAL_STUDIES',4),
 ('P6','ENGLISH',1),('P6','MATHEMATICS',2),('P6','SCIENCE',3),('P6','SOCIAL_STUDIES',4),
 ('P7','ENGLISH',1),('P7','MATHEMATICS',2),('P7','SCIENCE',3),('P7','SOCIAL_STUDIES',4)
) AS mapping(class_code, subject_code, display_order)
JOIN cornhill_school.classes c ON c.class_code = mapping.class_code
JOIN cornhill_school.subjects s ON s.subject_code = mapping.subject_code
ON CONFLICT (class_id, subject_id) DO NOTHING;

CREATE TABLE cornhill_school.assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_term_id uuid NOT NULL REFERENCES cornhill_school.academic_terms(id) ON DELETE RESTRICT,
    class_id uuid NOT NULL REFERENCES cornhill_school.classes(id) ON DELETE RESTRICT,
    assessment_name text NOT NULL,
    assessment_type text NOT NULL
      CHECK (assessment_type IN ('Beginning of Term', 'Mid Term', 'End of Term', 'Continuous Assessment', 'Mock', 'Practice')),
    assessment_date date,
    max_score numeric(7,2) NOT NULL DEFAULT 100 CHECK (max_score > 0 AND max_score <= 10000),
    status text NOT NULL DEFAULT 'Draft'
      CHECK (status IN ('Draft', 'Open', 'Locked', 'Published', 'Archived')),
    created_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    locked_at timestamptz,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT assessment_name_valid CHECK (length(trim(assessment_name)) BETWEEN 2 AND 100),
    UNIQUE (id, class_id)
);

CREATE TABLE cornhill_school.learner_marks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id uuid NOT NULL,
    learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
    class_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    score numeric(7,2) NOT NULL CHECK (score >= 0),
    max_score numeric(7,2) NOT NULL CHECK (max_score > 0 AND score <= max_score),
    teacher_comment text CHECK (teacher_comment IS NULL OR length(teacher_comment) <= 600),
    entered_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    updated_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    entered_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mark_assessment_class_fk FOREIGN KEY (assessment_id, class_id)
      REFERENCES cornhill_school.assessments(id, class_id) ON DELETE RESTRICT,
    CONSTRAINT mark_class_subject_fk FOREIGN KEY (class_id, subject_id)
      REFERENCES cornhill_school.class_subjects(class_id, subject_id) ON DELETE RESTRICT,
    UNIQUE (assessment_id, learner_id, subject_id)
);

CREATE INDEX assessments_term_class_idx
  ON cornhill_school.assessments (academic_term_id, class_id, status);
CREATE INDEX learner_marks_learner_idx
  ON cornhill_school.learner_marks (learner_id, assessment_id);
CREATE INDEX learner_marks_class_subject_idx
  ON cornhill_school.learner_marks (class_id, subject_id, assessment_id);

INSERT INTO cornhill_auth.permission_catalog (permission_code, category, description, high_risk)
VALUES
 ('academics.terms_manage', 'academics', 'Create and manage academic years and terms.', true),
 ('academics.subjects_manage', 'academics', 'Manage class subject assignments.', true),
 ('academics.assessments_manage', 'academics', 'Create, open, lock and publish assessments.', true),
 ('academics.marks_enter', 'academics', 'Enter and update marks for assigned classes and subjects.', false),
 ('academics.results_view', 'academics', 'View authorised learner assessment results.', false)
ON CONFLICT (permission_code) DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM PUBLIC;

COMMIT;
