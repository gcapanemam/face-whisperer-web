ALTER TABLE public.pickup_events ADD COLUMN device_id uuid REFERENCES public.devices(id);
ALTER TABLE public.recognition_log ADD COLUMN device_id uuid REFERENCES public.devices(id);