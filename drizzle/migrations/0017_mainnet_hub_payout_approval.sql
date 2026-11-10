ALTER TABLE public.mainnet_payouts ADD COLUMN claim_token uuid, ADD COLUMN validity_start_height bigint, ADD COLUMN expires_at timestamptz;
ALTER TABLE public.mainnet_payouts ADD CONSTRAINT mainnet_claim_complete CHECK(status='queued' OR (claimed_by IS NOT NULL AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND validity_start_height IS NOT NULL AND expires_at IS NOT NULL));
ALTER TABLE public.mainnet_payouts ADD CONSTRAINT mainnet_paid_evidence CHECK(status<>'paid' OR (tx_hash IS NOT NULL AND tx_hash ~ '^[a-f0-9]{64}$' AND verified_at IS NOT NULL));
CREATE TABLE public.mainnet_hub_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id), kind text NOT NULL CHECK(kind IN ('ownership','payout')), challenge_id uuid REFERENCES public.nimiq_wallet_challenges(id), payout_id uuid REFERENCES public.mainnet_payouts(id), expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK ((kind='ownership' AND challenge_id IS NOT NULL AND payout_id IS NULL) OR (kind='payout' AND payout_id IS NOT NULL AND challenge_id IS NULL)));
REVOKE ALL ON public.mainnet_hub_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.mainnet_hub_requests TO service_role;
ALTER TABLE public.mainnet_hub_requests ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX mainnet_hub_one_payout_request ON public.mainnet_hub_requests(payout_id) WHERE payout_id IS NOT NULL;
CREATE TABLE public.mainnet_hub_signed_payouts (payout_id uuid PRIMARY KEY REFERENCES public.mainnet_payouts(id), request_id uuid NOT NULL UNIQUE REFERENCES public.mainnet_hub_requests(id), tx_hash text NOT NULL UNIQUE CHECK(tx_hash ~ '^[a-f0-9]{64}$'), signed_bytes text NOT NULL CHECK(signed_bytes ~ '^[a-f0-9]+$' AND length(signed_bytes)<=4096 AND length(signed_bytes)%2=0), broadcast_attempted_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.mainnet_hub_signed_payouts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.mainnet_hub_signed_payouts TO service_role;
ALTER TABLE public.mainnet_hub_signed_payouts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.accept_mainnet_hub_result(_id uuid, _user uuid, _key text, _hash text, _bytes text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.mainnet_hub_requests; p public.mainnet_payouts;
BEGIN
 SELECT * INTO r FROM public.mainnet_hub_requests WHERE id=_id AND user_id=_user FOR UPDATE;
 IF NOT FOUND OR r.consumed_at IS NOT NULL OR r.expires_at<=now() THEN RAISE EXCEPTION 'Hub state expired, consumed or unavailable'; END IF;
 IF r.kind='ownership' THEN
  IF _key IS NULL OR _key !~ '^[a-f0-9]{64}$' OR coalesce(_hash,'')<>'' OR coalesce(_bytes,'')<>'' THEN RAISE EXCEPTION 'Ownership result required'; END IF;
  PERFORM public.consume_nimiq_wallet_challenge(r.challenge_id,_user,_key);
 ELSE
  IF NOT public.has_role(_user,'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT * INTO p FROM public.mainnet_payouts WHERE id=r.payout_id FOR UPDATE;
  IF p.status IS DISTINCT FROM 'uncertain' OR p.network IS DISTINCT FROM 'mainnet' OR p.claimed_by IS DISTINCT FROM _user OR p.expires_at<=now() OR p.tx_hash IS NOT NULL THEN RAISE EXCEPTION 'Live original claim required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nimiq_wallet_links WHERE user_id=_user AND address=p.treasury_sender AND network='mainnet') THEN RAISE EXCEPTION 'Treasury proof required'; END IF;
  IF _hash IS NULL OR _hash !~ '^[a-f0-9]{64}$' OR _bytes IS NULL OR _bytes='' THEN RAISE EXCEPTION 'Signed result required'; END IF;
  INSERT INTO public.mainnet_hub_signed_payouts(payout_id,request_id,tx_hash,signed_bytes) VALUES(p.id,r.id,_hash,_bytes);
  UPDATE public.mainnet_payouts SET tx_hash=_hash WHERE id=p.id;
 END IF;
 UPDATE public.mainnet_hub_requests SET consumed_at=now() WHERE id=r.id;
 RETURN true;
END $function$;
CREATE OR REPLACE FUNCTION public.claim_mainnet_payout(_id uuid, _operator uuid, _height bigint, _expires timestamp with time zone)
 RETURNS mainnet_payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE p public.mainnet_payouts; BEGIN IF _operator IS NULL OR NOT public.has_role(_operator,'admin') THEN RAISE EXCEPTION 'Admin required'; END IF; IF _id IS NULL OR _height IS NULL OR _expires IS NULL OR _height<0 OR _height>9007199254740991 OR _expires<=now() OR _expires>now()+interval '10 minutes' THEN RAISE EXCEPTION 'Invalid claim window'; END IF; UPDATE public.mainnet_payouts SET status='uncertain',claimed_by=_operator,claim_token=gen_random_uuid(),claimed_at=now(),validity_start_height=_height,expires_at=_expires WHERE id=_id AND status='queued' RETURNING * INTO p; IF NOT FOUND THEN RAISE EXCEPTION 'Already claimed; reconcile, never resend'; END IF; RETURN p; END $function$;
CREATE OR REPLACE FUNCTION public.complete_mainnet_payout(_id uuid, _operator uuid, _token uuid, _hash text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE p public.mainnet_payouts; BEGIN IF _operator IS NULL OR NOT public.has_role(_operator,'admin') THEN RAISE EXCEPTION 'Admin required'; END IF; IF _id IS NULL OR _token IS NULL OR _hash IS NULL OR lower(_hash) !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid completion evidence'; END IF; SELECT * INTO p FROM public.mainnet_payouts WHERE id=_id FOR UPDATE; IF NOT FOUND OR p.claimed_by IS DISTINCT FROM _operator OR p.claim_token IS DISTINCT FROM _token THEN RAISE EXCEPTION 'Claim mismatch'; END IF; IF p.status='paid' AND p.tx_hash=lower(_hash) THEN RETURN p.id; END IF; IF p.status<>'uncertain' OR (p.tx_hash IS NOT NULL AND p.tx_hash<>lower(_hash)) THEN RAISE EXCEPTION 'Payout mismatch'; END IF; UPDATE public.mainnet_payouts SET status='paid',tx_hash=lower(_hash),verified_at=now() WHERE id=p.id; RETURN p.id; END $function$;
CREATE OR REPLACE FUNCTION public.reopen_unbroadcast_mainnet_payout(_id uuid, _operator uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.mainnet_payouts;
BEGIN
  IF _operator IS NULL OR NOT public.has_role(_operator,'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT * INTO p FROM public.mainnet_payouts WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR p.network<>'mainnet' OR p.status<>'uncertain' OR p.tx_hash IS NOT NULL OR p.expires_at IS NULL OR p.expires_at>now() THEN RAISE EXCEPTION 'Not an expired unsigned claim'; END IF;
  IF EXISTS (SELECT 1 FROM public.mainnet_hub_signed_payouts WHERE payout_id=p.id) THEN RAISE EXCEPTION 'Signed bytes exist; reconcile, never reopen'; END IF;
  IF EXISTS (SELECT 1 FROM public.mainnet_hub_requests WHERE payout_id=p.id AND (consumed_at IS NOT NULL OR expires_at>now())) THEN RAISE EXCEPTION 'Wallet result used or still live'; END IF;
  DELETE FROM public.mainnet_hub_requests WHERE payout_id=p.id AND consumed_at IS NULL AND expires_at<=now();
  UPDATE public.mainnet_payouts SET status='queued',claimed_by=NULL,claim_token=NULL,claimed_at=NULL,validity_start_height=NULL,expires_at=NULL WHERE id=p.id;
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.claim_mainnet_payout(uuid,uuid,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mainnet_payout(uuid,uuid,bigint,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.complete_mainnet_payout(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mainnet_payout(uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.accept_mainnet_hub_result(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_mainnet_hub_result(uuid,uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.reopen_unbroadcast_mainnet_payout(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_unbroadcast_mainnet_payout(uuid,uuid) TO service_role;