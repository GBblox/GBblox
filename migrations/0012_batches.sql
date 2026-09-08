create table if not exists purchase_batches (
  id serial primary key,
  batch_number text not null unique,
  purchased_on date not null default current_date,
  platform text not null,
  payment_method text not null,
  order_number text not null default '',
  seller_name text not null default '',
  seller_line1 text not null default '',
  seller_line2 text not null default '',
  seller_city text not null default '',
  seller_region text not null default '',
  seller_postal text not null default '',
  seller_country text not null default 'GB',
  price numeric,
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_batches_number_idx on purchase_batches (batch_number);
create index if not exists purchase_batches_date_idx on purchase_batches (purchased_on desc);

alter table lego_sets add column if not exists batch_number text not null default '';
create index if not exists lego_sets_batch_number_idx on lego_sets (batch_number);
