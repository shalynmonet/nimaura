CREATE OR REPLACE FUNCTION public.accept_testnet_hub_result(_id uuid,_user uuid,_key text,_hash text,_bytes text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.testnet_hub_requests; p public.testnet_payouts;
BEGIN
 SELECT * INTO r FROM public.testnet_hub_requests WHERE id=_id AND user_id=_user FOR UPDATE;
 IF NOT FOUND OR r.consumed_at IS NOT NULL OR r.expires_at<=now() THEN RAISE EXCEPTION 'Hub state expired, consumed or unavailable'; END IF;
 IF r.kind='ownership' THEN
  IF _key IS NULL OR _key !~ '^[a-f0-9]{64}$' OR coalesce(_hash,'')<>'' OR coalesce(_bytes,'')<>'' THEN RAISE EXCEPTION 'Ownership result required'; END IF;
  PERFORM public.consume_nimiq_wallet_challenge(r.challenge_id,_user,_key);
 ELSE
  IF NOT public.has_role(_user,'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT * INTO p FROM public.testnet_payouts WHERE id=r.payout_id FOR UPDATE;
  IF p.status IS DISTINCT FROM 'uncertain' OR p.network IS DISTINCT FROM 'testnet' OR p.claimed_by IS DISTINCT FROM _user OR p.expires_at<=now() OR p.tx_hash IS NOT NULL THEN RAISE EXCEPTION 'Live original claim required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nimiq_wallet_links WHERE user_id=_user AND address=p.treasury_sender AND network='testnet') THEN RAISE EXCEPTION 'Treasury proof required'; END IF;
  IF _hash IS NULL OR _hash !~ '^[a-f0-9]{64}$' OR _bytes IS NULL OR _bytes='' THEN RAISE EXCEPTION 'Signed result required'; END IF;
  INSERT INTO public.testnet_hub_signed_payouts(payout_id,request_id,tx_hash,signed_bytes) VALUES(p.id,r.id,_hash,_bytes);
  UPDATE public.testnet_payouts SET tx_hash=_hash WHERE id=p.id;
 END IF;
 UPDATE public.testnet_hub_requests SET consumed_at=now() WHERE id=r.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.accept_testnet_hub_result(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_testnet_hub_result(uuid,uuid,text,text,text) TO service_role;