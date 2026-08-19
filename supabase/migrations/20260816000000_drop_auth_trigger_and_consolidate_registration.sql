-- Consolidate registration provisioning into the register-business Edge Function.
-- Drop the automatic on_auth_user_created trigger so that no auth user is
-- silently turned into a Business Owner without the explicit registration
-- flow. Workers and Admins are created outside this trigger and must not
-- accidentally receive a tenant business.

drop trigger if exists on_auth_user_created on auth.users;

comment on function public.handle_new_owner() is
  'Retained for reference only. Registration is now handled exclusively by the register-business Edge Function.';
