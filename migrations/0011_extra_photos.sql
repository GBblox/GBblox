alter table lego_sets add column if not exists extra_photos text not null default '[]';
