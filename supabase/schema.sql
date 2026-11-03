-- GramSutra community backend. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Farmer',
  village text not null default '',
  role text not null default 'Farmer',
  language text not null default 'English',
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_self_connection check (requester_id <> recipient_id),
  constraint unique_connection_pair unique (requester_id, recipient_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint no_self_message check (sender_id <> recipient_id)
);
create index if not exists messages_pair_time on public.messages(sender_id, recipient_id, created_at);
create index if not exists profiles_name on public.profiles using gin (to_tsvector('simple', display_name || ' ' || village));

create or replace function public.is_connected(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connection_requests c
    where c.status='accepted'
      and ((c.requester_id=a and c.recipient_id=b) or (c.requester_id=b and c.recipient_id=a))
  );
$$;
revoke all on function public.is_connected(uuid,uuid) from public;
grant execute on function public.is_connected(uuid,uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, village, role, language)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), 'Farmer'),
    coalesce(new.raw_user_meta_data->>'village',''),
    coalesce(new.raw_user_meta_data->>'role','Farmer'),
    coalesce(new.raw_user_meta_data->>'language','English')
  ) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_gramsutra on auth.users;
create trigger on_auth_user_created_gramsutra after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.connection_requests enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Profiles visible to signed-in users" on public.profiles;
create policy "Profiles visible to signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert to authenticated with check (id=auth.uid());
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists "Participants read requests" on public.connection_requests;
create policy "Participants read requests" on public.connection_requests for select to authenticated using (requester_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists "Send own requests" on public.connection_requests;
create policy "Send own requests" on public.connection_requests for insert to authenticated with check (requester_id=auth.uid());
drop policy if exists "Recipient or requester updates requests" on public.connection_requests;
drop policy if exists "Recipients respond to requests" on public.connection_requests;
create policy "Recipients respond to requests" on public.connection_requests for update to authenticated using (recipient_id=auth.uid() and status='pending') with check (recipient_id=auth.uid() and status in ('accepted','rejected'));

drop policy if exists "Connected users read messages" on public.messages;
create policy "Connected users read messages" on public.messages for select to authenticated using ((sender_id=auth.uid() or recipient_id=auth.uid()) and public.is_connected(sender_id,recipient_id));
drop policy if exists "Connected users send messages" on public.messages;
create policy "Connected users send messages" on public.messages for insert to authenticated with check (sender_id=auth.uid() and public.is_connected(sender_id,recipient_id));
drop policy if exists "Recipient marks messages read" on public.messages;
create policy "Recipient marks messages read" on public.messages for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

-- In Supabase Dashboard > Database > Replication, enable Realtime for public.messages.
-- Private Realtime broadcast policies: members can receive their own inbox;
-- only accepted connections can publish to each other's inbox or shared call room.
alter table realtime.messages enable row level security;
drop policy if exists "Read own GramSutra call inbox" on realtime.messages;
create policy "Read own GramSutra call inbox" on realtime.messages for select to authenticated
using (realtime.topic() = 'calls-inbox-' || auth.uid()::text
    or (realtime.topic() like 'calls-inbox-%' and public.is_connected(auth.uid(), split_part(realtime.topic(),'calls-inbox-',2)::uuid))
    or (realtime.topic() like 'call-room-%' and (split_part(split_part(realtime.topic(),'call-room-',2),'_',1)=auth.uid()::text or split_part(split_part(realtime.topic(),'call-room-',2),'_',2)=auth.uid()::text) and public.is_connected(auth.uid(), (case when split_part(split_part(realtime.topic(),'call-room-',2),'_',1)=auth.uid()::text then split_part(split_part(realtime.topic(),'call-room-',2),'_',2) else split_part(split_part(realtime.topic(),'call-room-',2),'_',1) end)::uuid)));
drop policy if exists "Send GramSutra call signals to connections" on realtime.messages;
create policy "Send GramSutra call signals to connections" on realtime.messages for insert to authenticated
with check (
  realtime.topic() = 'calls-inbox-' || auth.uid()::text
  or (realtime.topic() = 'calls-inbox-' || split_part(realtime.topic(),'calls-inbox-',2)
      and exists (select 1 from public.connection_requests c where c.status='accepted'
        and ((c.requester_id=auth.uid() and c.recipient_id::text = split_part(realtime.topic(),'calls-inbox-',2))
          or (c.recipient_id=auth.uid() and c.requester_id::text = split_part(realtime.topic(),'calls-inbox-',2)))))
  or (realtime.topic() like 'call-room-%' and (split_part(split_part(realtime.topic(),'call-room-',2),'_',1)=auth.uid()::text or split_part(split_part(realtime.topic(),'call-room-',2),'_',2)=auth.uid()::text) and public.is_connected(auth.uid(), (case when split_part(split_part(realtime.topic(),'call-room-',2),'_',1)=auth.uid()::text then split_part(split_part(realtime.topic(),'call-room-',2),'_',2) else split_part(split_part(realtime.topic(),'call-room-',2),'_',1) end)::uuid))
);

-- Farmer marketplace: produce listings and equipment rentals.
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  listing_type text not null,
  title text not null check (char_length(title) between 2 and 120),
  category text not null default '',
  quantity text not null default '',
  price numeric(12,2) not null check (price >= 0),
  village text not null default '',
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'active' check (status in ('active','paused','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketplace_listings drop constraint if exists marketplace_listings_listing_type_check;
alter table public.marketplace_listings drop constraint if exists marketplace_listing_type_check;
alter table public.marketplace_listings add constraint marketplace_listing_type_check check (listing_type in ('produce','equipment','inputs'));
create index if not exists marketplace_active_type_created on public.marketplace_listings(status, listing_type, created_at desc);
create index if not exists marketplace_owner on public.marketplace_listings(owner_id, created_at desc);

create table if not exists public.listing_inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  response text not null default '' check (char_length(response) <= 2000),
  responded_at timestamptz,
  status text not null default 'new' check (status in ('new','replied','closed')),
  created_at timestamptz not null default now(),
  constraint no_self_inquiry check (sender_id <> owner_id)
);
alter table public.listing_inquiries add column if not exists response text not null default '';
alter table public.listing_inquiries add column if not exists responded_at timestamptz;
create index if not exists listing_inquiries_owner_time on public.listing_inquiries(owner_id, created_at desc);

alter table public.marketplace_listings enable row level security;
alter table public.listing_inquiries enable row level security;
drop policy if exists "Members view active marketplace listings" on public.marketplace_listings;
create policy "Members view active marketplace listings" on public.marketplace_listings for select to authenticated using (status='active' or owner_id=auth.uid());
drop policy if exists "Members create own marketplace listings" on public.marketplace_listings;
create policy "Members create own marketplace listings" on public.marketplace_listings for insert to authenticated with check (owner_id=auth.uid());
drop policy if exists "Owners update own marketplace listings" on public.marketplace_listings;
create policy "Owners update own marketplace listings" on public.marketplace_listings for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists "Owners delete own marketplace listings" on public.marketplace_listings;
create policy "Owners delete own marketplace listings" on public.marketplace_listings for delete to authenticated using (owner_id=auth.uid());

drop policy if exists "Inquiry parties can read inquiries" on public.listing_inquiries;
create policy "Inquiry parties can read inquiries" on public.listing_inquiries for select to authenticated using (sender_id=auth.uid() or owner_id=auth.uid());
drop policy if exists "Members can inquire on active listings" on public.listing_inquiries;
create policy "Members can inquire on active listings" on public.listing_inquiries for insert to authenticated with check (
  sender_id=auth.uid() and sender_id<>owner_id and exists (
    select 1 from public.marketplace_listings l where l.id=listing_inquiries.listing_id and l.owner_id=listing_inquiries.owner_id and l.status='active'
  )
);
drop policy if exists "Listing owners can update inquiry status" on public.listing_inquiries;
create policy "Listing owners can update inquiry status" on public.listing_inquiries for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());

-- A private, account-synced copy of a farmer's calendar; the browser keeps an offline copy too.
create table if not exists public.farm_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  due_date date not null,
  category text not null default 'Other',
  is_done boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists farm_tasks_user_date on public.farm_tasks(user_id, due_date);
alter table public.farm_tasks enable row level security;
drop policy if exists "Farmers manage their own tasks" on public.farm_tasks;
create policy "Farmers manage their own tasks" on public.farm_tasks for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- If the marketplace and calendar tables are added after the app is already live,
-- re-run this file safely: all additions and policies above are idempotent.
