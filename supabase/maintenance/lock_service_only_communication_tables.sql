-- Applied to Supabase as migration lock_service_only_communication_tables.
-- Kept here as an auditable SQL record; the remote migration version still needs confirmation.
revoke all privileges on table
  public.communication_delivery_events,
  public.communication_provider_settings
from anon, authenticated;
