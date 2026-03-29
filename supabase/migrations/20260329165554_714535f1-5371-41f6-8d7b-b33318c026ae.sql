
CREATE TABLE public.guardian_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  intelbras_person_id text NOT NULL,
  synced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guardian_id, device_id)
);

ALTER TABLE public.guardian_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage guardian_devices" ON public.guardian_devices
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Reception can view guardian_devices" ON public.guardian_devices
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "Authenticated can view guardian_devices" ON public.guardian_devices
  FOR SELECT TO authenticated USING (true);

-- Migrate existing data: link guardians with intelbras_person_id to the first enabled device
INSERT INTO public.guardian_devices (guardian_id, device_id, intelbras_person_id, synced)
SELECT g.id, d.id, g.intelbras_person_id, true
FROM public.guardians g
CROSS JOIN (SELECT id FROM public.devices WHERE enabled = true ORDER BY created_at LIMIT 1) d
WHERE g.intelbras_person_id IS NOT NULL AND g.intelbras_person_id != '';
