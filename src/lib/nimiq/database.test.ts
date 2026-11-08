// Execute the real saved migration/function bodies in disposable PostgreSQL WASM.
// No hosted users, credentials or funds are used.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let db: PGlite;
const collector = "00000000-0000-4000-8000-000000000001";
const admin = "00000000-0000-4000-8000-000000000002";
const quote = "00000000-0000-4000-8000-000000000003";
const drop = "00000000-0000-4000-8000-000000000004";
const hash = "a".repeat(64);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
  for (const file of ["0000_migration.sql", "0001_verified_nimiq_wallets_and_payment_quotes.sql", "0002_restrict_profile_wallet_and_credit_updates.sql", "0003_isolated_testnet_manual_payouts_and_least_privilege.sql", "0004_harden_testnet_claim_null_guards.sql", "0005_final_testnet_invariants_and_trigger_grants.sql", "0006_private_testnet_hub_requests.sql", "0007_hub_result_empty_sentinels.sql"]) {
    await db.exec(readFileSync(`drizzle/migrations/${file}`, "utf8"));
  }
  await db.exec(`INSERT INTO auth.users(id,email) VALUES('${collector}','collector@test.invalid'),('${admin}','admin@test.invalid');
    INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin');
    INSERT INTO public.daily_drops(id,entity_id,number,clue,sigil,starts_at,ends_at) SELECT '${drop}',id,999,'test','test',now()-interval '1 hour',now()+interval '1 hour' FROM public.entities LIMIT 1;
    INSERT INTO public.nimiq_payment_quotes(id,user_id,drop_id,intention,seed,config,network,recipient,sender,amount_luna,savings_luna,rate,expires_at,validity_start_height,status,tx_hash,reserve_address_snapshot) VALUES('${quote}','${collector}','${drop}','become',1,'{}','testnet','treasury','payer',100000,50000,1,now()+interval '5 minutes',100,'pending','${hash}','original-reserve');`);
}, 30_000);
afterAll(async () => { await db.close(); });
describe.sequential("real migration authorization and replay", () => {
  it("denies anonymous and collector payment/payout writes and truncate", async () => {
    for (const role of ["anon", "authenticated"]) for (const table of ["nimiq_payment_quotes", "testnet_payouts", "payment_attempts", "savings_transfers", "nimiq_wallet_links", "nimiq_wallet_challenges", "user_roles", "testnet_hub_requests", "testnet_hub_signed_payouts"]) {
      const result = await db.query<{ allowed: boolean }>(`SELECT has_table_privilege('${role}','public.${table}','INSERT') OR has_table_privilege('${role}','public.${table}','UPDATE') OR has_table_privilege('${role}','public.${table}','DELETE') OR has_table_privilege('${role}','public.${table}','TRUNCATE') AS allowed`);
      expect(result.rows[0]?.allowed).toBe(false);
    }
    await db.exec("SET ROLE anon");
    await expect(db.exec(`UPDATE public.nimiq_payment_quotes SET status='fulfilled' WHERE id='${quote}'`)).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    await expect(db.query(`SELECT public.fulfill_testnet_payment('${quote}','${collector}','${hash}')`)).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
  it("denies a collector operator even when a service caller supplies its ID", async () => {
    await expect(db.query(`SELECT public.claim_testnet_payout(gen_random_uuid(),'${collector}',100,now()+interval '5 minutes')`)).rejects.toThrow(/Admin required/);
  });
  it("rejects NULL claim windows and NULL completion evidence", async () => {
    await expect(db.query(`SELECT public.claim_testnet_payout(gen_random_uuid(),'${admin}',NULL,NULL)`)).rejects.toThrow(/Invalid claim/);
    await expect(db.query(`SELECT public.complete_testnet_payout(gen_random_uuid(),'${admin}',gen_random_uuid(),NULL)`)).rejects.toThrow(/Invalid completion/);
  });
  it("rejects incorrect allocations and reused inbound hashes", async () => {
    await db.exec(`UPDATE public.nimiq_payment_quotes SET savings_luna=49999 WHERE id='${quote}'`);
    await expect(db.query(`SELECT public.fulfill_testnet_payment('${quote}','${collector}','${hash}')`)).rejects.toThrow(/Bound verified/);
    await db.exec(`UPDATE public.nimiq_payment_quotes SET savings_luna=50000 WHERE id='${quote}'`);
    await expect(db.exec(`INSERT INTO public.nimiq_payment_quotes(user_id,drop_id,intention,seed,config,network,recipient,sender,amount_luna,savings_luna,rate,expires_at,validity_start_height,status,tx_hash) VALUES('${admin}','${drop}','become',1,'{}','testnet','t','p',100000,50000,1,now(),100,'pending','${hash}')`)).rejects.toThrow(/unique/);
  });
  it("atomically fulfills once under concurrent submissions and snapshots destination", async () => {
    const results = await Promise.all([1,2].map(() => db.query<{ id: string }>(`SELECT public.fulfill_testnet_payment('${quote}','${collector}','${hash}') AS id`)));
    expect(results[0]?.rows[0]?.id).toBe(results[1]?.rows[0]?.id);
    await expect(db.query(`SELECT public.fulfill_testnet_payment('${quote}','${collector}','${"b".repeat(64)}')`)).rejects.toThrow(/replay hash mismatch/);
    const rows = await db.query<{ reserve_destination: string; amount_luna: number }>("SELECT reserve_destination,amount_luna FROM public.testnet_payouts");
    expect(rows.rows).toEqual([{ reserve_destination: "original-reserve", amount_luna: 50000 }]);
    await db.exec(`UPDATE public.nimiq_payment_quotes SET reserve_address_snapshot='changed-reserve' WHERE id='${quote}'`);
    expect((await db.query<{ reserve_destination: string }>("SELECT reserve_destination FROM public.testnet_payouts")).rows[0]?.reserve_destination).toBe("original-reserve");
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.payment_attempts")).rows[0]?.count).toBe(0);
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.savings_transfers")).rows[0]?.count).toBe(0);
  });
  it("allows only one concurrent claim and keeps ambiguous broadcasts uncertain", async () => {
    const id = (await db.query<{ id: string }>("SELECT id FROM public.testnet_payouts")).rows[0]?.id;
    expect(id).toBeDefined();
    const attempts = await Promise.allSettled([1,2].map(() => db.query(`SELECT public.claim_testnet_payout('${id}','${admin}',100,now()+interval '5 minutes')`)));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(1);
    expect((await db.query<{ status: string }>("SELECT status FROM public.testnet_payouts")).rows[0]?.status).toBe("uncertain");
    await expect(db.query(`SELECT public.claim_testnet_payout('${id}','${admin}',100,now()+interval '5 minutes')`)).rejects.toThrow(/reconcile/);
  });
  it("rejects forged completion claims and completes idempotently", async () => {
    const p = (await db.query<{ id: string; claim_token: string }>("SELECT id,claim_token FROM public.testnet_payouts")).rows[0];
    if (!p) throw new Error("Missing fixture");
    await expect(db.query(`SELECT public.complete_testnet_payout('${p.id}','${admin}',gen_random_uuid(),'${hash}')`)).rejects.toThrow(/Claim mismatch/);
    await expect(db.query(`SELECT public.complete_testnet_payout('${p.id}','${collector}','${p.claim_token}','${hash}')`)).rejects.toThrow(/Admin required/);
    await db.query(`SELECT public.complete_testnet_payout('${p.id}','${admin}','${p.claim_token}','${hash}')`);
    await db.query(`SELECT public.complete_testnet_payout('${p.id}','${admin}','${p.claim_token}','${hash}')`);
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.testnet_payouts WHERE status='paid'")).rows[0]?.count).toBe(1);
    await expect(db.query(`SELECT public.complete_testnet_payout('${p.id}','${admin}','${p.claim_token}','${"b".repeat(64)}')`)).rejects.toThrow(/Payout mismatch/);
  });
  it('keeps Hub bytes/state unreadable to anonymous, collector and admin client roles', async () => {
    for (const role of ['anon', 'authenticated']) for (const table of ['testnet_hub_requests', 'testnet_hub_signed_payouts']) {
      expect((await db.query<{ allowed: boolean }>(`SELECT has_table_privilege('${role}','public.${table}','SELECT') AS allowed`)).rows[0]?.allowed).toBe(false);
    }
    expect((await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('authenticated','public.accept_testnet_hub_result(uuid,uuid,text,text,text)','EXECUTE') AS allowed`)).rows[0]?.allowed).toBe(false);
  });
  it('binds ownership state to user, expiry and one-use atomic challenge consumption', async () => {
    const cid = '00000000-0000-4000-8000-000000000011', rid = '00000000-0000-4000-8000-000000000012';
    await db.exec(`INSERT INTO public.nimiq_wallet_challenges(id,user_id,address,network,purpose,message,expires_at) VALUES('${cid}','${collector}','hub-reserve','testnet','reserve','challenge',now()+interval '5 minutes');
      INSERT INTO public.testnet_hub_requests(id,user_id,kind,challenge_id,expires_at) VALUES('${rid}','${collector}','ownership','${cid}',now()-interval '1 minute');`);
    await expect(db.query(`SELECT public.accept_testnet_hub_result('${rid}','${admin}','${hash}','','')`)).rejects.toThrow(/state/);
    await expect(db.query(`SELECT public.accept_testnet_hub_result('${rid}','${collector}','${hash}','','')`)).rejects.toThrow(/expired/);
    await db.exec(`UPDATE public.testnet_hub_requests SET expires_at=now()+interval '5 minutes' WHERE id='${rid}'`);
    const results = await Promise.allSettled([1, 2].map(() => db.query(`SELECT public.accept_testnet_hub_result('${rid}','${collector}','${hash}','','')`)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await db.query<{ address: string }>(`SELECT address FROM public.nimiq_wallet_links WHERE user_id='${collector}' AND is_reserve`)).rows[0]?.address).toBe('hub-reserve');
  });
  it('records exactly one private signed payout before one broadcast permission; replay cannot replace bytes/hash', async () => {
    const qid='00000000-0000-4000-8000-000000000021', pid='00000000-0000-4000-8000-000000000022', rid='00000000-0000-4000-8000-000000000023';
    await db.exec(`INSERT INTO public.nimiq_payment_quotes(id,user_id,drop_id,intention,seed,config,network,recipient,sender,amount_luna,savings_luna,rate,expires_at,validity_start_height,status) VALUES('${qid}','${admin}','${drop}','become',1,'{}','testnet','treasury','payer',100000,50000,1,now()+interval '5 minutes',100,'fulfilled');
      INSERT INTO public.testnet_payouts(id,payment_quote_id,user_id,treasury_sender,reserve_destination,amount_luna,reference) VALUES('${pid}','${qid}','${admin}','treasury','reserve',50000,'NIMAURA:${pid}');
      SELECT public.claim_testnet_payout('${pid}','${admin}',100,now()+interval '5 minutes');
      INSERT INTO public.testnet_hub_requests(id,user_id,kind,payout_id,expires_at) VALUES('${rid}','${admin}','payout','${pid}',now()+interval '5 minutes');`);
    await expect(db.query(`SELECT public.accept_testnet_hub_result('${rid}','${collector}','','${'c'.repeat(64)}','abcd')`)).rejects.toThrow();
    await expect(db.query(`SELECT public.accept_testnet_hub_result('${rid}','${admin}','','${'c'.repeat(64)}','abcd')`)).rejects.toThrow(/Treasury proof/);
    await db.exec(`INSERT INTO public.nimiq_wallet_links(user_id,address,network,public_key) VALUES('${admin}','treasury','testnet','${hash}')`);
    const results = await Promise.allSettled([1,2].map(() => db.query(`SELECT public.accept_testnet_hub_result('${rid}','${admin}','','${'c'.repeat(64)}','abcd')`)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    const saved = await db.query<{ tx_hash: string; signed_bytes: string }>(`SELECT tx_hash,signed_bytes FROM public.testnet_hub_signed_payouts WHERE payout_id='${pid}'`);
    expect(saved.rows).toEqual([{tx_hash:'c'.repeat(64),signed_bytes:'abcd'}]);
    expect((await db.query<{status:string}>(`SELECT status FROM public.testnet_payouts WHERE id='${pid}'`)).rows[0]?.status).toBe('uncertain');
    await expect(db.query(`SELECT public.accept_testnet_hub_result('${rid}','${admin}','','${'d'.repeat(64)}','ffff')`)).rejects.toThrow(/consumed/);
  });
});