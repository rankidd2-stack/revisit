-- Revisit foundation schema (Postgres / Supabase compatible)
-- Data minimization: no diagnoses, notes, prescriptions or photos anywhere in this schema.

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vertical text not null check (vertical in ('dental','vet','aesthetic','other')),
  sender_name text check (char_length(sender_name) <= 11),  -- registered SMS sender name
  sender_name_status text not null default 'none' check (sender_name_status in ('none','pending','approved')),
  reply_phone text,                      -- clinic's own number shown in every text
  reply_email text,
  messenger_url text,
  google_review_url text,
  timezone text not null default 'Asia/Manila',
  name_treatments_in_sms boolean not null default false,  -- lock-screen privacy opt-in
  testimonials_enabled boolean not null default false,    -- off by default; off for dental until legal check
  marketing_cap_per_30d int not null default 2,
  sync_stale_after_hours int not null default 72,
  created_at timestamptz not null default now(),
  -- testimonials stay off for dental until a legal check (locked decision 7)
  constraint no_dental_testimonials check (not (vertical = 'dental' and testimonials_enabled))
);

-- Tags come from a vocabulary the clinic defines, never free text about a patient.
create table clinic_tags (
  clinic_id uuid not null references clinics(id) on delete cascade,
  tag text not null check (char_length(tag) <= 40),
  primary key (clinic_id, tag)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  full_name text not null,
  display_name text,                     -- first name + last initial, for testimonials
  mobile text,                           -- 639XXXXXXXXX
  email text,
  external_ref text,                     -- id in the clinic's own system
  tags text[] not null default '{}',     -- app validates against clinic_tags
  status text not null default 'active' check (status in ('active','moved','deceased','do_not_contact')),
  created_at timestamptz not null default now(),
  unique (clinic_id, mobile)
);

-- Assets: the contact themself, a pet, a child, a package. Recall attaches here.
create table assets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in ('self','dependent','pet','package','other')),
  label text not null,                   -- "Self", "Bantay", "Mika (daughter)"
  species text,                          -- vets only
  active boolean not null default true
);

-- Service category only, never clinical detail.
create table recall_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  service_category text not null,        -- "Dental check-up", "Rabies vaccine"
  interval_days int not null check (interval_days > 0),
  step_offsets_days int[] not null default '{-7,0,14,60}',
  active boolean not null default true
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  service_category text not null,
  visited_on date not null,
  source text not null default 'sync'
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  service_category text not null,
  starts_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','confirmed','cancelled','completed','no_show'))
);

-- Consent ledger: append-only. Latest row per (contact, purpose) wins.
create table consent_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,  -- the proof outlives the contact
  mobile_snapshot text,                  -- who consented, kept if the contact is deleted
  email_snapshot text,
  purpose text not null check (purpose in ('service','marketing','testimonial')),
  granted boolean not null,
  channel text not null,                 -- intake_form, qr, sms_yes, stop_link, staff, google_form
  text_version text not null,            -- which consent wording the person saw
  captured_by text,                      -- staff user id, or 'patient' for self-service
  recorded_at timestamptz not null default now()
);

create function forbid_consent_changes() returns trigger language plpgsql as $$
begin
  raise exception 'consent_events is append-only';
end $$;
create trigger consent_events_append_only before update or delete on consent_events
  for each row execute function forbid_consent_changes();

-- Mute list lives here and survives every re-import.
create table mutes (
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('mobile','email')),
  value text not null,                   -- 639XXXXXXXXX or lowercased email
  reason text not null,                  -- stop_link, staff, deceased, moved
  muted_at timestamptz not null default now(),
  primary key (clinic_id, kind, value)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('reminder','recall','marketing','feedback')),
  name text not null,
  announcement_type text check (announcement_type in ('spotlight','new_service','clinic_news','care_tip','free_event')),
  body text not null,
  status text not null default 'draft' check (status in ('draft','pending_approval','scheduled','live','paused','ended')),
  approved_by text,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  constraint marketing_is_announcement check (kind <> 'marketing' or announcement_type is not null)
);

-- Every send is logged here; dedupe and caps read from this table.
create table sends (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null,
  channel text not null check (channel in ('sms','email')),
  provider_message_id text,
  segments int,
  status text not null default 'queued',
  sent_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  source text not null,                  -- csv, google_sheet, webhook
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  rows_in int,
  rows_rejected int,
  error_code text check (char_length(error_code) <= 64)  -- a code only, never row content
);

create index on sends (clinic_id, contact_id, sent_at);
create index on visits (asset_id, visited_on desc);
create index on consent_events (contact_id, purpose, recorded_at desc);
