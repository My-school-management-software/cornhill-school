-- CORNHILL least-privilege defaults for application migrations run as postgres.
-- New public tables, sequences and RPCs must be explicitly granted to client roles
-- only after RLS and role-specific authorization have been created and reviewed.
-- This changes future-object defaults only; existing application grants are untouched.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
