import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Baby, School, UserCheck, ClipboardList,
  Settings, LogOut, Shield, Bell, MonitorSmartphone
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const adminLinks = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { title: 'Salas', icon: School, path: '/classrooms' },
  { title: 'Crianças', icon: Baby, path: '/children' },
  { title: 'Responsáveis', icon: Users, path: '/guardians' },
  { title: 'Usuários', icon: UserCheck, path: '/users' },
  { title: 'Relatórios', icon: ClipboardList, path: '/reports' },
  { title: 'Monitoramento', icon: MonitorSmartphone, path: '/monitoring' },
];

const teacherLinks = [
  { title: 'Minha Sala', icon: LayoutDashboard, path: '/dashboard' },
  { title: 'Notificações', icon: Bell, path: '/notifications' },
  { title: 'Histórico', icon: ClipboardList, path: '/reports' },
];

const receptionLinks = [
  { title: 'Monitoramento', icon: MonitorSmartphone, path: '/dashboard' },
  { title: 'Histórico', icon: ClipboardList, path: '/reports' },
];

export function AppSidebar() {
  const { role, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const links = role === 'admin' || role === 'secretary'
    ? adminLinks
    : role === 'teacher'
    ? teacherLinks
    : receptionLinks;

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    secretary: 'Secretaria',
    teacher: 'Professora',
    reception: 'Portaria',
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Shield className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-sidebar-foreground">SafeSchool</h1>
            <p className="text-xs text-sidebar-foreground/60">Controle de Busca</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map((link) => (
                <SidebarMenuItem key={link.path}>
                  <SidebarMenuButton
                    isActive={location.pathname === link.path}
                    onClick={() => navigate(link.path)}
                  >
                    <link.icon className="h-4 w-4" />
                    <span>{link.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.full_name}</p>
            <p className="text-xs text-sidebar-foreground/60">{role ? roleLabels[role] : ''}</p>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
