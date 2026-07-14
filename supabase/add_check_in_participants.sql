CREATE TABLE IF NOT EXISTS check_in_participants (
  check_in_id UUID REFERENCES check_ins(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (check_in_id, user_id)
);

ALTER TABLE check_in_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants are publicly readable"
  ON check_in_participants FOR SELECT USING (true);

CREATE POLICY "Users can join check-ins"
  ON check_in_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave check-ins"
  ON check_in_participants FOR DELETE USING (auth.uid() = user_id);
