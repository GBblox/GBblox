create table if not exists lego_sets (
  id serial primary key,
  set_num text not null,
  name text not null,
  year integer,
  theme text,
  theme_id integer,
  num_parts integer,
  image_url text,
  condition text not null default 'used_complete',
  qty integer not null default 1,
  asking_price numeric,
  currency text not null default 'USD',
  used_price numeric,
  used_price_min numeric,
  used_price_max numeric,
  used_price_source text,
  used_price_at timestamptz,
  retail_price numeric,
  notes text not null default '',
  status text not null default 'for_sale',
  ebay_item_id text,
  ebay_listing_url text,
  ebay_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lego_sets_status_idx on lego_sets (status);
create index if not exists lego_sets_set_num_idx on lego_sets (set_num);
create index if not exists lego_sets_created_at_idx on lego_sets (created_at desc);
