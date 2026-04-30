import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Baby, Users, School, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function AdminDashboard() {
  const { schoolId } = useAuth();
  const [stats, setStats] = useState({ children: 0, guardians: 0, classrooms: 0, todayEvents: 0 });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!schoolId) {
      setStats({ children: 0, guardians: 0, classrooms: 0, todayEvents: 0 });
      setRecentEvents([]);
      return;
    }
    const fetchStats = async () => {
      const [c, g, cl, ev] = await Promise.all([
        supabase.from('children').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
        supabase.from('guardians').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
        supabase.from('classrooms').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
        supabase.from('pickup_events').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .gte('created_at', new Date().toISOString().split('T')[0]),
      ]);
      setStats({
        children: c.count || 0,
        guardians: g.count || 0,
        classrooms: cl.count || 0,
        todayEvents: ev.count || 0,
      });
    };

    const fetchRecent = async () => {
      const { data } = await supabase
        .from('pickup_events')
        .select('*, guardians(full_name), children(full_name), classrooms(name)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentEvents(data || []);
    };

    fetchStats();
    fetchRecent();
  }, [schoolId]);

  const statCards = [
    { label: 'Crianças', value: stats.children, icon: Baby, color: 'text-primary', path: '/children' },
    { label: 'Responsáveis', value: stats.guardians, icon: Users, color: 'text-accent', path: '/guardians' },
    { label: 'Salas', value: stats.classrooms, icon: School, color: 'text-warning', path: '/classrooms' },
    { label: 'Eventos Hoje', value: stats.todayEvents, icon: Clock, color: 'text-destructive', path: '/reports' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do sistema</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(s.path)}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold font-display">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Últimos Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum evento registrado ainda.</p>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{ev.guardians?.full_name || 'Desconhecido'}</p>
                    <p className="text-sm text-muted-foreground">
                      Buscando {ev.children?.full_name} — {ev.classrooms?.name}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    ev.status === 'confirmed' ? 'bg-accent/20 text-accent' :
                    ev.status === 'pending' ? 'bg-warning/20 text-warning' :
                    'bg-destructive/20 text-destructive'
                  }`}>
                    {ev.status === 'confirmed' ? 'Confirmado' : ev.status === 'pending' ? 'Pendente' : ev.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
