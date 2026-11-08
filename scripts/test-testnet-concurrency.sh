#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL with overlapping independent connections; no hosted credentials.
ROOT="$(pwd)"
DIR="$(mktemp -d /tmp/nimaura-concurrency.XXXXXX)"
chown lovable "$DIR"
AS_USER=(setpriv --reuid=1000 --regid=1000 --clear-groups)
cleanup() { "${AS_USER[@]}" pg_ctl -D "$DIR/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${AS_USER[@]}" initdb -D "$DIR/db" --auth=trust >/dev/null
"${AS_USER[@]}" pg_ctl -D "$DIR/db" -l "$DIR/server.log" -o "-k $DIR -h '' -p 55439" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$DIR" -p 55439 -U lovable -d postgres)
"${PSQL[@]}" >/dev/null <<'SQL'
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
SQL
for file in "$ROOT"/drizzle/migrations/*.sql; do "${PSQL[@]}" -f "$file" >/dev/null; done
"${PSQL[@]}" >/dev/null <<'SQL'
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-8000-000000000001','collector@test.invalid'),('00000000-0000-4000-8000-000000000002','admin@test.invalid');
INSERT INTO public.user_roles(user_id,role) VALUES('00000000-0000-4000-8000-000000000002','admin');
INSERT INTO public.nimiq_payment_quotes(id,user_id,drop_id,intention,seed,config,network,recipient,sender,amount_luna,savings_luna,rate,expires_at,validity_start_height,status,tx_hash,reserve_address_snapshot)
SELECT '00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',id,'become',1,'{}','testnet','treasury','payer',100000,50000,1,now()+interval '5 minutes',100,'pending',repeat('a',64),'reserve' FROM public.daily_drops LIMIT 1;
SQL
"${PSQL[@]}" -At >"$DIR/first" <<'SQL' &
BEGIN;
SELECT id FROM public.nimiq_payment_quotes WHERE id='00000000-0000-4000-8000-000000000003' FOR UPDATE;
SELECT pg_sleep(1);
SELECT public.fulfill_testnet_payment('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',repeat('a',64));
COMMIT;
SQL
FIRST=$!
"${PSQL[@]}" -At -c "SELECT public.fulfill_testnet_payment('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',repeat('a',64))" >"$DIR/second" &
SECOND=$!
wait "$FIRST"; wait "$SECOND"
test "$("${PSQL[@]}" -At -c 'SELECT count(*) FROM public.testnet_payouts')" = 1
CLAIM="SELECT public.claim_testnet_payout((SELECT id FROM public.testnet_payouts LIMIT 1),'00000000-0000-4000-8000-000000000002',100,now()+interval '5 minutes')"
"${PSQL[@]}" -c "$CLAIM" >"$DIR/claim1" 2>&1 & C1=$!
"${PSQL[@]}" -c "$CLAIM" >"$DIR/claim2" 2>&1 & C2=$!
WINS=0
if wait "$C1"; then WINS=$((WINS+1)); fi
if wait "$C2"; then WINS=$((WINS+1)); fi
test "$WINS" = 1
test "$("${PSQL[@]}" -At -c "SELECT count(*) FROM public.testnet_payouts WHERE status='uncertain'")" = 1
"${PSQL[@]}" >/dev/null <<'SQL'
INSERT INTO public.nimiq_wallet_links(user_id,address,public_key,network) VALUES('00000000-0000-4000-8000-000000000002','treasury',repeat('a',64),'testnet');
INSERT INTO public.testnet_hub_requests(id,user_id,kind,payout_id,expires_at) SELECT '00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000002','payout',id,now()+interval '5 minutes' FROM public.testnet_payouts;
SQL
ACCEPT="SELECT public.accept_testnet_hub_result('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000002','',repeat('b',64),'abcd')"
"${PSQL[@]}" -c "$ACCEPT" >"$DIR/accept1" 2>&1 & A1=$!
"${PSQL[@]}" -c "$ACCEPT" >"$DIR/accept2" 2>&1 & A2=$!
WINS=0
if wait "$A1"; then WINS=$((WINS+1)); fi
if wait "$A2"; then WINS=$((WINS+1)); fi
test "$WINS" = 1
test "$("${PSQL[@]}" -At -c 'SELECT count(*) FROM public.testnet_hub_signed_payouts')" = 1
test "$("${PSQL[@]}" -At -c "SELECT count(*) FROM public.testnet_payouts WHERE status='uncertain' AND tx_hash=repeat('b',64)")" = 1
echo 'PASS: independent connections fulfill once, claim once, accept signed Hub bytes once, and never requeue uncertain payouts.'