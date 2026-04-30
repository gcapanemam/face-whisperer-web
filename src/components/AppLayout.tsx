import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { Building2 } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, schoolId, schools } = useAuth();
  const location = useLocation();

  // Super admin without an active school: force selection on /schools page
  if (isSuperAdmin && !schoolId && location.pathname !== '/schools') {
    return <Navigate to="/schools" replace />;
  }

  const activeSchool = schools.find(s => s.id === schoolId);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="flex items-center justify-between gap-2 border-b px-6 py-3">
            <SidebarTrigger />
            {activeSchool && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span className="font-medium text-foreground">{activeSchool.name}</span>
                {isSuperAdmin && <span className="text-xs">(super admin)</span>}
              </div>
            )}
          </div>
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
