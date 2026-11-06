-- Balance views are security-invoker views. The parent portal reads learner balances
-- through the authenticated, phone-verified parent_portal_get_learner RPC.
-- Anonymous clients must not have direct privileges on these financial views.
revoke all privileges on table
  public.learner_account_balances,
  public.learner_enrolment_period_balances
from anon;
