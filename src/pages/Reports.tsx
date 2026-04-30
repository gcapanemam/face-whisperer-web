import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Reports() {
  const { schoolId } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [filterClassroom, setFilterClassroom] = useState('all');
  const [filterChild, setFilterChild] = useState('all');
  const [filterGuardian, setFilterGuardian] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchOptions = async () => {
      if (!schoolId) { setClassrooms([]); setChildren([]); setGuardians([]); return; }
      const [rooms, kids, guards] = await Promise.all([
        supabase.from('classrooms').select('id, name').eq('school_id', schoolId).order('name'),
        supabase.from('children').select('id, full_name').eq('school_id', schoolId).order('full_name'),
        supabase.from('guardians').select('id, full_name').eq('school_id', schoolId).order('full_name'),
      ]);
      setClassrooms(rooms.data || []);
      setChildren(kids.data || []);
      setGuardians(guards.data || []);
    };
    fetchOptions();
  }, [schoolId]);

  const fetchData = async () => {
    if (!schoolId) { setEvents([]); return; }
    setLoading(true);
    const nextDay = new Date(new Date(dateTo).getTime() + 86400000).toISOString().split('T')[0];

    let query = supabase
      .from('pickup_events')
      .select('*, guardians(full_name), children(full_name), classrooms(name)')
      .eq('school_id', schoolId)
      .gte('created_at', dateFrom)
      .lt('created_at', nextDay)
      .order('created_at', { ascending: false });

    if (filterClassroom !== 'all') query = query.eq('classroom_id', filterClassroom);
    if (filterChild !== 'all') query = query.eq('child_id', filterChild);
    if (filterGuardian !== 'all') query = query.eq('guardian_id', filterGuardian);
    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    const { data } = await query;
    setEvents(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [schoolId]);

  const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    pending: { label: 'Pendente', variant: 'secondary' },
    confirmed: { label: 'Confirmado', variant: 'default' },
    rejected: { label: 'Rejeitado', variant: 'destructive' },
    expired: { label: 'Expirado', variant: 'secondary' },
  };

  const exportCSV = () => {
    if (events.length === 0) return;
    const header = 'Horário,Responsável,Criança,Sala,Status\n';
    const rows = events.map(ev => {
      const time = new Date(ev.recognized_at).toLocaleString('pt-BR');
      return `"${time}","${ev.guardians?.full_name || ''}","${ev.children?.full_name || ''}","${ev.classrooms?.name || ''}","${statusLabels[ev.status]?.label || ev.status}"`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary stats
  const totalConfirmed = events.filter(e => e.status === 'confirmed').length;
  const totalPending = events.filter(e => e.status === 'pending').length;
  const totalRejected = events.filter(e => e.status === 'rejected').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Histórico de retiradas por período</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={events.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sala</Label>
              <Select value={filterClassroom} onValueChange={setFilterClassroom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {classrooms.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Criança</Label>
              <Select value={filterChild} onValueChange={setFilterChild}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {children.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={filterGuardian} onValueChange={setFilterGuardian}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {guardians.map(g => <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                  <SelectItem value="expired">Expirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4" onClick={fetchData} disabled={loading}>
            <Search className="h-4 w-4 mr-2" /> {loading ? 'Buscando...' : 'Buscar'}
          </Button>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold font-display">{events.length}</p>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold font-display text-accent">{totalConfirmed}</p>
            <p className="text-sm text-muted-foreground">Confirmados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold font-display text-warning">{totalPending}</p>
            <p className="text-sm text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold font-display text-destructive">{totalRejected}</p>
            <p className="text-sm text-muted-foreground">Rejeitados</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{events.length} registros encontrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Criança</TableHead>
                <TableHead>Sala</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map(ev => (
                <TableRow key={ev.id}>
                  <TableCell className="font-mono text-sm">
                    {new Date(ev.recognized_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell className="font-medium">{ev.guardians?.full_name || '—'}</TableCell>
                  <TableCell>{ev.children?.full_name || '—'}</TableCell>
                  <TableCell>{ev.classrooms?.name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusLabels[ev.status]?.variant || 'secondary'}>
                      {statusLabels[ev.status]?.label || ev.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum registro para o período selecionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
