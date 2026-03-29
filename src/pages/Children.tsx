import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Children() {
  const [children, setChildren] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [classroomId, setClassroomId] = useState('');
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: kids }, { data: rooms }] = await Promise.all([
      supabase.from('children').select('*, classrooms(name)').order('full_name'),
      supabase.from('classrooms').select('id, name').order('name'),
    ]);
    setChildren(kids || []);
    setClassrooms(rooms || []);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    const { error } = await supabase.from('children').insert({
      full_name: name,
      classroom_id: classroomId || null,
    });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Criança cadastrada!' });
      setName(''); setClassroomId(''); setOpen(false);
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('children').delete().eq('id', id);
    fetchData();
  };

  const filtered = children.filter(c => c.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Crianças</h1>
          <p className="text-muted-foreground">{children.length} cadastradas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova Criança</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar Criança</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome da criança" />
              </div>
              <div className="space-y-2">
                <Label>Sala</Label>
                <Select value={classroomId} onValueChange={setClassroomId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar sala" /></SelectTrigger>
                  <SelectContent>
                    {classrooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">Cadastrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar criança..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Sala</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(child => (
                <TableRow key={child.id}>
                  <TableCell className="font-medium">{child.full_name}</TableCell>
                  <TableCell>{child.classrooms?.name || '—'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(child.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Nenhuma criança encontrada.
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
