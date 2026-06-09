-- Run this in the Supabase SQL Editor

CREATE TABLE friend_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (from_id, to_id)
);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- Both parties can see their own requests
CREATE POLICY "friend_requests: select"
  ON friend_requests FOR SELECT
  USING (from_id = auth.uid() OR to_id = auth.uid());

-- Only sender can create
CREATE POLICY "friend_requests: insert"
  ON friend_requests FOR INSERT
  WITH CHECK (from_id = auth.uid());

-- Only recipient can update status (accept / decline)
CREATE POLICY "friend_requests: update"
  ON friend_requests FOR UPDATE
  USING (to_id = auth.uid());

-- Either party can delete (sender cancels, recipient removes)
CREATE POLICY "friend_requests: delete"
  ON friend_requests FOR DELETE
  USING (from_id = auth.uid() OR to_id = auth.uid());

CREATE INDEX ON friend_requests (to_id, status);
CREATE INDEX ON friend_requests (from_id, status);
