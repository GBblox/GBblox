alter table lego_sets add column if not exists location text not null default '';
alter table lego_sets alter column currency set default 'GBP';
