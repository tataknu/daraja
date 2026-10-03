-- Review insights: each review broken into points (what visitors loved or wished were different)
-- and ideas (what to build next), plus the reports built from them.
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS points jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ideas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'guest';

CREATE TABLE IF NOT EXISTS public.insight_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  review_count int NOT NULL,
  report jsonb NOT NULL,
  sms_lines text[] NOT NULL DEFAULT '{}'
);

-- Referrals: a code for each happy guest, and which booking a code brought in.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

-- AI usage: one row per model call, for cost and latency per message and per booking.
CREATE TABLE IF NOT EXISTS public.ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  booking_id int REFERENCES public.bookings(id) ON DELETE SET NULL,
  task text NOT NULL,
  model text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  cached_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  reasoning_tokens int NOT NULL DEFAULT 0,
  latency_ms int NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['insight_reports','ai_calls'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Simulator read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Simulator read" ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
  END LOOP;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.insight_reports, public.ai_calls;

CREATE OR REPLACE FUNCTION public.reset_demo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  TRUNCATE public.ai_calls, public.insight_reports, public.decisions, public.feedback,
    public.pending_prompts, public.reminders_sent, public.messages, public.bookings
    RESTART IDENTITY CASCADE;
  ALTER SEQUENCE public.bookings_id_seq RESTART WITH 14;
  DELETE FROM public.contacts WHERE role = 'guest';
  INSERT INTO public.contacts (role, name, email, language) VALUES ('guest','Anna Becker','anna@example.de','de');
END $$;
REVOKE ALL ON FUNCTION public.reset_demo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo() TO service_role;
