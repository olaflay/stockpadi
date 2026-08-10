-- Supabase migration to add Super Admin role and policies
--
-- The app_role enum addition now lives in the preceding migration
-- (20260809125900_super_admin_role_enum.sql) — see that file's comment.
-- Postgres does not allow a new enum value to be used in the same
-- transaction that adds it, and this file's CREATE FUNCTION/INSERT bodies
-- below reference 'super_admin'.

-- 2. Add is_active column to business_profile
ALTER TABLE public.business_profile ADD COLUMN IF NOT EXISTS is_active boolean not null default true;

-- 2. Define the is_super_admin check function
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT coalesce(auth_role() = 'super_admin', false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 3. Update handle_new_owner trigger to support super_admin
CREATE OR REPLACE FUNCTION public.handle_new_owner()
RETURNS trigger AS $$
DECLARE
  v_business_id uuid;
  v_role text;
BEGIN
  -- No default here: the original function only auto-created a business
  -- when role was explicitly 'owner', and any auth.users row lacking
  -- metadata (an internal script, a test fixture, a future admin-API call)
  -- must not silently become an owner with a fresh "My Store" business.
  v_role := new.raw_user_meta_data->>'role';

  IF v_role = 'super_admin' THEN
    -- Make sure system business profile exists
    INSERT INTO public.business_profile (id, name, business_type, currency)
    VALUES ('00000000-0000-0000-0000-000000000000', 'StockPadi System', 'general_retail', 'NGN')
    ON CONFLICT (id) DO NOTHING;
    
    INSERT INTO public.users (id, business_id, full_name, role, is_active)
    VALUES (new.id, '00000000-0000-0000-0000-000000000000', coalesce(new.raw_user_meta_data->>'full_name', 'Super Admin'), 'super_admin', true);
  ELSIF v_role = 'owner' THEN
    INSERT INTO public.business_profile (name, business_type, currency)
    VALUES (
      coalesce(new.raw_user_meta_data->>'business_name', 'My Store'),
      coalesce(new.raw_user_meta_data->>'business_type_id', 'general_retail'),
      'NGN'
    ) RETURNING id INTO v_business_id;

    INSERT INTO public.users (id, business_id, full_name, role, is_active)
    VALUES (new.id, v_business_id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'owner', true);

    INSERT INTO public.branches (business_id, name, is_active)
    VALUES (v_business_id, 'Main branch', true);
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create RLS policies for super admins to manage businesses, branches, users, and user_branches
CREATE POLICY super_admin_all_business_profile ON public.business_profile 
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY super_admin_all_branches ON public.branches 
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY super_admin_all_users ON public.users 
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY super_admin_all_user_branches ON public.user_branches 
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
