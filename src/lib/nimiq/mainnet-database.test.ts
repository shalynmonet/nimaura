// Runs the real saved migrations (0000..latest) in disposable PostgreSQL WASM and exercises
// the actual MAINNET payout tables, functions and grants. No hosted data, keys or funds.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let db: PGlite;
const collector = "00000000-0000-4000-8000-0000000000c1", other = "00000000-0000-4000-8000-0000000000c2", admin = "00000000-0000-4000-8000-0000000000a1";
const drop = "00000000-0000-4000-8000-0000000000d1";
const q1 = "00000000-0000-4000-8000-0000000000e1", q2 = "00000000-0000-4000-8000-0000000000e2", q3 = "00000000-0000-4000-8000-0000000000e3", q4 = "00000000-0000-4000-8000-0000000000e4";
const h1 = "1".repeat(64), h2 = "2".repeat(64), h3 = "3".repeat(64);
const as = async (role: "anon" | "authenticated", uid: string | null, sql: string) => {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${uid ?? ""}',false);`);
  try { return await db.query(sql); } finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);"); }
};
const quote = (id: string, user: string, status: string, extra = "") => `INSERT INTO public.nimiq_payment_quotes(id,user_id,drop_id,intention,seed,config,network,recipient,sender,amount_luna,savings_luna,rate,expires_at,validity_start_height,status,reserve_address_snapshot${extra ? "," + extra.split("=")[0] : ""}) VALUES('${id}','${user}','${drop}','become',1,'{}','mainnet','TREASURY','PAYER',100000,50000,1,now()-interval '1 minute',100,'${status}','RESERVE'${extra ? ",'" + extra.split("=")[1] + "'" : ""});`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
  for (const f of readdirSync("drizzle/migrations").filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(readFileSync(`drizzle/migrations/${f}`, "utf8"));
  await db.exec(`INSERT INTO auth.users(id,email) VALUES('${collector}','c@test.invalid'),('${other}','o@test.invalid'),('${admin}','a@test.invalid');
    INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin');
    INSERT INTO public.nimiq_wallet_links(user_id,address,public_key,network) VALUES('${admin}','TREASURY','${"0".repeat(64)}','mainnet');
    INSERT INTO public.daily_drops(id,entity_id,number,clue,sigil,starts_at,ends_at) SELECT '${drop}',id,9999,'t','t',now()-interval '1 hour',now()+interval '1 hour' FROM public.entities LIMIT 1;
    ${quote(q1, collector, "pending", `tx_hash=${h1}`)} ${quote(q2, other, "pending", `tx_hash=${h2}`)}`);
}, 60_000);
afterAll(async () => { await db?.close(); });

