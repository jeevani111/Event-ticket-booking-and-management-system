-- Event Ticket Booking and Management System
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  email text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  venue text not null check (char_length(venue) between 1 and 120),
  event_date timestamptz not null,
  price numeric(10,2) not null check (price >= 0),
  total_seats int not null check (total_seats > 0),
  available_seats int not null check (available_seats >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_seats <= total_seats)
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references events(id) on delete restrict,
  quantity int not null check (quantity between 1 and 10),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_events_date on events(event_date);
create index if not exists idx_bookings_user on bookings(user_id);
create index if not exists idx_bookings_event on bookings(event_id);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_events_updated on events;
create trigger trg_events_updated before update on events
  for each row execute function set_updated_at();

-- Atomic booking: locks the event row so seats can never go negative
create or replace function book_tickets(p_user uuid, p_event uuid, p_qty int)
returns bookings as $$
declare ev events; b bookings;
begin
  select * into ev from events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if ev.event_date <= now() then raise exception 'EVENT_PASSED'; end if;
  if ev.available_seats < p_qty then raise exception 'NOT_ENOUGH_SEATS'; end if;
  update events set available_seats = available_seats - p_qty where id = p_event;
  insert into bookings(user_id, event_id, quantity, total_amount)
    values (p_user, p_event, p_qty, ev.price * p_qty) returning * into b;
  return b;
end; $$ language plpgsql;

-- Atomic cancel: returns seats to the event
create or replace function cancel_booking(p_user uuid, p_booking uuid, p_admin boolean)
returns bookings as $$
declare b bookings;
begin
  select * into b from bookings
    where id = p_booking and (user_id = p_user or p_admin) for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;
  update events set available_seats = available_seats + b.quantity where id = b.event_id;
  update bookings set status = 'cancelled' where id = b.id returning * into b;
  return b;
end; $$ language plpgsql;

-- Only the backend (service role) may call these functions
revoke all on function book_tickets(uuid, uuid, int) from public, anon, authenticated;
revoke all on function cancel_booking(uuid, uuid, boolean) from public, anon, authenticated;

-- Row Level Security: no policies = the public/anon key can read nothing.
alter table users enable row level security;
alter table events enable row level security;
alter table bookings enable row level security;

-- DEMO DATA (delete or replace with your own events)
insert into events (title, description, venue, event_date, price, total_seats, available_seats) values
 ('Demo: Campus Music Night', 'Live bands from college clubs.', 'Main Auditorium', now() + interval '10 days', 150, 100, 100),
 ('Demo: Tech Fest Keynote', 'Talks from industry speakers.', 'Seminar Hall', now() + interval '20 days', 0, 50, 50);

-- MAKE YOURSELF ADMIN: register on the website first, then run:
-- update users set role = 'admin' where email = 'your@email.com';
