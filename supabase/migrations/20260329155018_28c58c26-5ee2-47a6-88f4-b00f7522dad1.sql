
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  device_url text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage devices" ON public.devices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Reception can view devices" ON public.devices FOR SELECT
  USING (has_role(auth.uid(), 'reception'::app_role));

CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