describe.sequential("mainnet payout ledger: real permissions and exactly-once", () => {
  it("issues one collectible and one 50% payout exactly once, even when fulfillment is replayed concurrently", async () => {
    const runs = await Promise.allSettled([1, 2, 3].map(() => db.query<{ m: string }>(`SELECT public.fulfill_mainnet_payment('${q1}','${collector}','${h1}') m`)));
    const ids = new Set(runs.flatMap(r => r.status === "fulfilled" ? [r.value.rows[0]?.m] : []));
    expect(ids.size).toBe(1);
    await db.query(`SELECT public.fulfill_mainnet_payment('${q2}','${other}','${h2}')`);
    const c = await db.query<{ m: number; p: number; amt: string }>(`SELECT (SELECT count(*) FROM public.manifestations WHERE mainnet_quote_id='${q1}')::int m, (SELECT count(*) FROM public.mainnet_payouts WHERE payment_quote_id='${q1}')::int p, (SELECT amount_luna::text FROM public.mainnet_payouts WHERE payment_quote_id='${q1}') amt`);
    expect(c.rows[0]).toEqual({ m: 1, p: 1, amt: "50000" });
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM public.testnet_payouts")).rows[0]?.n).toBe(0);
    await expect(db.query(`SELECT public.fulfill_mainnet_payment('${q1}','${collector}','${h2}')`)).rejects.toThrow(/hash mismatch/);
    await expect(db.query(`SELECT public.fulfill_testnet_payment('${q1}','${collector}','${h1}')`)).rejects.toThrow(/Testnet payment required/);
  });
  it("denies anonymous users every mainnet payout table and function", async () => {
    for (const t of ["mainnet_payouts", "mainnet_hub_requests", "mainnet_hub_signed_payouts"]) await expect(as("anon", null, `SELECT * FROM public.${t}`)).rejects.toThrow(/permission denied/);
    for (const f of [`claim_mainnet_payout('${q1}','${admin}',1,now()+interval '1 minute')`, `complete_mainnet_payout('${q1}','${admin}','${q1}','${h1}')`, `fulfill_mainnet_payment('${q1}','${collector}','${h1}')`, `reopen_unbroadcast_mainnet_payout('${q1}','${admin}')`, `accept_mainnet_hub_result('${q1}','${admin}','','','')`, `pin_late_payment('${q1}','${collector}','${h1}')`])
      await expect(as("anon", null, `SELECT public.${f}`)).rejects.toThrow(/permission denied/);
  });
  it("lets a collector read only their own payout and nothing private, and change nothing", async () => {
    const own = await as("authenticated", collector, "SELECT user_id FROM public.mainnet_payouts");
    expect(own.rows).toEqual([{ user_id: collector }]);
    await expect(as("authenticated", collector, "UPDATE public.mainnet_payouts SET reserve_destination='ATTACKER', amount_luna=99999999")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", collector, "UPDATE public.mainnet_payouts SET status='paid'")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", collector, `INSERT INTO public.user_roles(user_id,role) VALUES('${collector}','admin')`)).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", collector, "SELECT * FROM public.mainnet_hub_signed_payouts")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", collector, "SELECT * FROM public.mainnet_hub_requests")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", collector, `SELECT public.claim_mainnet_payout((SELECT id FROM public.mainnet_payouts LIMIT 1),'${collector}',1,now()+interval '1 minute')`)).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", collector, `SELECT public.complete_mainnet_payout('${q1}','${collector}','${q1}','${h1}')`)).rejects.toThrow(/permission denied/);
  });
  it("lets an admin see all payouts but a non-admin operator cannot claim even through the service path", async () => {
    expect((await as("authenticated", admin, "SELECT id FROM public.mainnet_payouts")).rows).toHaveLength(2);
    const p = (await db.query<{ id: string }>(`SELECT id FROM public.mainnet_payouts WHERE payment_quote_id='${q1}'`)).rows[0]!.id;
    await expect(db.query(`SELECT public.claim_mainnet_payout('${p}','${collector}',100,now()+interval '5 minutes')`)).rejects.toThrow(/Admin required/);
  });
  it("allows exactly one of several concurrent admin claims, and only the original claim can complete delivery", async () => {
    const p = (await db.query<{ id: string }>(`SELECT id FROM public.mainnet_payouts WHERE payment_quote_id='${q1}'`)).rows[0]!.id;
    const claims = await Promise.allSettled([1, 2, 3].map(() => db.query(`SELECT public.claim_mainnet_payout('${p}','${admin}',100,now()+interval '5 minutes')`)));
    expect(claims.filter(c => c.status === "fulfilled")).toHaveLength(1);
    // A payout request + signed result is stored before any broadcast; a second result is rejected.
    await db.exec(`INSERT INTO public.mainnet_hub_requests(id,user_id,kind,payout_id,expires_at) VALUES('${q3}','${admin}','payout','${p}',now()+interval '5 minutes')`);
    await expect(db.query(`SELECT public.accept_mainnet_hub_result('${q3}','${collector}','', '${h3}','ab')`)).rejects.toThrow();
    await db.query(`SELECT public.accept_mainnet_hub_result('${q3}','${admin}','','${h3}','ab')`);
    await expect(db.query(`SELECT public.accept_mainnet_hub_result('${q3}','${admin}','','${h3}','ab')`)).rejects.toThrow(/consumed/);
    await expect(db.query(`SELECT public.reopen_unbroadcast_mainnet_payout('${p}','${admin}')`)).rejects.toThrow();
    const tok = (await db.query<{ t: string }>(`SELECT claim_token t FROM public.mainnet_payouts WHERE id='${p}'`)).rows[0]!.t;
    await expect(db.query(`SELECT public.complete_mainnet_payout('${p}','${admin}','${tok}','${h2}')`)).rejects.toThrow(/mismatch/);
    await expect(db.query(`SELECT public.complete_mainnet_payout('${p}','${admin}','${q4}','${h3}')`)).rejects.toThrow(/Claim mismatch/);
    await db.query(`SELECT public.complete_mainnet_payout('${p}','${admin}','${tok}','${h3}')`);
    await db.query(`SELECT public.complete_mainnet_payout('${p}','${admin}','${tok}','${h3}')`);
    expect((await db.query<{ s: string }>(`SELECT status s FROM public.mainnet_payouts WHERE id='${p}'`)).rows[0]?.s).toBe("paid");
  });
});

