-- Patient texts carry only approved wording plus three derived variables (docs/DECISIONS.md, 2026-10-31).

-- An approved template may use {first_name}, {pet_name} and {clinic} and no other braces.
-- Existing rows are left alone (NOT VALID); new and edited approved rows are checked.
alter table recall_rules add constraint recall_template_vars check (
  approved_by is null or regexp_replace(template, '\{(first_name|pet_name|clinic)\}', '', 'g') !~ '[{}]') not valid;
alter table campaigns add constraint campaign_body_vars check (
  approved_by is null or regexp_replace(body, '\{(first_name|pet_name|clinic)\}', '', 'g') !~ '[{}]') not valid;

-- {clinic} is clinics.name. A name that hits the sensitive list needs a named person's confirmation,
-- stored with when; renaming the clinic clears it so the new name is judged again.
alter table clinics add column display_name_confirmed_by text check (char_length(btrim(display_name_confirmed_by)) > 0);
alter table clinics add column display_name_confirmed_at timestamptz;
alter table clinics add constraint display_name_confirmation_pair check (
  (display_name_confirmed_by is null) = (display_name_confirmed_at is null));

create function reset_display_name_confirmation() returns trigger language plpgsql as $$
begin
  -- A new clinic starts unconfirmed: confirming is its own save, after the name is set.
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    new.display_name_confirmed_by := null;
    new.display_name_confirmed_at := null;
  end if;
  return new;
end $$;
create trigger clinics_display_name_confirmation before insert or update on clinics
  for each row execute function reset_display_name_confirmation();
