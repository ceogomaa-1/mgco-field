-- MG&CO Field — multi-tenant core: companies, members, invites, access gate, cloud data, RLS
-- (Applied to production 2026-07-05; kept in-repo as source of truth.)

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  owner_id uuid not null references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  settings_rev bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','employee')),
  name text not null default '',
  email text not null default '',
  wage numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, user_id),
  unique (user_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null default 'employee' check (role in ('owner','employee')),
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

-- TechOps gate: which OWNER emails are allowed to create a company
create table if not exists public.access_grants (
  email text primary key,
  active boolean not null default true,
  granted_by text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  worker_user_id uuid references auth.users(id),
  status text not null check (status in ('scheduled','active','done')),
  scheduled_for timestamptz,
  schedule_note text not null default '',
  started_at timestamptz,
  finished_at timestamptz,
  breaks jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  notes text not null default '',
  rate numeric not null default 0,
  tax_rate numeric not null default 0,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists jobs_company_idx on public.jobs (company_id);
create index if not exists jobs_worker_idx on public.jobs (worker_user_id);

create table if not exists public.favorites (
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  uses int not null default 1,
  primary key (company_id, name)
);

-- security-definer helpers (avoid recursive RLS lookups)
create or replace function public.my_company()
returns uuid language sql security definer stable set search_path = public as
$$ select company_id from members where user_id = auth.uid() limit 1 $$;

create or replace function public.my_role()
returns text language sql security definer stable set search_path = public as
$$ select role from members where user_id = auth.uid() limit 1 $$;

alter table public.companies enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.access_grants enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.favorites enable row level security;

-- companies: members read their company; only the owner can update (branding/settings)
create policy companies_select on public.companies for select
  using (id = public.my_company());
create policy companies_update on public.companies for update
  using (id = public.my_company() and public.my_role() = 'owner');

-- members: you see yourself; owners see the whole roster; only owners manage
create policy members_select on public.members for select
  using (user_id = auth.uid() or (company_id = public.my_company() and public.my_role() = 'owner'));
create policy members_update on public.members for update
  using (company_id = public.my_company() and public.my_role() = 'owner');
create policy members_delete on public.members for delete
  using (company_id = public.my_company() and public.my_role() = 'owner' and user_id <> auth.uid());

-- invites: owner-only
create policy invites_all on public.invites for all
  using (company_id = public.my_company() and public.my_role() = 'owner')
  with check (company_id = public.my_company() and public.my_role() = 'owner');

-- access_grants: NO client policies — deny all; managed only by the admin edge function

-- customers: shared within the company
create policy customers_select on public.customers for select
  using (company_id = public.my_company());
create policy customers_insert on public.customers for insert
  with check (company_id = public.my_company());
create policy customers_update on public.customers for update
  using (company_id = public.my_company());
create policy customers_delete on public.customers for delete
  using (company_id = public.my_company() and public.my_role() = 'owner');

-- jobs: employees see ONLY their own; owners see everything in the company
create policy jobs_select on public.jobs for select
  using (company_id = public.my_company() and (public.my_role() = 'owner' or worker_user_id = auth.uid()));
create policy jobs_insert on public.jobs for insert
  with check (company_id = public.my_company() and (public.my_role() = 'owner' or worker_user_id = auth.uid()));
create policy jobs_update on public.jobs for update
  using (company_id = public.my_company() and (public.my_role() = 'owner' or worker_user_id = auth.uid()));
create policy jobs_delete on public.jobs for delete
  using (company_id = public.my_company() and (public.my_role() = 'owner' or worker_user_id = auth.uid()));

-- favorites: shared within the company
create policy favorites_all on public.favorites for all
  using (company_id = public.my_company())
  with check (company_id = public.my_company());

-- keep updated_at fresh on jobs
create or replace function public.touch_updated_at()
returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- bootstrap: called after every sign-in. Routes the user:
--   member -> their company; pending invite -> auto-join as employee;
--   TechOps-granted email -> create their company as owner; else denied.
create or replace function public.bootstrap(display_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  uemail text := lower(coalesce(auth.jwt()->>'email',''));
  m public.members%rowtype;
  inv public.invites%rowtype;
  comp public.companies%rowtype;
begin
  if uid is null then
    return jsonb_build_object('state','anon');
  end if;

  select * into m from members where user_id = uid limit 1;
  if found then
    select * into comp from companies where id = m.company_id;
    return jsonb_build_object('state','member','role',m.role,
      'me', jsonb_build_object('user_id',uid,'name',m.name,'wage',m.wage,'email',m.email),
      'company', jsonb_build_object('id',comp.id,'name',comp.name,'settings',comp.settings,'settings_rev',comp.settings_rev));
  end if;

  select * into inv from invites where lower(email) = uemail and accepted_at is null
    order by created_at desc limit 1;
  if found then
    insert into members (company_id, user_id, role, name, email)
    values (inv.company_id, uid, inv.role, coalesce(nullif(display_name,''), split_part(uemail,'@',1)), uemail)
    returning * into m;
    update invites set accepted_at = now() where id = inv.id;
    select * into comp from companies where id = m.company_id;
    return jsonb_build_object('state','member','role',m.role,
      'me', jsonb_build_object('user_id',uid,'name',m.name,'wage',m.wage,'email',m.email),
      'company', jsonb_build_object('id',comp.id,'name',comp.name,'settings',comp.settings,'settings_rev',comp.settings_rev));
  end if;

  if exists (select 1 from access_grants where lower(email) = uemail and active) then
    insert into companies (name, owner_id) values ('', uid) returning * into comp;
    insert into members (company_id, user_id, role, name, email)
    values (comp.id, uid, 'owner', coalesce(nullif(display_name,''), split_part(uemail,'@',1)), uemail)
    returning * into m;
    return jsonb_build_object('state','member','role','owner',
      'me', jsonb_build_object('user_id',uid,'name',m.name,'wage',m.wage,'email',m.email),
      'company', jsonb_build_object('id',comp.id,'name',comp.name,'settings',comp.settings,'settings_rev',comp.settings_rev));
  end if;

  return jsonb_build_object('state','denied','email',uemail);
end $$;

-- members can rename themselves (name only — wage stays owner-controlled)
create or replace function public.set_my_name(new_name text)
returns void language sql security definer set search_path = public as
$$ update members set name = new_name where user_id = auth.uid() $$;

-- realtime on jobs (owner dashboards see live updates; RLS still applies)
do $$ begin
  alter publication supabase_realtime add table public.jobs;
exception when duplicate_object then null; end $$;
