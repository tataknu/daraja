CREATE OR REPLACE FUNCTION public.reset_demo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  TRUNCATE public.decisions, public.feedback, public.pending_prompts, public.reminders_sent, public.messages, public.bookings RESTART IDENTITY CASCADE;
  ALTER SEQUENCE public.bookings_id_seq RESTART WITH 14;
  DELETE FROM public.contacts WHERE role = 'guest';
  INSERT INTO public.contacts (role, name, email, language) VALUES ('guest','Anna Becker','anna@example.de','de');
END $$;
REVOKE ALL ON FUNCTION public.reset_demo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo() TO service_role;