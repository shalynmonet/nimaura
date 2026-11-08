-- Reconcile excessive live grants; RLS does not constrain TRUNCATE.
REVOKE ALL ON public.profiles, public.entities, public.daily_drops, public.manifestations, public.credit_redemptions, public.payment_attempts, public.savings_transfers, public.nimiq_wallet_challenges, public.nimiq_wallet_links, public.nimiq_payment_quotes FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (credits, reserve_address) ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles, public.entities, public.manifestations, public.credit_redemptions, public.payment_attempts, public.savings_transfers, public.nimiq_wallet_links, public.nimiq_payment_quotes TO authenticated;
GRANT UPDATE (display_name, savings_goal_nim, sound_enabled) ON public.profiles TO authenticated;
GRANT SELECT (id, number, clue, sigil, starts_at, ends_at) ON public.daily_drops TO anon, authenticated;
GRANT ALL ON public.profiles, public.entities, public.daily_drops, public.manifestations, public.credit_redemptions, public.payment_attempts, public.savings_transfers, public.nimiq_wallet_challenges, public.nimiq_wallet_links, public.nimiq_payment_quotes TO service_role;
CREATE TYPE public.app_role AS ENUM ('admin');
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id), role public.app_role NOT NULL, UNIQUE(user_id,role));
REVOKE ALL ON public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_roles ON public.user_roles FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated,service_role;
ALTER TABLE public.nimiq_payment_quotes ADD COLUMN reserve_address_snapshot text;
CREATE TABLE public.testnet_payouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_quote_id uuid NOT NULL UNIQUE REFERENCES public.nimiq_payment_quotes(id), user_id uuid NOT NULL REFERENCES public.profiles(id),
 network text NOT NULL DEFAULT 'testnet' CHECK(network='testnet'), treasury_sender text NOT NULL, reserve_destination text NOT NULL,
 amount_luna bigint NOT NULL CHECK(amount_luna>0 AND amount_luna<=9007199254740991),
 reference text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','uncertain','paid')),
 claimed_by uuid REFERENCES public.profiles(id), claim_token uuid, claimed_at timestamptz, validity_start_height bigint, expires_at timestamptz,
 tx_hash text UNIQUE, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(reference='NIMAURA:'||id::text)
);
REVOKE ALL ON public.testnet_payouts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.testnet_payouts TO authenticated;
GRANT ALL ON public.testnet_payouts TO service_role;
ALTER TABLE public.testnet_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY testnet_payout_read ON public.testnet_payouts FOR SELECT TO authenticated USING(auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
-- Testnet fulfillment issues no production collectible and never touches the real savings ledger.
CREATE FUNCTION public.fulfill_testnet_payment(_id uuid,_user_id uuid,_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.nimiq_payment_quotes; pid uuid; nid uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO q FROM public.nimiq_payment_quotes WHERE id=_id AND user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR q.network<>'testnet' THEN RAISE EXCEPTION 'Testnet payment required'; END IF;
 IF q.status='fulfilled' THEN SELECT id INTO pid FROM public.testnet_payouts WHERE payment_quote_id=q.id; RETURN pid; END IF;
 IF q.status<>'pending' OR lower(_hash) !~ '^[a-f0-9]{64}$' OR q.tx_hash IS DISTINCT FROM lower(_hash) OR q.reserve_address_snapshot IS NULL OR q.amount_luna>9007199254740991 OR q.savings_luna<=0 OR q.savings_luna*2<>q.amount_luna THEN RAISE EXCEPTION 'Bound verified testnet payment required'; END IF;
 INSERT INTO public.testnet_payouts(id,payment_quote_id,user_id,treasury_sender,reserve_destination,amount_luna,reference) VALUES(nid,q.id,q.user_id,q.recipient,q.reserve_address_snapshot,q.savings_luna,'NIMAURA:'||nid::text) RETURNING id INTO pid;
 UPDATE public.nimiq_payment_quotes SET status='fulfilled',verified_at=now() WHERE id=q.id;
 RETURN pid;
END $$;
CREATE FUNCTION public.claim_testnet_payout(_id uuid,_operator uuid,_height bigint,_expires timestamptz) RETURNS public.testnet_payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.testnet_payouts;
BEGIN
 IF NOT public.has_role(_operator,'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
 IF _height<0 OR _expires<=now() OR _expires>now()+interval '10 minutes' THEN RAISE EXCEPTION 'Invalid claim window'; END IF;
 UPDATE public.testnet_payouts SET status='uncertain',claimed_by=_operator,claim_token=gen_random_uuid(),claimed_at=now(),validity_start_height=_height,expires_at=_expires WHERE id=_id AND status='queued' RETURNING * INTO p;
 IF NOT FOUND THEN RAISE EXCEPTION 'Already claimed; reconcile, never resend'; END IF;
 RETURN p;
END $$;
CREATE FUNCTION public.complete_testnet_payout(_id uuid,_operator uuid,_token uuid,_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.testnet_payouts;
BEGIN
 IF NOT public.has_role(_operator,'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
 SELECT * INTO p FROM public.testnet_payouts WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR p.claimed_by IS DISTINCT FROM _operator OR p.claim_token IS DISTINCT FROM _token THEN RAISE EXCEPTION 'Claim mismatch'; END IF;
 IF p.status='paid' AND p.tx_hash=lower(_hash) THEN RETURN p.id; END IF;
 IF p.status<>'uncertain' OR lower(_hash) !~ '^[a-f0-9]{64}$' OR (p.tx_hash IS NOT NULL AND p.tx_hash<>lower(_hash)) THEN RAISE EXCEPTION 'Payout mismatch'; END IF;
 UPDATE public.testnet_payouts SET status='paid',tx_hash=lower(_hash),verified_at=now() WHERE id=p.id;
 RETURN p.id;
END $$;
REVOKE ALL ON FUNCTION public.fulfill_testnet_payment(uuid,uuid,text), public.claim_testnet_payout(uuid,uuid,bigint,timestamptz),public.complete_testnet_payout(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_testnet_payment(uuid,uuid,text),public.claim_testnet_payout(uuid,uuid,bigint,timestamptz),public.complete_testnet_payout(uuid,uuid,uuid,text) TO service_role;
COMMENT ON TABLE public.testnet_payouts IS 'Isolated test funds only. Wallet-approved treasury payouts. Uncertain claims never auto-reset or resend; only finalized verified delivery marks paid.';