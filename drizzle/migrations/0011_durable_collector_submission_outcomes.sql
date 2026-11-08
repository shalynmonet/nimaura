ALTER TABLE public.nimiq_payment_quotes ADD COLUMN submission_outcome text NOT NULL DEFAULT 'not_requested' CHECK (submission_outcome IN ('not_requested','awaiting_wallet','cancelled','rejected','unknown','hash_received')), ADD COLUMN candidate_tx_hash text CHECK (candidate_tx_hash IS NULL OR candidate_tx_hash ~ '^[a-f0-9]{64}$'), ADD COLUMN submission_started_at timestamptz, ADD COLUMN submission_detail text;
UPDATE public.nimiq_payment_quotes SET submission_outcome=CASE WHEN tx_hash IS NOT NULL THEN 'hash_received' ELSE 'unknown' END, candidate_tx_hash=tx_hash WHERE status IN ('pending','verified','fulfilled');
COMMENT ON COLUMN public.nimiq_payment_quotes.candidate_tx_hash IS 'Untrusted wallet/history candidate only. Never authorizes fulfillment; tx_hash remains finalized verified evidence.';
CREATE OR REPLACE FUNCTION public.record_collector_submission(_id uuid,_user_id uuid,_outcome text,_hash text DEFAULT NULL,_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.nimiq_payment_quotes%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network <> 'testnet' THEN RAISE EXCEPTION 'Purchase not found'; END IF;
 IF _outcome IS NULL OR _outcome NOT IN ('awaiting_wallet','cancelled','rejected','unknown','hash_received') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 IF q.status='fulfilled' THEN RETURN; END IF;
 IF q.status <> 'pending' THEN RAISE EXCEPTION 'Purchase not started'; END IF;
 IF _outcome='hash_received' THEN
  IF _hash IS NULL OR _hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid candidate hash'; END IF;
  IF q.candidate_tx_hash IS NOT NULL AND q.candidate_tx_hash <> _hash THEN RAISE EXCEPTION 'Different candidate requires reconciliation'; END IF;
  UPDATE public.nimiq_payment_quotes SET candidate_tx_hash=_hash,submission_outcome='hash_received',submission_detail=NULL WHERE id=q.id;
 ELSIF q.candidate_tx_hash IS NULL AND q.submission_outcome NOT IN ('cancelled','rejected') THEN
  UPDATE public.nimiq_payment_quotes SET submission_outcome=_outcome,submission_detail=left(_detail,240) WHERE id=q.id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_collector_submission(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_collector_submission(uuid,uuid,text,text,text) TO service_role;
GRANT ALL ON public.nimiq_payment_quotes TO service_role;