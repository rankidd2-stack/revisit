-- Values the send gate reads must be real and well-formed, so no check can fail open on them.

-- 'infinity' is a valid timestamptz but makes every age and window comparison meaningless.
alter table sync_runs add constraint sync_runs_finished_finite check (finished_at is null or isfinite(finished_at));
alter table consent_events add constraint consent_recorded_finite check (isfinite(recorded_at));
alter table sends add constraint sends_sent_finite check (isfinite(sent_at));
alter table campaigns add constraint campaigns_scheduled_finite check (scheduled_for is null or isfinite(scheduled_for));
alter table appointments add constraint appointments_starts_finite check (isfinite(starts_at));

-- A clinic may tighten the staleness pause, never switch it off (locked decision 10).
alter table clinics add constraint sync_stale_bounds check (sync_stale_after_hours between 1 and 72);

-- Erased contacts' opt-outs are matched on these snapshots, so they use the same formats as
-- contacts and mutes.
alter table consent_events add constraint consent_mobile_snapshot_format check (mobile_snapshot is null or mobile_snapshot ~ '^639[0-9]{9}$');
alter table consent_events add constraint consent_email_snapshot_format check (email_snapshot is null or email_snapshot = lower(btrim(email_snapshot)));
