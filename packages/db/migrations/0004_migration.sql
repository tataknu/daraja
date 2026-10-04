-- Where the farm is, for the Google Maps link in confirmation emails and the map in the demo.
-- Noor's demo farm stands at Kibosho village (OpenStreetMap: -3.238791, 37.312834), on the
-- Kibosho road north of Moshi that its directions describe. Not a real farm's location.
ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
UPDATE public.farm_settings SET latitude = -3.238791, longitude = 37.312834
  WHERE id = 1 AND latitude IS NULL;
