CREATE OR REPLACE FUNCTION public.release_unmatched_collector_purchase(_id uuid,_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.nimiq_payment_quotes%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network <> 'testnet' THEN RAISE EXCEPTION 'Purchase not found'; END IF;
 IF q.status <> 'pending' OR q.tx_hash IS NOT NULL OR q.candidate_tx_hash IS NOT NULL OR q.manifestation_id IS NOT NULL THEN RAISE EXCEPTION 'Purchase has evidence or is not unresolved'; END IF;
 IF q.expires_at >= now() THEN RAISE EXCEPTION 'Quote window still open'; END IF;
 UPDATE public.nimiq_payment_quotes SET status='failed', submission_detail='Released by collector after the validity window closed with no matching transfer in receiving history.' WHERE id=q.id;
END $$;
REVOKE ALL ON FUNCTION public.release_unmatched_collector_purchase(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_unmatched_collector_purchase(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_collector_submission(_id uuid,_user_id uuid,_outcome text,_hash text DEFAULT NULL,_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.nimiq_payment_quotes%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network <> 'testnet' THEN RAISE EXCEPTION 'Purchase not found'; END IF;
 IF _outcome IS NULL OR _outcome NOT IN ('awaiting_wallet','cancelled','rejected','unknown','hash_received') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 IF q.status='fulfilled' THEN RETURN; END IF;
 IF q.status='failed' AND q.submission_started_at IS NOT NULL OR q.status='failed' AND q.submission_outcome <> 'not_requested' THEN
  -- A released purchase keeps any late wallet hash as untrusted evidence for operator reconciliation.
  IF _outcome='hash_received' AND _hash ~ '^[a-f0-9]{64}$' AND q.candidate_tx_hash IS NULL THEN
   UPDATE public.nimiq_payment_quotes SET candidate_tx_hash=_hash, submission_outcome='hash_received', submission_detail='Late wallet hash after release; reconciliation required. Do not pay again.' WHERE id=q.id;
  END IF;
  RETURN;
 END IF;
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