import { createContext, useContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

export interface School {
  id: string;
  name: string;
  slug: string | null;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { full_name: string; email: string | null; avatar_url: string | null } | null;
  loading: boolean;
  isSuperAdmin: boolean;
  ownSchoolId: string | null;
  schoolId: string | null;
  schools: School[];
  setActiveSchoolId: (id: string | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadSchools: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
