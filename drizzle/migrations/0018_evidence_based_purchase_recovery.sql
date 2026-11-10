CREATE OR REPLACE FUNCTION public.record_collector_submission(_id uuid, _user_id uuid, _outcome text, _hash text DEFAULT NULL::text, _detail text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE q public.nimiq_payment_quotes%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network NOT IN ('testnet','mainnet') THEN RAISE EXCEPTION 'Purchase not found'; END IF;
 IF _outcome IS NULL OR _outcome NOT IN ('awaiting_wallet','cancelled','rejected','unknown','hash_received') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 IF q.status='fulfilled' THEN RETURN; END IF;
 IF q.status='failed' AND q.submission_started_at IS NOT NULL OR q.status='failed' AND q.submission_outcome <> 'not_requested' THEN
  IF _outcome='hash_received' AND _hash ~ '^[a-f0-9]{64}$' AND q.candidate_tx_hash IS NULL THEN
   UPDATE public.nimiq_payment_quotes SET candidate_tx_hash=_hash, submission_outcome='hash_received', submission_detail='Late wallet hash after closing; checking it. Do not pay again.' WHERE id=q.id;
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
END $function$;

CREATE OR REPLACE FUNCTION public.release_unmatched_collector_purchase(_id uuid,_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.nimiq_payment_quotes%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network NOT IN ('testnet','mainnet') THEN RAISE EXCEPTION 'Purchase not found'; END IF;
 IF q.status <> 'pending' OR q.tx_hash IS NOT NULL OR q.candidate_tx_hash IS NOT NULL OR q.manifestation_id IS NOT NULL THEN RAISE EXCEPTION 'Purchase has evidence or is not unresolved'; END IF;
 IF q.expires_at >= now() THEN RAISE EXCEPTION 'Quote window still open'; END IF;
 UPDATE public.nimiq_payment_quotes SET status='failed', submission_detail='Closed after the network validity window ended with no matching transfer in complete receiving history. A late verified payment is still honored.' WHERE id=q.id;
END $$;
REVOKE ALL ON FUNCTION public.release_unmatched_collector_purchase(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_unmatched_collector_purchase(uuid,uuid) TO service_role;

-- Explicit wallet cancellation/rejection with no hash: closable once complete history shows no matching transfer.
CREATE OR REPLACE FUNCTION public.close_cancelled_collector_purchase(_id uuid,_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.nimiq_payment_quotes%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
 IF q.status <> 'pending' OR q.submission_outcome NOT IN ('cancelled','rejected') OR q.tx_hash IS NOT NULL OR q.candidate_tx_hash IS NOT NULL OR q.manifestation_id IS NOT NULL THEN RAISE EXCEPTION 'Only a cancelled purchase without payment evidence can close'; END IF;
 UPDATE public.nimiq_payment_quotes SET status='failed', submission_detail='Closed after wallet cancellation with no matching transfer. A late verified payment is still honored.' WHERE id=q.id;
END $$;
REVOKE ALL ON FUNCTION public.close_cancelled_collector_purchase(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_cancelled_collector_purchase(uuid,uuid) TO service_role;

-- Late recovery: pins a finalized-verified hash on a closed quote; fulfillment then issues exactly once.
CREATE OR REPLACE FUNCTION public.pin_late_payment(_id uuid,_user_id uuid,_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.nimiq_payment_quotes%ROWTYPE;
BEGIN
 IF _hash IS NULL OR lower(_hash) !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid hash'; END IF;
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.status <> 'failed' OR q.manifestation_id IS NOT NULL THEN RAISE EXCEPTION 'Closed purchase required'; END IF;
 IF q.tx_hash IS NOT NULL THEN IF q.tx_hash = lower(_hash) THEN RETURN; END IF; RAISE EXCEPTION 'Different transaction assigned'; END IF;
 UPDATE public.nimiq_payment_quotes SET tx_hash=lower(_hash), submission_detail='Late payment verified; issuing collectible.' WHERE id=q.id;
END $$;
REVOKE ALL ON FUNCTION public.pin_late_payment(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pin_late_payment(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fulfill_mainnet_payment(_id uuid,_user_id uuid,_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE q public.nimiq_payment_quotes; pid uuid:=gen_random_uuid(); mid uuid; eid uuid; BEGIN
 IF _id IS NULL OR _user_id IS NULL OR _hash IS NULL OR lower(_hash) !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Bound verified mainnet payment required'; END IF;
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network<>'mainnet' THEN RAISE EXCEPTION 'Mainnet payment required'; END IF;
 IF q.tx_hash IS DISTINCT FROM lower(_hash) THEN RAISE EXCEPTION 'Payment replay hash mismatch'; END IF;
 IF q.status='fulfilled' THEN
  IF q.manifestation_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.mainnet_payouts WHERE payment_quote_id=q.id) THEN RAISE EXCEPTION 'Missing mainnet fulfillment'; END IF; RETURN q.manifestation_id;
 END IF;
 IF q.status NOT IN ('pending','failed') OR q.reserve_address_snapshot IS NULL OR q.amount_luna>9007199254740991 OR q.savings_luna<=0 OR q.savings_luna*2<>q.amount_luna THEN RAISE EXCEPTION 'Bound verified mainnet payment required'; END IF;
 SELECT entity_id INTO eid FROM public.daily_drops WHERE id=q.drop_id;
 INSERT INTO public.manifestations(user_id,drop_id,entity_id,intention,seed,config,source,mainnet_quote_id) VALUES(q.user_id,q.drop_id,eid,q.intention,q.seed,q.config,'paid',q.id) RETURNING id INTO mid;
 INSERT INTO public.mainnet_payouts(id,payment_quote_id,user_id,treasury_sender,reserve_destination,amount_luna,reference) VALUES(pid,q.id,q.user_id,q.recipient,q.reserve_address_snapshot,q.savings_luna,'NIMAURA:'||pid::text);
 UPDATE public.nimiq_payment_quotes SET status='fulfilled',verified_at=now(),manifestation_id=mid WHERE id=q.id; RETURN mid;
END $$;
REVOKE ALL ON FUNCTION public.fulfill_mainnet_payment(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_mainnet_payment(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fulfill_testnet_payment(_id uuid,_user_id uuid,_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE q public.nimiq_payment_quotes; pid uuid:=gen_random_uuid(); mid uuid; eid uuid; BEGIN
 IF _id IS NULL OR _user_id IS NULL OR _hash IS NULL OR lower(_hash) !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network<>'testnet' THEN RAISE EXCEPTION 'Testnet payment required'; END IF;
 IF q.tx_hash IS DISTINCT FROM lower(_hash) THEN RAISE EXCEPTION 'Payment replay hash mismatch'; END IF;
 IF q.status='fulfilled' THEN
  IF q.manifestation_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.testnet_payouts WHERE payment_quote_id=q.id) THEN RAISE EXCEPTION 'Missing testnet fulfillment'; END IF; RETURN q.manifestation_id;
 END IF;
 IF q.status NOT IN ('pending','failed') OR q.reserve_address_snapshot IS NULL OR q.amount_luna>9007199254740991 OR q.savings_luna<=0 OR q.savings_luna*2<>q.amount_luna THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 SELECT entity_id INTO eid FROM public.daily_drops WHERE id=q.drop_id;
 INSERT INTO public.manifestations(user_id,drop_id,entity_id,intention,seed,config,source,testnet_quote_id) VALUES(q.user_id,q.drop_id,eid,q.intention,q.seed,q.config,'testnet',q.id) RETURNING id INTO mid;
 INSERT INTO public.testnet_payouts(id,payment_quote_id,user_id,treasury_sender,reserve_destination,amount_luna,reference) VALUES(pid,q.id,q.user_id,q.recipient,q.reserve_address_snapshot,q.savings_luna,'NIMAURA:'||pid::text);
 UPDATE public.nimiq_payment_quotes SET status='fulfilled',verified_at=now(),manifestation_id=mid WHERE id=q.id; RETURN mid;
END $$;
REVOKE ALL ON FUNCTION public.fulfill_testnet_payment(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_testnet_payment(uuid,uuid,text) TO service_role;