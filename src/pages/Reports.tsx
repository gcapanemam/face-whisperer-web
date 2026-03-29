import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function Reports() {
  const [events, setEvents] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [filterClassroom, setFilterClassroom] = useState('all');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    const { data: rooms } = await supabase.from('classrooms').select('id, name').order('name');
    setClassrooms(rooms || []);

    let query = supabase
      .from('pickup_events')
      .select('*, guardians(full_name), children(full_name), classrooms(name)')
      .gte('created_at', filterDate)
      .lt('created_at', new Date(new Date(filterDate).getTime() + 86400000).toISOString().split('T')[0])
      .order('created_at', { ascending: false });

    if (filterClassroom !== 'all') {
      query = query.eq('classroom_id', filterClassroom);
    }

    const { data } = await query;
    setEvents(data || []);
  };

  useEffect(() => { fetchData(); }, [filterClassroom, filterDate]);

  const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    pending: { label: 'Pendente', variant: 'secondary' },
    confirmed: { label: 'Confirmado', variant: 'default' },
    rejected: { label: 'Rejeitado', variant: 'destructive' },
    expired: { label: 'Expirado', variant: 'secondary' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">Histórico de retiradas</p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="space-y-2">
          <Label>Data</Label>
          <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-2">
          <Label>Sala</Label>
          <Select value={filterClassroom} onValueChange={setFilterClassroom}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {classrooms.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{events.length} registros encontrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horário</TableHead>
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
                    {new Date(ev.recognized_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                    Nenhum registro para esta data.
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
