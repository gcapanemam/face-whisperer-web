CREATE TABLE public.monitor_classrooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, classroom_id)
);

ALTER TABLE public.monitor_classrooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage monitor_classrooms"
ON public.monitor_classrooms
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own monitor_classrooms"
ON public.monitor_classrooms
FOR SELECT
USING (auth.uid() = user_id);

CREATE INDEX idx_monitor_classrooms_user ON public.monitor_classrooms(user_id);
CREATE INDEX idx_monitor_classrooms_classroom ON public.monitor_classrooms(classroom_id);