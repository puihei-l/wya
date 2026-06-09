-- Run this in Supabase SQL Editor to diagnose visibility issues
-- Shows recent check-ins, which groups they were shared to, and who is in those groups

SELECT
  ci.id,
  ci.expires_at,
  ci.expires_at > now()        AS still_active,
  p_owner.username             AS creator,
  fg.name                      AS shared_to_group,
  p_member.username            AS group_member
FROM check_ins ci
JOIN profiles p_owner          ON p_owner.id = ci.user_id
JOIN check_in_groups cig       ON cig.check_in_id = ci.id
JOIN friend_groups fg          ON fg.id = cig.group_id
JOIN friend_group_members fgm  ON fgm.group_id = fg.id
JOIN profiles p_member         ON p_member.id = fgm.user_id
ORDER BY ci.created_at DESC
LIMIT 20;
