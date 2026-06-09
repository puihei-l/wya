-- Run this in the Supabase SQL Editor
-- Fixes infinite recursion in hangout_groups RLS that prevented friends from seeing hangouts

DROP POLICY "hangout_groups: select" ON hangout_groups;

-- No back-reference to hangouts (avoids infinite recursion).
-- Creators are auto-added as group members, so they pass this check too.
CREATE POLICY "hangout_groups: select"
  ON hangout_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM friend_group_members fgm
      WHERE fgm.group_id = hangout_groups.group_id
        AND fgm.user_id = auth.uid()
    )
  );
