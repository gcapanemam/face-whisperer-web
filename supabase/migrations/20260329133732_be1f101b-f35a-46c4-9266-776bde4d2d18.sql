
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'secretary', 'teacher', 'reception');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Classrooms table
CREATE TABLE public.classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  grade TEXT,
  teacher_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

-- Children table
CREATE TABLE public.children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  photo_url TEXT,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
  birth_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- Guardians table
CREATE TABLE public.guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  photo_url TEXT,
  phone TEXT,
  email TEXT,
  cpf TEXT,
  intelbras_person_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

-- Guardian-Children relationship (many-to-many)
CREATE TABLE public.guardian_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id UUID REFERENCES public.guardians(id) ON DELETE CASCADE NOT NULL,
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'responsável',
  authorized BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (guardian_id, child_id)
);
ALTER TABLE public.guardian_children ENABLE ROW LEVEL SECURITY;

-- Pickup events table
CREATE TABLE public.pickup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id UUID REFERENCES public.guardians(id) ON DELETE SET NULL,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
  recognized_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
  intelbras_event_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.pickup_events ENABLE ROW LEVEL SECURITY;

-- Recognition log (raw events from device)
CREATE TABLE public.recognition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelbras_event_id TEXT,
  intelbras_person_id TEXT,
  guardian_id UUID REFERENCES public.guardians(id) ON DELETE SET NULL,
  recognized BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC,
  photo_url TEXT,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.recognition_log ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_classrooms_updated_at BEFORE UPDATE ON public.classrooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_children_updated_at BEFORE UPDATE ON public.children FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_guardians_updated_at BEFORE UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- classrooms
CREATE POLICY "Authenticated users can view classrooms" ON public.classrooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage classrooms" ON public.classrooms FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- children
CREATE POLICY "Admins can manage children" ON public.children FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Teachers can view children in their classroom" ON public.children FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.classrooms WHERE classrooms.id = children.classroom_id AND classrooms.teacher_user_id = auth.uid())
);
CREATE POLICY "Reception can view all children" ON public.children FOR SELECT USING (public.has_role(auth.uid(), 'reception'));

-- guardians
CREATE POLICY "Admins can manage guardians" ON public.guardians FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can view guardians" ON public.guardians FOR SELECT TO authenticated USING (true);

-- guardian_children
CREATE POLICY "Admins can manage guardian_children" ON public.guardian_children FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can view guardian_children" ON public.guardian_children FOR SELECT TO authenticated USING (true);

-- pickup_events
CREATE POLICY "Admins can manage pickup_events" ON public.pickup_events FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Reception can view all pickup_events" ON public.pickup_events FOR SELECT USING (public.has_role(auth.uid(), 'reception'));
CREATE POLICY "Teachers can view their classroom pickup_events" ON public.pickup_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.classrooms WHERE classrooms.id = pickup_events.classroom_id AND classrooms.teacher_user_id = auth.uid())
);
CREATE POLICY "Teachers can update their classroom pickup_events" ON public.pickup_events FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.classrooms WHERE classrooms.id = pickup_events.classroom_id AND classrooms.teacher_user_id = auth.uid())
);

-- recognition_log
CREATE POLICY "Admins can manage recognition_log" ON public.recognition_log FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Reception can view recognition_log" ON public.recognition_log FOR SELECT USING (public.has_role(auth.uid(), 'reception'));

-- Enable realtime for pickup_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_events;
