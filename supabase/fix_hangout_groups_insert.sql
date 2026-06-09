-- Run this in the Supabase SQL Editor

DROP POLICY IF EXISTS "hangout_groups: creator insert" ON hangout_groups;

CREATE OR REPLACE FUNCTION link_hangout_to_groups(p_hangout_id UUID, p_group_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hangouts WHERE id = p_hangout_id AND creator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO hangout_groups (hangout_id, group_id)
  SELECT p_hangout_id, unnest(p_group_ids)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION link_hangout_to_groups TO authenticated;
