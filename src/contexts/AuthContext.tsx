import React, { useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { AuthContext, useAuth, type School, type AuthContextType } from './auth-context';

export { useAuth };

type AppRole = Database['public']['Enums']['app_role'];

const ACTIVE_SCHOOL_KEY = 'active_school_id';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [ownSchoolId, setOwnSchoolId] = useState<string | null>(null);
  const [activeSchoolId, setActiveSchoolIdState] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);

  const reloadSchools = useCallback(async () => {
    const { data } = await supabase.from('schools').select('id, name, slug').order('name');
    setSchools(data || []);
  }, []);

  const fetchUserData = async (userId: string) => {
    const [rolesResult, profileResult] = await Promise.all([
      supabase.from('user_roles').select('role, school_id').eq('user_id', userId),
      supabase.from('profiles').select('full_name, email, avatar_url').eq('user_id', userId).single(),
    ]);

    const roles = rolesResult.data || [];
    const superAdmin = roles.some(r => r.role === 'super_admin');
    const tenantRole = roles.find(r => r.role !== 'super_admin');
    setIsSuperAdmin(superAdmin);
    setRole((tenantRole?.role as AppRole) || (superAdmin ? 'super_admin' : null));
    setOwnSchoolId(tenantRole?.school_id || null);

    if (profileResult.data) setProfile(profileResult.data);

    const { data: schoolsData } = await supabase.from('schools').select('id, name, slug').order('name');
    setSchools(schoolsData || []);

    const stored = localStorage.getItem(ACTIVE_SCHOOL_KEY);
    if (superAdmin) {
      setActiveSchoolIdState(stored && (schoolsData || []).some(s => s.id === stored) ? stored : null);
    } else {
      setActiveSchoolIdState(tenantRole?.school_id || null);
    }
  };

  const setActiveSchoolId = (id: string | null) => {
    setActiveSchoolIdState(id);
    if (id) localStorage.setItem(ACTIVE_SCHOOL_KEY, id);
    else localStorage.removeItem(ACTIVE_SCHOOL_KEY);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchUserData(session.user.id), 0);
      } else {
        setRole(null);
        setProfile(null);
        setIsSuperAdmin(false);
        setOwnSchoolId(null);
        setActiveSchoolIdState(null);
        setSchools([]);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(ACTIVE_SCHOOL_KEY);
    setRole(null);
    setProfile(null);
    setIsSuperAdmin(false);
    setOwnSchoolId(null);
    setActiveSchoolIdState(null);
    setSchools([]);
  };

  const schoolId = isSuperAdmin ? activeSchoolId : ownSchoolId;

  return (
    <AuthContext.Provider value={{
      user, session, role, profile, loading,
      isSuperAdmin, ownSchoolId, schoolId, schools,
      setActiveSchoolId, signIn, signOut, reloadSchools,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
