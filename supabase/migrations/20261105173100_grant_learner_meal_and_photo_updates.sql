-- Allow the admission form to save the learner's selected meals.
grant insert (takes_breakfast, takes_lunch) on public.students to authenticated;
grant update (takes_breakfast, takes_lunch, photo_path) on public.students to authenticated;