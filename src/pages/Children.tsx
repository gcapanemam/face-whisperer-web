import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Trash2, Search, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PhotoUpload } from '@/components/PhotoUpload';
import { ImportExcel } from '@/components/ImportExcel';

export default function Children() {
  const [children, setChildren] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [classroomId, setClassroomId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
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

  const resetForm = () => {
    setName(''); setClassroomId(''); setPhotoUrl(''); setEditId(null);
  };

  const openEdit = (child: any) => {
    setEditId(child.id);
    setName(child.full_name);
    setClassroomId(child.classroom_id || '');
    setPhotoUrl(child.photo_url || '');
    setOpen(true);
  };

  const handleSave = async () => {
    if (editId) {
      const { error } = await supabase.from('children').update({
        full_name: name,
        classroom_id: classroomId || null,
        photo_url: photoUrl || null,
      }).eq('id', editId);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Criança atualizada!' });
        resetForm(); setOpen(false); fetchData();
      }
    } else {
      const { error } = await supabase.from('children').insert({
        full_name: name,
        classroom_id: classroomId || null,
        photo_url: photoUrl || null,
      });
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Criança cadastrada!' });
        resetForm(); setOpen(false); fetchData();
      }
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
        <div className="flex gap-2">
        <ImportExcel
          buttonLabel="Importar Crianças"
          fields={[
            { dbField: 'full_name', label: 'Nome', required: true },
            { dbField: 'classroom', label: 'Sala' },
          ]}
          onImport={async (rows) => {
            let success = 0, errors = 0;
            for (const row of rows) {
              if (!row.full_name) { errors++; continue; }
              let classroom_id: string | null = null;
              if (row.classroom) {
                const match = classrooms.find(c => c.name.toLowerCase() === row.classroom.toLowerCase());
                if (match) classroom_id = match.id;
              }
              const { error } = await supabase.from('children').insert({ full_name: row.full_name, classroom_id });
              if (error) errors++; else success++;
            }
            fetchData();
            return { success, errors };
          }}
        />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova Criança</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? 'Editar Criança' : 'Cadastrar Criança'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Foto</Label>
                <PhotoUpload
                  folder="children"
                  onUploaded={setPhotoUrl}
                  name={name}
                  currentUrl={photoUrl || null}
                />
              </div>
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
              <Button onClick={handleSave} className="w-full">{editId ? 'Salvar' : 'Cadastrar'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
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
                <TableHead className="w-12"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Sala</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(child => (
                <TableRow key={child.id}>
                  <TableCell>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={child.photo_url || undefined} />
                      <AvatarFallback className="text-xs bg-secondary">
                        {child.full_name[0]}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{child.full_name}</TableCell>
                  <TableCell>{child.classrooms?.name || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(child)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(child.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
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
