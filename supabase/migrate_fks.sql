-- Fix foreign keys: point user-related FKs to public.profiles(id) instead of auth.users(id)
-- so PostgREST can traverse relationships for embedded selects.
-- Run this in: Supabase Dashboard → SQL Editor

ALTER TABLE friend_groups
  DROP CONSTRAINT IF EXISTS friend_groups_owner_id_fkey,
  ADD CONSTRAINT friend_groups_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE friend_group_members
  DROP CONSTRAINT IF EXISTS friend_group_members_user_id_fkey,
  ADD CONSTRAINT friend_group_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE friend_group_members
  DROP CONSTRAINT IF EXISTS friend_group_members_added_by_fkey,
  ADD CONSTRAINT friend_group_members_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES public.profiles (id);

ALTER TABLE check_ins
  DROP CONSTRAINT IF EXISTS check_ins_user_id_fkey,
  ADD CONSTRAINT check_ins_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE hangouts
  DROP CONSTRAINT IF EXISTS hangouts_creator_id_fkey,
  ADD CONSTRAINT hangouts_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE hangout_participants
  DROP CONSTRAINT IF EXISTS hangout_participants_user_id_fkey,
  ADD CONSTRAINT hangout_participants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey,
  ADD CONSTRAINT push_subscriptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE buildings
  DROP CONSTRAINT IF EXISTS buildings_created_by_fkey,
  ADD CONSTRAINT buildings_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles (id);

ALTER TABLE building_edit_votes
  DROP CONSTRAINT IF EXISTS building_edit_votes_user_id_fkey,
  ADD CONSTRAINT building_edit_votes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
