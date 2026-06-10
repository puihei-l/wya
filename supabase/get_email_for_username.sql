-- Run this in the Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_email_for_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT u.email INTO v_email
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(p.username) = lower(p_username);
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_email_for_username TO anon, authenticated;
