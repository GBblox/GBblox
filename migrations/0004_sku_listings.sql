alter table lego_sets add column if not exists sku text;
alter table lego_sets add column if not exists ebay_listed boolean not null default false;
alter table lego_sets add column if not exists ebay_listing_status text;
alter table lego_sets add column if not exists ebay_synced_at timestamptz;
alter table lego_sets add column if not exists bl_listed boolean not null default false;
alter table lego_sets add column if not exists bl_inventory_id text;
alter table lego_sets add column if not exists bl_listing_url text;
alter table lego_sets add column if not exists bl_listing_status text;
alter table lego_sets add column if not exists bl_synced_at timestamptz;

update lego_sets
set sku = 'BS-' || regexp_replace(set_num, '-1$', '') || '-' || lpad(id::text, 4, '0')
where sku is null or sku = '';

update lego_sets
set ebay_listed = true,
    ebay_listing_status = 'listed'
where ebay_item_id is not null
  and (ebay_listed is not true);

create unique index if not exists lego_sets_sku_uidx on lego_sets (sku);
