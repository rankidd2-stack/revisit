-- One active recall rule per service (locked decision 11, R107): two active rules for the same
-- service would run two sequences and text the same patient twice. Replacing a rule means
-- deactivating the old one first; the recall queue counts sends under any rule for the service,
-- so a replacement never restarts a sequence. Fails loudly if a database already holds two.
create unique index recall_rules_one_active_per_service on recall_rules (clinic_id, service_category_id) where active;
