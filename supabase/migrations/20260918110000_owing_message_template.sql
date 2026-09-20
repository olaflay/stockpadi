alter table public.business_profile
  add column if not exists owing_message_template text not null default 'Hi {{customerName}}, gentle reminder from {{businessName}}. Your balance is {{amountOwed}}. Please pay when convenient. Thank you.';

comment on column public.business_profile.owing_message_template is 'Owner-editable debt reminder template. Supported variables: customerName, businessName, amountOwed.';
