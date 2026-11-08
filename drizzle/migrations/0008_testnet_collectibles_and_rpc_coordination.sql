ALTER TABLE public.manifestations DROP CONSTRAINT manifestations_source_check;
ALTER TABLE public.manifestations ADD CONSTRAINT manifestations_source_check CHECK(source IN ('complimentary','paid','simulated','testnet'));
ALTER TABLE public.manifestations ADD COLUMN testnet_quote_id uuid REFERENCES public.nimiq_payment_quotes(id);
CREATE UNIQUE INDEX manifestations_testnet_quote_unique ON public.manifestations(testnet_quote_id) WHERE testnet_quote_id IS NOT NULL;
ALTER TABLE public.manifestations ADD CONSTRAINT testnet_manifestation_isolation CHECK ((source='testnet' AND testnet_quote_id IS NOT NULL AND payment_id IS NULL) OR (source<>'testnet' AND testnet_quote_id IS NULL));
CREATE TABLE public.nimiq_rpc_coordination (key text PRIMARY KEY, next_at timestamptz NOT NULL DEFAULT now(), payload jsonb, expires_at timestamptz, lease_token uuid, lease_until timestamptz);
REVOKE ALL ON public.nimiq_rpc_coordination FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.nimiq_rpc_coordination TO service_role;
ALTER TABLE public.nimiq_rpc_coordination ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.reserve_nimiq_rpc_slot(_key text,_cost integer) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE slot timestamptz; BEGIN
 IF _key IS NULL OR _cost IS NULL OR _cost<1 OR _cost>20 THEN RAISE EXCEPTION 'Invalid RPC budget'; END IF;
 INSERT INTO public.nimiq_rpc_coordination(key) VALUES(_key) ON CONFLICT DO NOTHING;
 SELECT greatest(next_at,clock_timestamp()) INTO slot FROM public.nimiq_rpc_coordination WHERE key=_key FOR UPDATE;
 UPDATE public.nimiq_rpc_coordination SET next_at=slot+make_interval(secs=>_cost*0.75) WHERE key=_key; RETURN slot;
END $$;
CREATE FUNCTION public.claim_nimiq_rpc_cache(_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE token uuid:=gen_random_uuid(); BEGIN
 IF _key IS NULL THEN RAISE EXCEPTION 'RPC key required'; END IF;
 INSERT INTO public.nimiq_rpc_coordination(key) VALUES(_key) ON CONFLICT DO NOTHING;
 UPDATE public.nimiq_rpc_coordination SET lease_token=token,lease_until=clock_timestamp()+interval '15 seconds' WHERE key=_key AND (lease_until IS NULL OR lease_until<clock_timestamp()) AND (expires_at IS NULL OR expires_at<clock_timestamp());
 IF NOT FOUND THEN RETURN NULL; END IF; RETURN token;
END $$;
REVOKE ALL ON FUNCTION public.reserve_nimiq_rpc_slot(text,integer),public.claim_nimiq_rpc_cache(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_nimiq_rpc_slot(text,integer),public.claim_nimiq_rpc_cache(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fulfill_testnet_payment(_id uuid,_user_id uuid,_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE q public.nimiq_payment_quotes; pid uuid; mid uuid; eid uuid; BEGIN
 IF _id IS NULL OR _user_id IS NULL OR _hash IS NULL OR lower(_hash) !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network<>'testnet' THEN RAISE EXCEPTION 'Testnet payment required'; END IF;
 IF q.tx_hash IS DISTINCT FROM lower(_hash) THEN RAISE EXCEPTION 'Payment replay hash mismatch'; END IF;
 IF q.status='fulfilled' THEN
  SELECT id INTO pid FROM public.testnet_payouts WHERE payment_quote_id=q.id;
  IF pid IS NULL OR q.manifestation_id IS NULL THEN RAISE EXCEPTION 'Missing testnet fulfillment'; END IF; RETURN q.manifestation_id;
 END IF;
 IF q.status<>'pending' OR q.reserve_address_snapshot IS NULL OR q.amount_luna>9007199254740991 OR q.savings_luna<=0 OR q.savings_luna*2<>q.amount_luna THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 SELECT entity_id INTO eid FROM public.daily_drops WHERE id=q.drop_id;
 INSERT INTO public.manifestations(user_id,drop_id,entity_id,intention,seed,config,source,testnet_quote_id) VALUES(q.user_id,q.drop_id,eid,q.intention,q.seed,q.config,'testnet',q.id) RETURNING id INTO mid;
 INSERT INTO public.testnet_payouts(payment_quote_id,user_id,treasury_sender,reserve_destination,amount_luna,reference) VALUES(q.id,q.user_id,q.recipient,q.reserve_address_snapshot,q.savings_luna,'NIMAURA:'||q.id::text) RETURNING id INTO pid;
 UPDATE public.nimiq_payment_quotes SET status='fulfilled',verified_at=now(),manifestation_id=mid WHERE id=q.id; RETURN mid;
END $$;
REVOKE ALL ON FUNCTION public.fulfill_testnet_payment(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_testnet_payment(uuid,uuid,text) TO service_role;