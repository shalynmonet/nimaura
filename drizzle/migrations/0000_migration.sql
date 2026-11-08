
-- Profiles (collector)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  credits integer not null default 2 check (credits >= 0),
  reserve_address text,
  savings_goal_nim numeric,
  sound_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (display_name, reserve_address, savings_goal_nim, sound_enabled) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_collector()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_collector();

-- Entities (hidden until unsealed)
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  designation text not null,
  archetype text not null,
  symbolism text not null,
  reflections jsonb not null default '{}'::jsonb,
  meditation jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.entities to authenticated;
grant all on public.entities to service_role;
alter table public.entities enable row level security;

-- Daily drops (public teaser only)
create table public.daily_drops (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id),
  number integer not null unique,
  clue text not null,
  sigil text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
grant select (id, number, clue, sigil, starts_at, ends_at) on public.daily_drops to anon, authenticated;
grant all on public.daily_drops to service_role;
alter table public.daily_drops enable row level security;
create policy "drops public teaser" on public.daily_drops for select to anon, authenticated using (true);

-- Manifestations (private vault)
create table public.manifestations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  drop_id uuid not null references public.daily_drops(id),
  entity_id uuid not null references public.entities(id),
  intention text not null check (intention in ('become','release','receive','remember')),
  seed bigint not null,
  config jsonb not null,
  source text not null check (source in ('complimentary','paid','simulated')),
  payment_id uuid,
  created_at timestamptz not null default now()
);
create index on public.manifestations(user_id, created_at desc);
create unique index manifestations_payment_unique on public.manifestations(payment_id) where payment_id is not null;
grant select on public.manifestations to authenticated;
grant all on public.manifestations to service_role;
alter table public.manifestations enable row level security;
create policy "own manifestations" on public.manifestations for select to authenticated using (auth.uid() = user_id);

create policy "entities seen by owners" on public.entities for select to authenticated
  using (exists (select 1 from public.manifestations m where m.entity_id = entities.id and m.user_id = auth.uid()));

-- Credit redemption ledger
create table public.credit_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  manifestation_id uuid not null unique references public.manifestations(id),
  created_at timestamptz not null default now()
);
grant select on public.credit_redemptions to authenticated;
grant all on public.credit_redemptions to service_role;
alter table public.credit_redemptions enable row level security;
create policy "own redemptions" on public.credit_redemptions for select to authenticated using (auth.uid() = user_id);

-- Payments
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  drop_id uuid not null references public.daily_drops(id),
  intention text not null,
  usd_amount numeric not null default 1,
  nim_amount numeric,
  nim_usd_rate numeric,
  savings_nim numeric,
  network_fee_nim numeric,
  status text not null default 'quoted' check (status in ('quoted','authorized','verified','failed','fulfilled')),
  tx_hash text unique,
  is_simulated boolean not null default false,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
grant select on public.payment_attempts to authenticated;
grant all on public.payment_attempts to service_role;
alter table public.payment_attempts enable row level security;
create policy "own payments" on public.payment_attempts for select to authenticated using (auth.uid() = user_id);

create table public.savings_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  payment_id uuid not null unique references public.payment_attempts(id),
  to_address text not null,
  nim_amount numeric not null,
  status text not null default 'pending' check (status in ('pending','sent','verified','failed')),
  tx_hash text unique,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
grant select on public.savings_transfers to authenticated;
grant all on public.savings_transfers to service_role;
alter table public.savings_transfers enable row level security;
create policy "own transfers" on public.savings_transfers for select to authenticated using (auth.uid() = user_id);

