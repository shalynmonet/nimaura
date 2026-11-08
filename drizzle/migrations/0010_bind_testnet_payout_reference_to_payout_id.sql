CREATE OR REPLACE FUNCTION public.fulfill_testnet_payment(_id uuid,_user_id uuid,_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE q public.nimiq_payment_quotes; pid uuid:=gen_random_uuid(); mid uuid; eid uuid; BEGIN
 IF _id IS NULL OR _user_id IS NULL OR _hash IS NULL OR lower(_hash) !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network<>'testnet' THEN RAISE EXCEPTION 'Testnet payment required'; END IF;
 IF q.tx_hash IS DISTINCT FROM lower(_hash) THEN RAISE EXCEPTION 'Payment replay hash mismatch'; END IF;
 IF q.status='fulfilled' THEN
  IF q.manifestation_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.testnet_payouts WHERE payment_quote_id=q.id) THEN RAISE EXCEPTION 'Missing testnet fulfillment'; END IF; RETURN q.manifestation_id;
 END IF;
 IF q.status<>'pending' OR q.reserve_address_snapshot IS NULL OR q.amount_luna>9007199254740991 OR q.savings_luna<=0 OR q.savings_luna*2<>q.amount_luna THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 SELECT entity_id INTO eid FROM public.daily_drops WHERE id=q.drop_id;
 INSERT INTO public.manifestations(user_id,drop_id,entity_id,intention,seed,config,source,testnet_quote_id) VALUES(q.user_id,q.drop_id,eid,q.intention,q.seed,q.config,'testnet',q.id) RETURNING id INTO mid;
 INSERT INTO public.testnet_payouts(id,payment_quote_id,user_id,treasury_sender,reserve_destination,amount_luna,reference) VALUES(pid,q.id,q.user_id,q.recipient,q.reserve_address_snapshot,q.savings_luna,'NIMAURA:'||pid::text);
 UPDATE public.nimiq_payment_quotes SET status='fulfilled',verified_at=now(),manifestation_id=mid WHERE id=q.id; RETURN mid;
END $$;
REVOKE ALL ON FUNCTION public.fulfill_testnet_payment(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_testnet_payment(uuid,uuid,text) TO service_role;