describe.sequential("evidence-based purchase recovery (real SQL)", () => {
  it("closes an explicitly cancelled purchase only without evidence, then allows a new purchase", async () => {
    await db.exec(quote(q3, other, "pending", "submission_outcome=unknown").replace(q3, "00000000-0000-4000-8000-0000000000f1"));
    await expect(db.query(`SELECT public.close_cancelled_collector_purchase('00000000-0000-4000-8000-0000000000f1','${other}')`)).rejects.toThrow(/cancelled/);
    await db.exec(`UPDATE public.nimiq_payment_quotes SET submission_outcome='cancelled' WHERE id='00000000-0000-4000-8000-0000000000f1'`);
    await db.query(`SELECT public.close_cancelled_collector_purchase('00000000-0000-4000-8000-0000000000f1','${other}')`);
    await db.exec(quote(q4, other, "quoted")); // unique unresolved-quote index now permits a fresh purchase
  });
  it("never closes a purchase that has a hash or candidate hash", async () => {
    await db.exec(`UPDATE public.nimiq_payment_quotes SET status='failed' WHERE id='${q4}'`);
    const id = "00000000-0000-4000-8000-0000000000f2";
    await db.exec(quote(id, other, "pending", "candidate_tx_hash=" + "4".repeat(64)));
    await db.exec(`UPDATE public.nimiq_payment_quotes SET submission_outcome='cancelled' WHERE id='${id}'`);
    await expect(db.query(`SELECT public.close_cancelled_collector_purchase('${id}','${other}')`)).rejects.toThrow();
    await expect(db.query(`SELECT public.release_unmatched_collector_purchase('${id}','${other}')`)).rejects.toThrow(/evidence/);
    await db.exec(`UPDATE public.nimiq_payment_quotes SET status='failed' WHERE id='${id}'`);
  });
  it("keeps a closed purchase recoverable: a verified late payment issues exactly one collectible", async () => {
    const id = "00000000-0000-4000-8000-0000000000f1", late = "5".repeat(64);
    await expect(db.query(`SELECT public.fulfill_mainnet_payment('${id}','${other}','${late}')`)).rejects.toThrow(/hash mismatch/);
    await db.query(`SELECT public.pin_late_payment('${id}','${other}','${late}')`);
    await expect(db.query(`SELECT public.pin_late_payment('${id}','${other}','${"6".repeat(64)}')`)).rejects.toThrow(/Different/);
    const a = await db.query<{ m: string }>(`SELECT public.fulfill_mainnet_payment('${id}','${other}','${late}') m`);
    const b = await db.query<{ m: string }>(`SELECT public.fulfill_mainnet_payment('${id}','${other}','${late}') m`);
    expect(a.rows[0]?.m).toBe(b.rows[0]?.m);
    expect((await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.mainnet_payouts WHERE payment_quote_id='${id}'`)).rows[0]?.n).toBe(1);
    // The same hash can never pay for a second purchase.
    await expect(db.query(`SELECT public.pin_late_payment('00000000-0000-4000-8000-0000000000f2','${other}','${late}')`)).rejects.toThrow();
  });
});
