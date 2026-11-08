-- Wallet proofs are server-only writes; collectors may only read their own verified links.
create table public.nimiq_wallet_challenges (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 address text not null, network text not null check (network in ('mainnet','testnet')),
 purpose text not null check (purpose in ('connect','reserve')), message text not null unique,
 expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now()
);
grant all on public.nimiq_wallet_challenges to service_role;
alter table public.nimiq_wallet_challenges enable row level security;
create table public.nimiq_wallet_links (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 address text not null, public_key text not null, network text not null check (network in ('mainnet','testnet')),
 is_reserve boolean not null default false, verified_at timestamptz not null default now(),
 unique (user_id,network,address), unique (network,address)
);
grant select on public.nimiq_wallet_links to authenticated;
grant all on public.nimiq_wallet_links to service_role;
alter table public.nimiq_wallet_links enable row level security;
create policy "own verified wallets" on public.nimiq_wallet_links for select to authenticated using (auth.uid() = user_id);
create unique index one_reserve_per_network on public.nimiq_wallet_links(user_id,network) where is_reserve;
revoke update (reserve_address) on public.profiles from authenticated;
comment on column public.profiles.reserve_address is 'DEPRECATED: use verified network-scoped nimiq_wallet_links with is_reserve. Legacy entries are not proof of ownership.';
create or replace function public.consume_nimiq_wallet_challenge(_id uuid, _user_id uuid, _public_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.nimiq_wallet_challenges; wid uuid;
begin
 select * into c from public.nimiq_wallet_challenges where id = _id and user_id = _user_id for update;
 if not found or c.consumed_at is not null or c.expires_at <= now() then raise exception 'Wallet challenge expired or already used'; end if;
 if c.purpose = 'reserve' then update public.nimiq_wallet_links set is_reserve = false where user_id = _user_id and network = c.network; end if;
 insert into public.nimiq_wallet_links(user_id,address,public_key,network,is_reserve)
 values (_user_id,c.address,_public_key,c.network,c.purpose = 'reserve')
 on conflict (user_id,network,address) do update set public_key = excluded.public_key, verified_at = now(), is_reserve = public.nimiq_wallet_links.is_reserve or excluded.is_reserve
 returning id into wid;
 update public.nimiq_wallet_challenges set consumed_at = now() where id = c.id;
 return wid;
end $$;
revoke all on function public.consume_nimiq_wallet_challenge(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.consume_nimiq_wallet_challenge(uuid,uuid,text) to service_role;
-- No development simulator calls from ordinary collectors, including direct RPC calls.
revoke execute on function public.simulate_paid_unseal(uuid,text,bigint,jsonb,text,numeric) from authenticated;

create table public.nimiq_payment_quotes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, drop_id uuid not null references public.daily_drops(id),
 intention text not null check (intention in ('become','release','receive','remember')),
 seed bigint not null, config jsonb not null,
 network text not null check (network in ('mainnet','testnet')), recipient text not null, sender text not null,
 amount_luna bigint not null check (amount_luna > 0), savings_luna bigint not null check (savings_luna >= 0),
 rate numeric not null check (rate > 0), expires_at timestamptz not null,
 validity_start_height bigint not null, status text not null default 'quoted' check (status in ('quoted','pending','verified','fulfilled','failed')),
 tx_hash text, payment_attempt_id uuid, manifestation_id uuid references public.manifestations(id),
 created_at timestamptz not null default now(), verified_at timestamptz,
 unique (network,tx_hash)
);
grant select on public.nimiq_payment_quotes to authenticated;
grant all on public.nimiq_payment_quotes to service_role;
alter table public.nimiq_payment_quotes enable row level security;
create policy "own network payment quotes" on public.nimiq_payment_quotes for select to authenticated using (auth.uid() = user_id);
create unique index one_unresolved_nimiq_quote on public.nimiq_payment_quotes(user_id,network) where status in ('quoted','pending');

create or replace function public.fulfill_verified_nimiq_payment(_id uuid, _user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.nimiq_payment_quotes; d public.daily_drops; pid uuid; mid uuid;
begin
 select * into q from public.nimiq_payment_quotes where id = _id and user_id = _user_id for update;
 if not found then raise exception 'Payment not found'; end if;
 if q.status = 'fulfilled' then return q.manifestation_id; end if;
 if q.network <> 'mainnet' or q.status <> 'verified' or q.tx_hash is null or q.verified_at is null then raise exception 'Verified mainnet payment required'; end if;
 select * into d from public.daily_drops where id = q.drop_id;
 insert into public.payment_attempts(user_id,drop_id,intention,nim_amount,nim_usd_rate,savings_nim,status,tx_hash,is_simulated,idempotency_key,verified_at)
 values(q.user_id,q.drop_id,q.intention,q.amount_luna::numeric/100000,q.rate,q.savings_luna::numeric/100000,'fulfilled',q.tx_hash,false,q.id::text,q.verified_at) returning id into pid;
 insert into public.manifestations(user_id,drop_id,entity_id,intention,seed,config,source,payment_id)
 values(q.user_id,q.drop_id,d.entity_id,q.intention,q.seed,q.config,'paid',pid) returning id into mid;
 update public.nimiq_payment_quotes set status = 'fulfilled', payment_attempt_id = pid, manifestation_id = mid where id = q.id;
 -- Savings allocations are not transfers; no savings_transfers rows are created here.
 return mid;
end $$;
revoke all on function public.fulfill_verified_nimiq_payment(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fulfill_verified_nimiq_payment(uuid,uuid) to service_role;