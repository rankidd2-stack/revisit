-- One visit per asset, service and day: two syncs running at once cannot double-insert.
create unique index visits_one_per_day on visits (clinic_id, asset_id, service_category_id, visited_on);
