import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { MonitorSmartphone, AlertTriangle, CheckCircle, RefreshCw, Wifi, WifiOff, User, Radar } from 'lucide-react';

export function ReceptionDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [unknownCount, setUnknownCount] = useState(0);
  const [deviceStatus, setDeviceStatus] = useState<'online' | 'offline' | 'polling' | 'unknown'>('unknown');
  const [lastPoll, setLastPoll] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [allowedClassroomIds, setAllowedClassroomIds] = useState<string[] | null>(null);
  const [allowedClassroomNames, setAllowedClassroomNames] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchAllowedClassrooms = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAllowedClassroomIds([]);
      return;
    }
    // Check if admin (admins see everything)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const adminRole = (roleData || []).some((r: any) => r.role === 'admin');
    setIsAdmin(adminRole);

    const { data } = await supabase
      .from('monitor_classrooms')
      .select('classroom_id, classrooms(name)')
      .eq('user_id', user.id);
    const ids = (data || []).map((r: any) => r.classroom_id);
    const names = (data || []).map((r: any) => r.classrooms?.name).filter(Boolean);
    setAllowedClassroomIds(ids);
    setAllowedClassroomNames(names);
  };

  const fetchEvents = useCallback(async () => {
    // Wait for allowed classrooms to load
    if (allowedClassroomIds === null) return;
    // If not admin and no classrooms assigned, show nothing
    if (!isAdmin && allowedClassroomIds.length === 0) {
      setEvents([]);
      return;
    }
    let query = supabase
      .from('pickup_events')
      .select('*, guardians(full_name, photo_url), children(full_name, photo_url), classrooms(name)')
      .gte('created_at', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: false })
      .limit(50);
    if (selectedDeviceId !== 'all') {
      query = query.eq('device_id', selectedDeviceId);
    }
    // Apply classroom filter when user has explicit assignments (even admins, if assigned)
    if (allowedClassroomIds.length > 0) {
      query = query.in('classroom_id', allowedClassroomIds);
    }
    const { data } = await query;
    setEvents(data || []);
  }, [allowedClassroomIds, isAdmin, selectedDeviceId]);

  const fetchUnknown = useCallback(async () => {
    if (allowedClassroomIds === null) return;
    if (!isAdmin && allowedClassroomIds.length === 0) {
      setUnknownCount(0);
      return;
    }
    let query = supabase
      .from('recognition_log')
      .select('id', { count: 'exact', head: true })
      .eq('recognized', false)
      .gte('created_at', new Date().toISOString().split('T')[0]);
    if (selectedDeviceId !== 'all') {
      query = query.eq('device_id', selectedDeviceId);
    }
    const { count } = await query;
    setUnknownCount(count || 0);
  }, [allowedClassroomIds, isAdmin, selectedDeviceId]);

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
  }, [selectedDeviceId, fetchEvents, fetchUnknown]);

  useEffect(() => {
    fetchAllowedClassrooms();
    fetchDevices();
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchUnknown();
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
  }, [pollDevice, fetchEvents, fetchUnknown]);

  const statusConfig: Record<string, { label: string; class: string }> = {
    pending: { label: 'Pendente', class: 'bg-warning/20 text-warning' },
    confirmed: { label: 'Confirmado', class: 'bg-accent/20 text-accent' },
    rejected: { label: 'Rejeitado', class: 'bg-destructive/20 text-destructive' },
    expired: { label: 'Expirado', class: 'bg-muted text-muted-foreground' },
  };

  const deviceStatusConfig = {
    online: { label: 'Online', icon: Wifi, class: 'text-accent' },
    offline: { label: 'Offline', icon: WifiOff, class: 'text-destructive' },
    polling: { label: 'Consultando', icon: Radar, class: 'text-primary' },
    unknown: { label: 'Verificando', icon: Radar, class: 'text-primary' },
  };

  const isSearching = deviceStatus === 'polling' || deviceStatus === 'unknown';
  const DeviceIcon = deviceStatusConfig[deviceStatus].icon;
  const noClassroomsAssigned = !isAdmin && allowedClassroomIds !== null && allowedClassroomIds.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Monitoramento</h1>
          <p className="text-muted-foreground">Feed ao vivo de reconhecimentos faciais</p>
          {allowedClassroomNames.length > 0 && (
            <p className="text-xs text-primary mt-1">
              Filtrado por sala(s): {allowedClassroomNames.join(', ')}
            </p>
          )}
          {noClassroomsAssigned && (
            <p className="text-xs text-destructive mt-1">
              Nenhuma sala atribuída. Solicite ao administrador para vincular salas ao seu usuário.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Dispositivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os dispositivos</SelectItem>
              {devices.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={pollDevice} disabled={isPolling}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isPolling ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className={isSearching ? 'relative overflow-hidden border-primary/40' : ''}>
          {isSearching && (
            <div className="absolute inset-0 gradient-shift pointer-events-none" aria-hidden="true" />
          )}
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dispositivo Intelbras</CardTitle>
            <div className={`relative flex items-center justify-center h-8 w-8 rounded-full ${isSearching ? 'radar-scan bg-primary/10' : ''}`}>
              <DeviceIcon className={`h-5 w-5 ${deviceStatusConfig[deviceStatus].class} ${isSearching ? 'radar-sweep' : ''}`} />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <p className={`text-lg font-bold font-display ${deviceStatusConfig[deviceStatus].class} ${isSearching ? 'searching-dots' : ''}`}>
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
            <div className="space-y-4">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center gap-5 rounded-xl border p-5">
                  {/* Guardian photo */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <Avatar className="h-16 w-16 border-2 border-primary/20">
                      {ev.guardians?.photo_url ? (
                        <AvatarImage src={ev.guardians.photo_url} alt={ev.guardians.full_name} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-primary text-lg">
                        <User className="h-7 w-7" />
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-xs font-medium text-center truncate max-w-[72px]">{ev.guardians?.full_name || 'Desconhecido'}</p>
                  </div>

                  {/* Captured face at recognition time */}
                  {ev.capture_photo_url && (
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <a href={ev.capture_photo_url} target="_blank" rel="noopener noreferrer" title="Ver captura em tamanho real">
                        <img
                          src={ev.capture_photo_url}
                          alt="Captura do reconhecimento"
                          className="h-16 w-16 rounded-lg object-cover border-2 border-dashed border-primary/40 hover:opacity-80 transition"
                        />
                      </a>
                      <p className="text-[10px] text-muted-foreground">Captura</p>
                    </div>
                  )}

                  {/* Arrow / separator */}
                  <div className="text-muted-foreground text-lg">→</div>

                  {/* Child photo */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <Avatar className="h-16 w-16 border-2 border-accent/20">
                      {ev.children?.photo_url ? (
                        <AvatarImage src={ev.children.photo_url} alt={ev.children.full_name} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-accent/10 text-accent text-lg">
                        {ev.children?.full_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-xs font-medium text-center truncate max-w-[72px]">{ev.children?.full_name}</p>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">{ev.classrooms?.name}</p>
                  </div>

                  {/* Time + status */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="text-sm text-muted-foreground font-mono">
                      {new Date(ev.recognized_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig[ev.status]?.class || ''}`}>
                      {statusConfig[ev.status]?.label || ev.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
