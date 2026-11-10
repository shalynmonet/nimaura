CREATE TABLE public.collective_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment text NOT NULL DEFAULT 'nimiq',
  ordinal int NOT NULL,
  threshold int NOT NULL CHECK (threshold > 0),
  name text NOT NULL,
  designation text NOT NULL,
  symbolism text NOT NULL,
  reflection text NOT NULL,
  veiled_hint text NOT NULL,
  unlocked_at timestamptz,
  UNIQUE (deployment, threshold),
  UNIQUE (deployment, ordinal)
);
GRANT SELECT ON public.collective_milestones TO anon, authenticated;
GRANT ALL ON public.collective_milestones TO service_role;
ALTER TABLE public.collective_milestones ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.collective_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment text NOT NULL DEFAULT 'nimiq',
  manifestation_id uuid NOT NULL UNIQUE REFERENCES public.manifestations(id),
  user_id uuid NOT NULL,
  drop_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deployment, user_id, drop_id)
);
GRANT ALL ON public.collective_contributions TO service_role;
GRANT SELECT ON public.collective_contributions TO authenticated;
ALTER TABLE public.collective_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contributions" ON public.collective_contributions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Public view: locked milestones never expose name/reflection
CREATE OR REPLACE FUNCTION public.collective_state(_deployment text DEFAULT 'nimiq')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM collective_contributions WHERE deployment = _deployment),
    'milestones', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'ordinal', ordinal, 'threshold', threshold, 'unlocked_at', unlocked_at,
        'veiled_hint', veiled_hint,
        'name', CASE WHEN unlocked_at IS NOT NULL THEN name END,
        'designation', CASE WHEN unlocked_at IS NOT NULL THEN designation END,
        'symbolism', CASE WHEN unlocked_at IS NOT NULL THEN symbolism END,
        'reflection', CASE WHEN unlocked_at IS NOT NULL THEN reflection END
      ) ORDER BY ordinal) FROM collective_milestones WHERE deployment = _deployment), '[]'::jsonb)
  )
$$;
GRANT EXECUTE ON FUNCTION public.collective_state(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.collective_count(_manifestation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; total int;
BEGIN
  SELECT id, user_id, drop_id INTO m FROM manifestations WHERE id = _manifestation;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO collective_contributions (deployment, manifestation_id, user_id, drop_id)
  VALUES ('nimiq', m.id, m.user_id, m.drop_id) ON CONFLICT DO NOTHING;
  PERFORM pg_advisory_xact_lock(hashtext('collective:nimiq'));
  SELECT count(*) INTO total FROM collective_contributions WHERE deployment = 'nimiq';
  UPDATE collective_milestones SET unlocked_at = now()
   WHERE deployment = 'nimiq' AND unlocked_at IS NULL AND threshold <= total;
END $$;
REVOKE ALL ON FUNCTION public.collective_count(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.collective_on_redemption() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM collective_count(NEW.manifestation_id); RETURN NEW; END $$;
CREATE TRIGGER collective_redemption AFTER INSERT ON public.credit_redemptions
FOR EACH ROW EXECUTE FUNCTION public.collective_on_redemption();

CREATE OR REPLACE FUNCTION public.collective_on_quote() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'fulfilled' AND NEW.tx_hash IS NOT NULL AND NEW.verified_at IS NOT NULL
     AND NEW.manifestation_id IS NOT NULL THEN
    PERFORM collective_count(NEW.manifestation_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER collective_quote AFTER INSERT OR UPDATE OF status, manifestation_id ON public.nimiq_payment_quotes
FOR EACH ROW EXECUTE FUNCTION public.collective_on_quote();

INSERT INTO public.collective_milestones (ordinal, threshold, name, designation, symbolism, reflection, veiled_hint) VALUES
(1,100,'The Lantern Lattice','First Congregation','A hundred separate intentions meeting at one unbroken knot of light.','No thread chose the pattern; the pattern was what they became together.','A knot that waits for its hundredth thread.'),
(2,250,'Sealed','—','—','—','Something listens beneath a woven tide.'),
(3,500,'Sealed','—','—','—','A door that opens only from both sides.'),
(4,1000,'Sealed','—','—','—','A thousand embers asking one question.'),
(5,2500,'Sealed','—','—','—','A shape too wide to be seen at once.'),
(6,5000,'Sealed','—','—','—','The hush before a chorus.'),
(7,10000,'Sealed','—','—','—','The last seal does not break. It turns.');

-- Reliable backfill: credit redemptions and verified fulfilled paid quotes only
INSERT INTO public.collective_contributions (manifestation_id, user_id, drop_id, created_at)
SELECT DISTINCT ON (m.user_id, m.drop_id) m.id, m.user_id, m.drop_id, m.created_at
FROM public.manifestations m
WHERE EXISTS (SELECT 1 FROM public.credit_redemptions r WHERE r.manifestation_id = m.id)
   OR EXISTS (SELECT 1 FROM public.nimiq_payment_quotes q WHERE q.manifestation_id = m.id
              AND q.status = 'fulfilled' AND q.tx_hash IS NOT NULL AND q.verified_at IS NOT NULL)
ORDER BY m.user_id, m.drop_id, m.created_at
ON CONFLICT DO NOTHING;