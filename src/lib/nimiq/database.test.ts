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
  for (const file of ["0000_migration.sql", "0001_verified_nimiq_wallets_and_payment_quotes.sql", "0002_restrict_profile_wallet_and_credit_updates.sql", "0003_isolated_testnet_manual_payouts_and_least_privilege.sql", "0004_harden_testnet_claim_null_guards.sql", "0005_final_testnet_invariants_and_trigger_grants.sql"]) {
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
    for (const role of ["anon", "authenticated"]) for (const table of ["nimiq_payment_quotes", "testnet_payouts", "payment_attempts", "savings_transfers", "nimiq_wallet_links", "nimiq_wallet_challenges", "user_roles"]) {
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
});