import { useAuth } from '@/contexts/AuthContext';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { TeacherDashboard } from '@/components/dashboards/TeacherDashboard';
import { ReceptionDashboard } from '@/components/dashboards/ReceptionDashboard';

export default function Dashboard() {
  const { role } = useAuth();

  if (role === 'admin' || role === 'secretary') return <AdminDashboard />;
  if (role === 'teacher') return <TeacherDashboard />;
  return <ReceptionDashboard />;
}
