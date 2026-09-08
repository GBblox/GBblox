alter table sales add column if not exists rm_order_id text;
alter table sales add column if not exists rm_tracking text;
alter table sales add column if not exists rm_service text;
alter table sales add column if not exists rm_label_pdf text;
alter table sales add column if not exists rm_label_at timestamptz;
