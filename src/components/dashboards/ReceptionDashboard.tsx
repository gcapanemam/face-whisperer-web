import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MonitorSmartphone, AlertTriangle, CheckCircle } from 'lucide-react';

export function ReceptionDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [unknownCount, setUnknownCount] = useState(0);

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('pickup_events')
        .select('*, guardians(full_name), children(full_name), classrooms(name)')
        .gte('created_at', new Date().toISOString().split('T')[0])
        .order('created_at', { ascending: false })
        .limit(50);
      setEvents(data || []);
    };

    const fetchUnknown = async () => {
      const { count } = await supabase
        .from('recognition_log')
        .select('id', { count: 'exact', head: true })
        .eq('recognized', false)
        .gte('created_at', new Date().toISOString().split('T')[0]);
      setUnknownCount(count || 0);
    };

    fetchEvents();
    fetchUnknown();

    // Realtime
    const channel = supabase
      .channel('reception-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pickup_events' }, () => {
        fetchEvents();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recognition_log' }, () => {
        fetchUnknown();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const statusConfig: Record<string, { label: string; class: string }> = {
    pending: { label: 'Pendente', class: 'bg-warning/20 text-warning' },
    confirmed: { label: 'Confirmado', class: 'bg-accent/20 text-accent' },
    rejected: { label: 'Rejeitado', class: 'bg-destructive/20 text-destructive' },
    expired: { label: 'Expirado', class: 'bg-muted text-muted-foreground' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Monitoramento</h1>
        <p className="text-muted-foreground">Feed ao vivo de reconhecimentos faciais</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Eventos Hoje</CardTitle>
            <CheckCircle className="h-5 w-5 text-accent" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-display">{events.length}</p>
          </CardContent>
        </Card>
        <Card className={unknownCount > 0 ? 'border-destructive/50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Não Identificados</CardTitle>
            <AlertTriangle className={`h-5 w-5 ${unknownCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-display">{unknownCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5" />
            Timeline de Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum evento hoje.</p>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground font-mono">
                      {new Date(ev.recognized_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{ev.guardians?.full_name || 'Desconhecido'}</p>
                      <p className="text-xs text-muted-foreground">
                        {ev.children?.full_name} • {ev.classrooms?.name}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusConfig[ev.status]?.class || ''}`}>
                    {statusConfig[ev.status]?.label || ev.status}
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
