alter table lego_sets add column if not exists comes_with_instructions text not null default 'na';
alter table lego_sets add column if not exists comes_with_box text not null default 'na';
