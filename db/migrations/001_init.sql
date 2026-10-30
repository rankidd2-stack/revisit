-- Revisit foundation schema (Postgres / Supabase compatible)
-- Data minimization: no diagnoses, notes, prescriptions or photos anywhere in this schema.
-- Tenant integrity: every child row carries clinic_id and references its parent by (clinic_id, id),
-- so a row can never point at another clinic's data.

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
  testimonials_enabled boolean not null default false,
  marketing_cap_per_30d int not null default 2 check (marketing_cap_per_30d between 0 and 8),
  sync_stale_after_hours int not null default 72,
  created_at timestamptz not null default now(),
  -- testimonials stay off for dental until a legal check (locked decision 7)
  constraint no_dental_testimonials check (not (vertical = 'dental' and testimonials_enabled))
);

-- Editing a registered sender name puts it back to pending until the new name is registered.
create function reset_sender_status() returns trigger language plpgsql as $$
begin
  if new.sender_name is distinct from old.sender_name and new.sender_name_status = old.sender_name_status then
    new.sender_name_status := case when new.sender_name is null then 'none' else 'pending' end;
  end if;
  return new;
end $$;
create trigger clinics_sender_reset before update of sender_name on clinics
  for each row execute function reset_sender_status();

-- The clinic's own service list. Visits, appointments and recall rules can only use these names,
-- so free-text clinical detail has nowhere to go.
create table service_categories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  unique (clinic_id, id),
  unique (clinic_id, name)
);

-- Tags come from a vocabulary the clinic defines, never free text about a patient.
create table clinic_tags (
  clinic_id uuid not null references clinics(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 40),
  primary key (clinic_id, tag)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  full_name text not null,
  display_name text,                     -- first name + last initial, for testimonials
  mobile text check (mobile ~ '^639[0-9]{9}$'),
  email text check (email = lower(email)),
  external_ref text,                     -- id in the clinic's own system
  status text not null default 'active' check (status in ('active','moved','deceased','do_not_contact')),
  created_at timestamptz not null default now(),
  check (mobile is not null or email is not null),
  unique (clinic_id, id),
  unique (clinic_id, mobile)
);
create unique index contacts_clinic_email on contacts (clinic_id, email) where email is not null;

create table contact_tags (
  clinic_id uuid not null,
  contact_id uuid not null,
  tag text not null,
  primary key (clinic_id, contact_id, tag),
  foreign key (clinic_id, contact_id) references contacts (clinic_id, id) on delete cascade,
  foreign key (clinic_id, tag) references clinic_tags (clinic_id, tag) on delete cascade
);

-- Assets: the contact themself, a pet, a child, a package. Recall attaches here.
create table assets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  contact_id uuid not null,
  kind text not null check (kind in ('self','dependent','pet','package','other')),
  label text not null check (char_length(label) <= 60),   -- "Self", "Bantay", "Mika (daughter)"
  species text check (species in ('dog','cat','bird','rabbit','other')),
  active boolean not null default true,
  unique (clinic_id, id),
  unique (clinic_id, contact_id, id),
  foreign key (clinic_id, contact_id) references contacts (clinic_id, id) on delete cascade
);

create table recall_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  service_category_id uuid not null,
  interval_days int not null check (interval_days > 0),
  step_offsets_days int[] not null default '{-7,0,14,60}',
  template text not null check (char_length(template) between 1 and 459),  -- the approved wording
  active boolean not null default false,
  approved_by text check (char_length(trim(approved_by)) > 0),  -- automation approval (locked decision 12)
  check (not active or approved_by is not null),
  unique (clinic_id, id),
  foreign key (clinic_id, service_category_id) references service_categories (clinic_id, id)
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  asset_id uuid not null,
  service_category_id uuid not null,
  visited_on date not null check (visited_on >= date '2000-01-01'),
  source text not null default 'sync',
  unique (clinic_id, id),
  foreign key (clinic_id, asset_id) references assets (clinic_id, id) on delete cascade,
  foreign key (clinic_id, service_category_id) references service_categories (clinic_id, id)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  asset_id uuid not null,
  service_category_id uuid not null,
  starts_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','confirmed','cancelled','completed','no_show')),
  unique (clinic_id, id),
  foreign key (clinic_id, asset_id) references assets (clinic_id, id) on delete cascade,
  foreign key (clinic_id, service_category_id) references service_categories (clinic_id, id)
);

-- Consent ledger: append-only. Latest row per (contact, purpose) wins.
create table consent_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete restrict,
  contact_id uuid,                       -- the proof outlives the contact (FK below sets this null)
  mobile_snapshot text,                  -- who consented, kept if the contact is deleted
  email_snapshot text,
  purpose text not null check (purpose in ('service','marketing','testimonial')),
  granted boolean not null,
  channel text not null check (channel in ('intake_form','qr','sms_yes','stop_link','staff','google_form')),
  text_version text not null,            -- which consent wording the person saw
  captured_by text not null check (char_length(trim(captured_by)) > 0),  -- staff user id, or 'patient'
  recorded_at timestamptz not null default now(),
  foreign key (clinic_id, contact_id) references contacts (clinic_id, id) on delete set null (contact_id)
);

-- Rows can never be edited or deleted, with one exception: the foreign key may be cleared when a
-- contact is erased (DPA erasure request), so the snapshot keeps the proof without the link.
create function forbid_consent_changes() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.contact_id is null and old.contact_id is not null
     and (to_jsonb(new) - 'contact_id') = (to_jsonb(old) - 'contact_id')
     and not exists (select 1 from contacts where id = old.contact_id) then
    return new;
  end if;
  raise exception 'consent_events is append-only';
