-- ============================================================
-- wya — full schema
-- Run in Supabase SQL Editor (Project Settings > SQL Editor)
-- ============================================================

-- --------------------
-- Extensions
-- --------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------
-- Profiles (extends auth.users)
-- --------------------
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'display_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- --------------------
-- Friend groups
-- --------------------
CREATE TABLE friend_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '👥',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE friend_group_members (
  group_id   UUID REFERENCES friend_groups (id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
  added_by   UUID REFERENCES public.profiles (id),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Auto-add owner as first member when group is created
CREATE OR REPLACE FUNCTION handle_new_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO friend_group_members (group_id, user_id, added_by)
  VALUES (new.id, new.owner_id, new.owner_id)
  ON CONFLICT DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER on_group_created
  AFTER INSERT ON friend_groups
  FOR EACH ROW EXECUTE FUNCTION handle_new_group();

-- --------------------
-- Buildings + community edits
-- --------------------
CREATE TABLE buildings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  address    TEXT,
  created_by UUID REFERENCES public.profiles (id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE building_edits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id    UUID NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
  field          TEXT NOT NULL CHECK (field IN ('name', 'address')),
  proposed_value TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (building_id, field, proposed_value)
);

CREATE TABLE building_edit_votes (
  edit_id    UUID REFERENCES building_edits (id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (edit_id, user_id)
);

-- Auto-apply edit when it reaches 3 votes
CREATE OR REPLACE FUNCTION maybe_apply_building_edit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_edit   building_edits%ROWTYPE;
  v_count  INT;
BEGIN
  SELECT * INTO v_edit FROM building_edits WHERE id = new.edit_id;
  SELECT COUNT(*) INTO v_count FROM building_edit_votes WHERE edit_id = new.edit_id;

  IF v_count >= 3 THEN
    IF v_edit.field = 'name' THEN
      UPDATE buildings SET name = v_edit.proposed_value WHERE id = v_edit.building_id;
    ELSIF v_edit.field = 'address' THEN
      UPDATE buildings SET address = v_edit.proposed_value WHERE id = v_edit.building_id;
    END IF;
    -- Clean up approved edit and its votes
    DELETE FROM building_edits WHERE id = new.edit_id;
  END IF;

  RETURN new;
END;
$$;

CREATE TRIGGER on_building_edit_vote
  AFTER INSERT ON building_edit_votes
  FOR EACH ROW EXECUTE FUNCTION maybe_apply_building_edit();

-- --------------------
-- Check-ins
-- --------------------
CREATE TYPE check_in_vibe AS ENUM ('studying', 'chilling', 'eating', 'working', 'gaming');

CREATE TABLE check_ins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings (id),
  floor       TEXT,
  vibe        check_in_vibe NOT NULL,
  is_open     BOOLEAN NOT NULL DEFAULT true,
  note        TEXT,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE check_in_groups (
  check_in_id UUID REFERENCES check_ins (id) ON DELETE CASCADE,
  group_id    UUID REFERENCES friend_groups (id) ON DELETE CASCADE,
  PRIMARY KEY (check_in_id, group_id)
);

-- --------------------
-- Push subscriptions
-- --------------------
CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------
-- Hangouts
-- --------------------
CREATE TABLE hangouts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  building_id UUID REFERENCES buildings (id),
  planned_at  TIMESTAMPTZ NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hangout_participants (
  hangout_id UUID REFERENCES hangouts (id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'invited'
             CHECK (status IN ('invited', 'going', 'maybe', 'not_going')),
  PRIMARY KEY (hangout_id, user_id)
);

CREATE TABLE hangout_groups (
  hangout_id UUID REFERENCES hangouts (id) ON DELETE CASCADE,
  group_id   UUID REFERENCES friend_groups (id) ON DELETE CASCADE,
  PRIMARY KEY (hangout_id, group_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE building_edits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE building_edit_votes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_groups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hangouts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE hangout_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE hangout_groups       ENABLE ROW LEVEL SECURITY;

-- --------------------
-- Profiles — public read, owner write
-- --------------------
CREATE POLICY "profiles: public read"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "profiles: owner update"
  ON profiles FOR UPDATE USING (id = auth.uid());

-- --------------------
-- Friend groups — owner CRUD
-- --------------------
CREATE POLICY "groups: owner select"
  ON friend_groups FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "groups: owner insert"
  ON friend_groups FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "groups: owner update"
  ON friend_groups FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "groups: owner delete"
  ON friend_groups FOR DELETE USING (owner_id = auth.uid());

-- --------------------
-- Group members — owner manages, members can read
-- --------------------
CREATE POLICY "members: read if in group or owner"
  ON friend_group_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM friend_groups g
      WHERE g.id = group_id AND g.owner_id = auth.uid()
    )
  );

CREATE POLICY "members: owner insert"
  ON friend_group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM friend_groups g
      WHERE g.id = group_id AND g.owner_id = auth.uid()
    )
  );

CREATE POLICY "members: owner delete"
  ON friend_group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM friend_groups g
      WHERE g.id = group_id AND g.owner_id = auth.uid()
    )
  );

