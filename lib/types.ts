export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Building {
  id: string;
  name: string;
  address: string | null;
  created_by?: string | null;
  num_floors?: number | null;
  floor_label?: string | null;
  notable_spots?: string[] | null;
  lat?: number | null;
  lng?: number | null;
}

export type Vibe = 'studying' | 'chilling' | 'eating' | 'working' | 'gaming' | 'exercising';

export interface CheckInParticipant {
  user_id: string;
  profiles?: Profile;
}

export interface CheckIn {
  id: string;
  user_id: string;
  floor: string | null;
  vibe: Vibe;
  is_open: boolean;
  note: string | null;
  starts_at: string | null;
  expires_at: string;
  created_at: string;
  custom_location: string | null;
  planned_lat: number | null;
  planned_lng: number | null;
  check_in_participants: CheckInParticipant[];
  profiles: Profile;
  buildings: Building | null;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  owner_id: string;
}

export interface GroupWithMembers extends Group {
  friend_group_members: { user_id: string; profiles: Profile }[];
}

export interface Hangout {
  id: string;
  title: string;
  planned_at: string;
  ends_at: string;
  note: string | null;
  creator_id: string;
  buildings: Building | null;
  profiles: Profile;
  hangout_participants: { user_id: string; status: string }[];
}

export interface FriendRequest {
  id: string;
  from_id: string;
  to_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  from_profile: Profile;
  to_profile: Profile;
}

export interface BuildingEdit {
  id: string;
  building_id: string;
  field: 'name' | 'address';
  proposed_value: string;
  created_at: string;
  buildings: Building;
  building_edit_votes: { user_id: string }[];
}
