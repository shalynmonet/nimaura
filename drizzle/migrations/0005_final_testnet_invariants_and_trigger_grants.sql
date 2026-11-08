REVOKE EXECUTE ON FUNCTION public.handle_new_collector() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_collector() TO service_role;
ALTER TABLE public.testnet_payouts VALIDATE CONSTRAINT testnet_claim_complete;
ALTER TABLE public.testnet_payouts VALIDATE CONSTRAINT testnet_paid_evidence;
CREATE OR REPLACE FUNCTION public.fulfill_testnet_payment(_id uuid,_user_id uuid,_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE q public.nimiq_payment_quotes; pid uuid; nid uuid:=gen_random_uuid(); BEGIN
 IF _id IS NULL OR _user_id IS NULL OR _hash IS NULL OR lower(_hash) !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network<>'testnet' THEN RAISE EXCEPTION 'Testnet payment required'; END IF;
 IF q.tx_hash IS DISTINCT FROM lower(_hash) THEN RAISE EXCEPTION 'Payment replay hash mismatch'; END IF;
 IF q.status='fulfilled' THEN SELECT id INTO pid FROM public.testnet_payouts WHERE payment_quote_id=q.id; IF pid IS NULL THEN RAISE EXCEPTION 'Missing testnet fulfillment'; END IF; RETURN pid; END IF;
 IF q.status<>'pending' OR q.reserve_address_snapshot IS NULL OR q.amount_luna>9007199254740991 OR q.savings_luna<=0 OR q.savings_luna*2<>q.amount_luna THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 INSERT INTO public.testnet_payouts(id,payment_quote_id,user_id,treasury_sender,reserve_destination,amount_luna,reference) VALUES(nid,q.id,q.user_id,q.recipient,q.reserve_address_snapshot,q.savings_luna,'NIMAURA:'||nid::text) RETURNING id INTO pid;
 UPDATE public.nimiq_payment_quotes SET status='fulfilled',verified_at=now() WHERE id=q.id; RETURN pid; END $$;