-- --------------------
-- Buildings — public read, authenticated insert/update
-- --------------------
CREATE POLICY "buildings: public read"
  ON buildings FOR SELECT USING (true);

CREATE POLICY "buildings: auth insert"
  ON buildings FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- (Updates happen via trigger using SECURITY DEFINER, no direct policy needed)

-- --------------------
-- Building edits & votes — public read, auth write
-- --------------------
CREATE POLICY "building_edits: public read"
  ON building_edits FOR SELECT USING (true);

CREATE POLICY "building_edits: auth insert"
  ON building_edits FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "building_edit_votes: public read"
  ON building_edit_votes FOR SELECT USING (true);

CREATE POLICY "building_edit_votes: auth insert own"
  ON building_edit_votes FOR INSERT WITH CHECK (user_id = auth.uid());

-- --------------------
-- Check-ins — private, group-based visibility
-- --------------------
CREATE POLICY "check_ins: select"
  ON check_ins FOR SELECT
  USING (
    -- Owner always sees their own
    user_id = auth.uid()
    OR (
      -- Others only see active check-ins shared to a group they're in
      expires_at > now()
      AND EXISTS (
        SELECT 1
        FROM check_in_groups cig
        JOIN friend_group_members fgm ON cig.group_id = fgm.group_id
        WHERE cig.check_in_id = check_ins.id
          AND fgm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "check_ins: owner insert"
  ON check_ins FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "check_ins: owner update"
  ON check_ins FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "check_ins: owner delete"
  ON check_ins FOR DELETE USING (user_id = auth.uid());

-- --------------------
-- Check-in groups — follow check_in access
-- --------------------
-- No back-reference to check_ins here — that would cause infinite recursion.
-- Group membership is sufficient: owners are auto-added as members via trigger.
CREATE POLICY "check_in_groups: select"
  ON check_in_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM friend_group_members fgm
      WHERE fgm.group_id = check_in_groups.group_id
        AND fgm.user_id = auth.uid()
    )
  );

CREATE POLICY "check_in_groups: owner insert"
  ON check_in_groups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM check_ins ci WHERE ci.id = check_in_id AND ci.user_id = auth.uid()
    )
  );

-- --------------------
-- Push subscriptions — owner only
-- --------------------
CREATE POLICY "push_subs: owner select"
  ON push_subscriptions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "push_subs: owner insert"
  ON push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subs: owner delete"
  ON push_subscriptions FOR DELETE USING (user_id = auth.uid());

-- --------------------
-- Hangouts — group-based visibility
-- --------------------
CREATE POLICY "hangouts: select"
  ON hangouts FOR SELECT
  USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM hangout_groups hg
      JOIN friend_group_members fgm ON hg.group_id = fgm.group_id
      WHERE hg.hangout_id = hangouts.id AND fgm.user_id = auth.uid()
    )
  );

CREATE POLICY "hangouts: creator insert"
  ON hangouts FOR INSERT WITH CHECK (creator_id = auth.uid());

CREATE POLICY "hangouts: creator update"
  ON hangouts FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "hangouts: creator delete"
  ON hangouts FOR DELETE USING (creator_id = auth.uid());

-- --------------------
-- Hangout participants
-- --------------------
CREATE POLICY "hangout_participants: select"
  ON hangout_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM hangouts h WHERE h.id = hangout_id AND h.creator_id = auth.uid()
    )
  );

CREATE POLICY "hangout_participants: insert own"
  ON hangout_participants FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "hangout_participants: update own"
  ON hangout_participants FOR UPDATE USING (user_id = auth.uid());

-- --------------------
-- Hangout groups
-- --------------------
CREATE POLICY "hangout_groups: creator insert"
  ON hangout_groups FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM hangouts h WHERE h.id = hangout_id AND h.creator_id = auth.uid())
  );

CREATE POLICY "hangout_groups: select"
  ON hangout_groups FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM hangouts h WHERE h.id = hangout_id AND h.creator_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM friend_group_members fgm
      WHERE fgm.group_id = hangout_groups.group_id AND fgm.user_id = auth.uid()
    )
  );

-- ============================================================
-- Useful indexes
-- ============================================================
CREATE INDEX ON check_ins (user_id);
CREATE INDEX ON check_ins (expires_at);
CREATE INDEX ON check_in_groups (group_id);
CREATE INDEX ON friend_group_members (user_id);
CREATE INDEX ON hangouts (planned_at);
CREATE INDEX ON push_subscriptions (user_id);
CREATE INDEX ON building_edit_votes (edit_id);

-- ============================================================
-- Enable Supabase Realtime on check_ins
-- (Run in Supabase Dashboard > Database > Replication)
-- ALTER PUBLICATION supabase_realtime ADD TABLE check_ins;
-- ============================================================
