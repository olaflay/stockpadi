-- Offline devices can submit separate product IDs for the same reference.
-- Fail migration on legacy collisions so their ledger links can be reconciled
-- explicitly before release.
create unique index products_business_normalized_sku_unique
  on public.products (business_id, lower(btrim(sku)));

create unique index products_business_normalized_barcode_unique
  on public.products (business_id, lower(btrim(barcode)))
  where nullif(btrim(barcode), '') is not null;
