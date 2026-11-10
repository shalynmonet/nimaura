CREATE OR REPLACE FUNCTION public.reopen_unbroadcast_testnet_payout(_id uuid, _operator uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.testnet_payouts;
BEGIN
  IF _operator IS NULL OR NOT public.has_role(_operator,'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT * INTO p FROM public.testnet_payouts WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR p.network<>'testnet' OR p.status<>'uncertain' OR p.tx_hash IS NOT NULL OR p.expires_at IS NULL OR p.expires_at>now() THEN RAISE EXCEPTION 'Not an expired unsigned claim'; END IF;
  IF EXISTS (SELECT 1 FROM public.testnet_hub_signed_payouts WHERE payout_id=p.id) THEN RAISE EXCEPTION 'Signed bytes exist; reconcile, never reopen'; END IF;
  IF EXISTS (SELECT 1 FROM public.testnet_hub_requests WHERE payout_id=p.id AND (consumed_at IS NOT NULL OR expires_at>now())) THEN RAISE EXCEPTION 'Wallet result used or still live'; END IF;
  -- Expired, never-used wallet requests can no longer be accepted; remove them so a fresh one-use request can be issued.
  DELETE FROM public.testnet_hub_requests WHERE payout_id=p.id AND consumed_at IS NULL AND expires_at<=now();
  UPDATE public.testnet_payouts SET status='queued',claimed_by=NULL,claim_token=NULL,claimed_at=NULL,validity_start_height=NULL,expires_at=NULL WHERE id=p.id;
  RETURN true;
END $function$;