-- Work Area 6: protect private staff messaging records.
-- The recipient only needs to mark a direct message as read; they must not be
-- able to edit the sender, recipient, body, or creation timestamp.

REVOKE ALL PRIVILEGES ON TABLE public.staff_direct_messages,
  public.staff_media_messages,
  public.staff_call_signals
FROM anon;

REVOKE UPDATE ON TABLE public.staff_direct_messages FROM authenticated;
GRANT UPDATE (read_at) ON TABLE public.staff_direct_messages TO authenticated;
