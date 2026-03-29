import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonitorSmartphone, AlertTriangle, CheckCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';

export function ReceptionDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [unknownCount, setUnknownCount] = useState(0);
  const [deviceStatus, setDeviceStatus] = useState<'online' | 'offline' | 'polling' | 'unknown'>('unknown');
  const [lastPoll, setLastPoll] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');

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

  const fetchDevices = async () => {
    const { data } = await supabase.from('devices').select('id, name, enabled').eq('enabled', true).order('name');
    setDevices(data || []);
  };

  const pollDevice = useCallback(async () => {
    setIsPolling(true);
    setDeviceStatus('polling');
    try {
      const body: any = {};
      if (selectedDeviceId !== 'all') body.deviceId = selectedDeviceId;
      const { data, error } = await supabase.functions.invoke('intelbras-poll', { body });
      if (error) throw error;
      setDeviceStatus(data?.deviceStatus === 'online' ? 'online' : 'offline');
      setLastPoll(new Date().toLocaleTimeString('pt-BR'));
      await Promise.all([fetchEvents(), fetchUnknown()]);
    } catch (err) {
      console.error('Poll error:', err);
      setDeviceStatus('offline');
    } finally {
      setIsPolling(false);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    fetchEvents();
    fetchUnknown();
    // Initial poll
    pollDevice();

    // Auto-poll every 10 seconds
    const interval = setInterval(pollDevice, 10000);

    // Realtime subscriptions
    const channel = supabase
      .channel('reception-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pickup_events' }, () => {
        fetchEvents();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recognition_log' }, () => {
        fetchUnknown();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [pollDevice]);

  const statusConfig: Record<string, { label: string; class: string }> = {
    pending: { label: 'Pendente', class: 'bg-warning/20 text-warning' },
    confirmed: { label: 'Confirmado', class: 'bg-accent/20 text-accent' },
    rejected: { label: 'Rejeitado', class: 'bg-destructive/20 text-destructive' },
    expired: { label: 'Expirado', class: 'bg-muted text-muted-foreground' },
  };

  const deviceStatusConfig = {
    online: { label: 'Online', icon: Wifi, class: 'text-accent' },
    offline: { label: 'Offline', icon: WifiOff, class: 'text-destructive' },
    polling: { label: 'Consultando...', icon: RefreshCw, class: 'text-primary animate-spin' },
    unknown: { label: 'Verificando...', icon: RefreshCw, class: 'text-muted-foreground animate-spin' },
  };

  const DeviceIcon = deviceStatusConfig[deviceStatus].icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Monitoramento</h1>
          <p className="text-muted-foreground">Feed ao vivo de reconhecimentos faciais</p>
        </div>
        <Button variant="outline" onClick={pollDevice} disabled={isPolling}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isPolling ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dispositivo Intelbras</CardTitle>
            <DeviceIcon className={`h-5 w-5 ${deviceStatusConfig[deviceStatus].class}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-lg font-bold font-display ${deviceStatusConfig[deviceStatus].class}`}>
              {deviceStatusConfig[deviceStatus].label}
            </p>
            {lastPoll && <p className="text-xs text-muted-foreground mt-1">Última consulta: {lastPoll}</p>}
          </CardContent>
        </Card>
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
