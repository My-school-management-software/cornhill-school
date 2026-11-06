drop policy if exists "Admins manage scores" on public.assessment_scores;
drop policy if exists "Admins read all scores" on public.assessment_scores;
create policy "Admins read all scores"
on public.assessment_scores
for select
to authenticated
using (public.is_school_admin());