-- Atomic complimentary unseal (backend-enforced drop window + credit)
create or replace function public.unseal_with_credit(_drop_id uuid, _intention text, _seed bigint, _config jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _drop public.daily_drops; _mid uuid; _rows int;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if _intention not in ('become','release','receive','remember') then raise exception 'invalid intention'; end if;
  select * into _drop from public.daily_drops where id = _drop_id;
  if not found then raise exception 'drop not found'; end if;
  if now() < _drop.starts_at or now() >= _drop.ends_at then raise exception 'this drop is sealed: outside its window'; end if;
  update public.profiles set credits = credits - 1 where id = _uid and credits > 0;
  get diagnostics _rows = row_count;
  if _rows = 0 then raise exception 'no complimentary credits remain'; end if;
  insert into public.manifestations(user_id, drop_id, entity_id, intention, seed, config, source)
    values (_uid, _drop.id, _drop.entity_id, _intention, _seed, _config, 'complimentary') returning id into _mid;
  insert into public.credit_redemptions(user_id, manifestation_id) values (_uid, _mid);
  return _mid;
end $$;
revoke execute on function public.unseal_with_credit(uuid,text,bigint,jsonb) from public, anon;
grant execute on function public.unseal_with_credit(uuid,text,bigint,jsonb) to authenticated;

-- DEV-ONLY simulated paid unseal: records clearly flagged simulated rows
create or replace function public.simulate_paid_unseal(_drop_id uuid, _intention text, _seed bigint, _config jsonb, _idem text, _rate numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _drop public.daily_drops; _pid uuid; _mid uuid; _nim numeric; _addr text;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if _intention not in ('become','release','receive','remember') then raise exception 'invalid intention'; end if;
  if _rate is null or _rate <= 0 then raise exception 'invalid rate'; end if;
  select * into _drop from public.daily_drops where id = _drop_id;
  if not found then raise exception 'drop not found'; end if;
  if now() < _drop.starts_at or now() >= _drop.ends_at then raise exception 'this drop is sealed: outside its window'; end if;
  select id into _pid from public.payment_attempts where idempotency_key = _idem and user_id = _uid;
  if found then
    select id into _mid from public.manifestations where payment_id = _pid;
    return _mid;
  end if;
  _nim := round(1 / _rate, 5);
  insert into public.payment_attempts(user_id, drop_id, intention, nim_amount, nim_usd_rate, savings_nim, network_fee_nim, status, is_simulated, idempotency_key, verified_at, tx_hash)
    values (_uid, _drop.id, _intention, _nim, _rate, round(_nim/2,5), 0, 'fulfilled', true, _idem, now(), 'SIMULATED-' || gen_random_uuid())
    returning id into _pid;
  select reserve_address into _addr from public.profiles where id = _uid;
  insert into public.savings_transfers(user_id, payment_id, to_address, nim_amount, status, is_simulated, verified_at, tx_hash)
    values (_uid, _pid, coalesce(_addr, 'SIMULATED-NO-ADDRESS'), round(_nim/2,5), 'verified', true, now(), 'SIMULATED-' || gen_random_uuid());
  insert into public.manifestations(user_id, drop_id, entity_id, intention, seed, config, source, payment_id)
    values (_uid, _drop.id, _drop.entity_id, _intention, _seed, _config, 'simulated', _pid) returning id into _mid;
  return _mid;
end $$;
revoke execute on function public.simulate_paid_unseal(uuid,text,bigint,jsonb,text,numeric) from public, anon;
grant execute on function public.simulate_paid_unseal(uuid,text,bigint,jsonb,text,numeric) to authenticated;

-- Seed the single demonstration entity
insert into public.entities (slug, name, designation, archetype, symbolism, reflections, meditation) values (
  'the-woven-seraph',
  'The Woven Seraph',
  'Entity I · Ophan of the Broken Check',
  'seraphic',
  'A watcher stitched from black-and-white cloth older than language. Its wings are not feathers but warp and weft; every tooth of the pattern is an eye that has closed once and chosen to open again. It does not explain itself. It only keeps looking.',
  '{
    "become": "You were woven before you were named. Let one new thread cross the old pattern.",
    "release": "A check is broken so that it may interlock. What you loosen tonight becomes structure tomorrow.",
    "receive": "The eye does not chase light. It stays open, and light arrives.",
    "remember": "Every pattern repeats until someone notices. You are noticing."
  }'::jsonb,
  '["Settle. Let your eyes soften as if looking through cloth.", "Breathe in for four — the rings widen.", "Hold for four — the eye opens.", "Breathe out for six — the threads loosen.", "Again. You are not asked to understand. Only to watch.", "When you are ready, close the eye. It will keep watching for you."]'::jsonb
);

-- 120 daily drops, each a 24h window starting 00:00 UTC
insert into public.daily_drops (entity_id, number, clue, sigil, starts_at, ends_at)
select e.id, g,
  (array[
    'It was woven before it was named.',
    'Count the teeth of the cloth. One of them is looking back.',
    'Six wings, none of them feathered.',
    'Black thread, white thread, and something awake between.',
    'It keeps watch where the pattern breaks.'
  ])[1 + (g % 5)],
  (array['◈','✶','◉','⟁','☉'])[1 + (g % 5)],
  timestamptz '2026-11-01 00:00:00+00' + make_interval(days => g - 1),
  timestamptz '2026-11-01 00:00:00+00' + make_interval(days => g)
from public.entities e, generate_series(1, 120) g
where e.slug = 'the-woven-seraph';
