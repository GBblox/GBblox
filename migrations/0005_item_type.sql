alter table lego_sets add column if not exists item_type text not null default 'set';
create index if not exists lego_sets_item_type_idx on lego_sets (item_type);