end $$;
create trigger consent_events_append_only before update or delete on consent_events
  for each row execute function forbid_consent_changes();

create function forbid_consent_truncate() returns trigger language plpgsql as $$
begin
  raise exception 'consent_events is append-only';
end $$;
create trigger consent_events_no_truncate before truncate on consent_events
  for each statement execute function forbid_consent_truncate();

-- Mute list lives here and survives every re-import.
create table mutes (
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('mobile','email')),
  value text not null,                   -- 639XXXXXXXXX or lowercased email
  reason text not null check (reason in ('stop_link','staff','deceased','moved')),
  muted_at timestamptz not null default now(),
  primary key (clinic_id, kind, value),
  check ((kind = 'mobile' and value ~ '^639[0-9]{9}$') or (kind = 'email' and value = lower(value) and value like '%@%'))
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null default 'marketing' check (kind = 'marketing'),  -- reminders, recalls and feedback are automations, not campaigns
  name text not null,
  announcement_type text check (announcement_type in ('spotlight','new_service','clinic_news','care_tip','free_event')),
  body text not null,
  status text not null default 'draft' check (status in ('draft','pending_approval','scheduled','live','paused','ended')),
  approved_by text check (char_length(trim(approved_by)) > 0),
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  constraint marketing_is_announcement check (kind <> 'marketing' or announcement_type is not null),
  constraint live_needs_approval check (status not in ('scheduled','live') or approved_by is not null)
);

-- Changing approved wording withdraws the approval (locked decision 12): the text a patient gets
-- is always the text a person approved.
create function withdraw_campaign_approval() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body and new.approved_by is not distinct from old.approved_by then
    new.approved_by := null;
    if new.status in ('scheduled','live','pending_approval') then new.status := 'draft'; end if;
  end if;
  return new;
end $$;
create trigger campaigns_body_change before update of body on campaigns
  for each row execute function withdraw_campaign_approval();

create function withdraw_rule_approval() returns trigger language plpgsql as $$
begin
  if (new.template is distinct from old.template or new.interval_days <> old.interval_days
      or new.step_offsets_days is distinct from old.step_offsets_days)
     and new.approved_by is not distinct from old.approved_by then
    new.approved_by := null;
    new.active := false;
  end if;
  return new;
end $$;
create trigger recall_rules_change before update on recall_rules
  for each row execute function withdraw_rule_approval();

-- Every send is logged against an event (locked decision 11). The event key is unique per contact:
--   campaign:<campaign_id> | recall:<asset_id>:<rule_id>:<due_on>:<step> | reminder:<appointment_id>:<slot> | feedback:<visit_id>
create table sends (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  contact_id uuid not null,
  event_key text not null check (event_key ~ '^(campaign|recall|reminder|feedback):'),
  kind text not null check (kind in ('reminder','recall','marketing','feedback')),
  campaign_id uuid,
  asset_id uuid,
  recall_rule_id uuid,
  cycle_due_on date,
  step_offset_days int,
  channel text not null check (channel in ('sms','email')),
  approved_by text not null check (char_length(trim(approved_by)) > 0),
  stale_ack_by text check (char_length(trim(stale_ack_by)) > 0),  -- who sent while sync was stale
  provider_message_id text,
  segments int check (segments >= 0),
  status text not null default 'queued' check (status in ('queued','accepted','sent','failed','refunded')),
  sent_at timestamptz not null default now(),
  unique (clinic_id, contact_id, event_key),
  foreign key (clinic_id, contact_id) references contacts (clinic_id, id) on delete cascade,
  foreign key (clinic_id, campaign_id) references campaigns (clinic_id, id),
  foreign key (clinic_id, contact_id, asset_id) references assets (clinic_id, contact_id, id) on delete set null (asset_id),
  foreign key (clinic_id, recall_rule_id) references recall_rules (clinic_id, id),
  -- asset_id is not in this check, so a pet or dependent can still be deleted later (set null);
  -- the insert trigger below requires it on new recall rows.
  check (kind <> 'recall' or (recall_rule_id is not null and cycle_due_on is not null and step_offset_days is not null)),
  check (kind <> 'marketing' or campaign_id is not null),
  -- the kind must match the event, so a promo can never be logged (or gated) as a reminder
  constraint kind_matches_event check (
    (kind = 'marketing' and event_key like 'campaign:%') or
    (kind = 'recall'    and event_key like 'recall:%') or
    (kind = 'reminder'  and event_key like 'reminder:%') or
    (kind = 'feedback'  and event_key like 'feedback:%')),
  -- the key is built from the columns, so the unique index really means one send per campaign / recall step
  constraint marketing_key_matches check (kind <> 'marketing' or event_key = 'campaign:' || campaign_id::text),
  constraint recall_key_matches check (kind <> 'recall' or event_key =
    'recall:' || coalesce(asset_id::text, split_part(event_key, ':', 2)) || ':' || recall_rule_id::text
    || ':' || to_char(cycle_due_on, 'YYYY-MM-DD') || ':' || step_offset_days::text)
);

create function recall_send_needs_asset() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.kind <> old.kind or new.event_key <> old.event_key or new.contact_id <> old.contact_id then
      raise exception 'a send''s kind, event and contact cannot change';
    end if;
    if new.asset_id is distinct from old.asset_id and new.asset_id is not null then
      raise exception 'a send''s asset can only be cleared';
    end if;
  elsif new.kind = 'recall' and new.asset_id is null then
    raise exception 'recall sends must reference an asset';
  end if;
  return new;
end $$;
create trigger sends_recall_asset before insert or update on sends
  for each row execute function recall_send_needs_asset();

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  source text not null check (source in ('csv','google_sheet','webhook')),
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
