-- Database wiring 2 redesign (docs/DECISIONS.md, 2026-10-31 direction; R111, R112, G43, G44).
-- A recall send records the cycle it belongs to: the visit the step was computed from and the
-- service. A send counts toward a cycle only when both equal the asset's current last visit and
-- service, so no date comparison decides after the fact which cycle a past text belonged to.

alter table sends add column cycle_visit_on date;
alter table sends add column service_category_id uuid;
alter table sends add constraint sends_service_same_clinic
  foreign key (clinic_id, service_category_id) references service_categories (clinic_id, id);

-- New recall rows must carry both; other kinds carry neither. Old rows are left alone (NOT VALID).
alter table sends add constraint recall_cycle_recorded check (
  (kind = 'recall' and cycle_visit_on is not null and service_category_id is not null)
  or (kind <> 'recall' and cycle_visit_on is null and service_category_id is null)) not valid;

-- The stored cycle must agree with the rule it was sent under, at the moment it is written:
-- the rule's service, and a due date that is the cycle visit plus the rule's interval.
-- Once written, neither column can change.
create function recall_send_cycle_matches_rule() returns trigger language plpgsql as $$
declare r record;
begin
  if tg_op = 'UPDATE' then
    if new.cycle_visit_on is distinct from old.cycle_visit_on
       or new.service_category_id is distinct from old.service_category_id then
      raise exception 'a send''s cycle cannot change';
    end if;
    return new;
  end if;
  if new.kind = 'recall' then
    select service_category_id, interval_days into r from recall_rules
     where clinic_id = new.clinic_id and id = new.recall_rule_id;
    if not found then raise exception 'recall send needs a rule of the same clinic'; end if;
    if new.service_category_id is distinct from r.service_category_id then
      raise exception 'recall send service must be the rule''s service';
    end if;
    if new.cycle_due_on is distinct from new.cycle_visit_on + r.interval_days then
      raise exception 'recall send due date must be the cycle visit plus the rule''s interval';
    end if;
  end if;
  return new;
end $$;
create trigger sends_recall_cycle before insert or update on sends
  for each row execute function recall_send_cycle_matches_rule();

-- A recall rule's service never changes (G43, R112): moving an approved rule to another service
-- would keep its approval and carry its send history along. A replacement is a new rule.
create function recall_rule_service_fixed() returns trigger language plpgsql as $$
begin
  if new.service_category_id is distinct from old.service_category_id then
    raise exception 'a recall rule''s service cannot change; create a new rule instead';
  end if;
  return new;
end $$;
create trigger recall_rules_service_fixed before update of service_category_id on recall_rules
  for each row execute function recall_rule_service_fixed();

create index on sends (clinic_id, asset_id, service_category_id, cycle_visit_on) where kind = 'recall';
