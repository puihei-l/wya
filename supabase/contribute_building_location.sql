CREATE OR REPLACE FUNCTION contribute_building_location(
  p_building_id UUID,
  p_lat         DOUBLE PRECISION,
  p_lng         DOUBLE PRECISION
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE buildings
  SET
    lat = CASE WHEN lat IS NULL THEN p_lat ELSE (lat + p_lat) / 2 END,
    lng = CASE WHEN lng IS NULL THEN p_lng ELSE (lng + p_lng) / 2 END
  WHERE id = p_building_id;
$$;
