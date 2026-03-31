import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, School, Trash2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImportExcel } from '@/components/ImportExcel';
import { ExportExcel } from '@/components/ExportExcel';

export default function Classrooms() {
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    const { data } = await supabase.from('classrooms').select('*').order('name');
    const teacherIds = (data || []).map(c => c.teacher_user_id).filter(Boolean);
    if (teacherIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', teacherIds);
      if (profs && data) {
        data.forEach(c => {
          (c as any).teacher_name = profs.find(p => p.user_id === c.teacher_user_id)?.full_name || null;
        });
      }
    }
    setClassrooms(data || []);
    const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'teacher');
    if (roles) {
      const ids = roles.map(r => r.user_id);
      const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
      setTeachers(profs || []);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setName(''); setGrade(''); setTeacherId(''); setEditId(null);
  };

  const openEdit = (room: any) => {
    setEditId(room.id);
    setName(room.name);
    setGrade(room.grade || '');
    setTeacherId(room.teacher_user_id || '');
    setOpen(true);
  };

  const handleSave = async () => {
    if (editId) {
      const { error } = await supabase.from('classrooms').update({
        name,
        grade: grade || null,
        teacher_user_id: teacherId || null,
      }).eq('id', editId);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Sala atualizada!' });
        resetForm(); setOpen(false); fetchData();
      }
    } else {
      const { error } = await supabase.from('classrooms').insert({
        name,
        grade: grade || null,
        teacher_user_id: teacherId || null,
      });
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Sala criada!' });
        resetForm(); setOpen(false); fetchData();
      }
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('classrooms').delete().eq('id', id);
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Salas</h1>
          <p className="text-muted-foreground">Gerenciar salas e turmas</p>
        </div>
        <div className="flex gap-2">
        <ExportExcel
          getData={() => classrooms.map(c => ({ name: c.name, grade: c.grade || '', teacher: (c as any).teacher_name || '' }))}
          columns={[
            { key: 'name', header: 'Nome' },
            { key: 'grade', header: 'Série/Turma' },
            { key: 'teacher', header: 'Professor' },
          ]}
          filename="salas"
          buttonLabel="Exportar Salas"
        />
        <ImportExcel
          buttonLabel="Importar Salas"
          fields={[
            { dbField: 'name', label: 'Nome', required: true },
            { dbField: 'grade', label: 'Série/Turma' },
          ]}
          onImport={async (rows) => {
            let success = 0, errors = 0;
            for (const row of rows) {
              if (!row.name) { errors++; continue; }
              const { error } = await supabase.from('classrooms').insert({ name: row.name, grade: row.grade || null });
              if (error) errors++; else success++;
            }
            fetchData();
            return { success, errors };
          }}
        />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova Sala</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? 'Editar Sala' : 'Nova Sala'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Sala</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Sala 1A" />
              </div>
              <div className="space-y-2">
                <Label>Série/Turma</Label>
                <Input value={grade} onChange={e => setGrade(e.target.value)} placeholder="Ex: 1º Ano" />
              </div>
              <div className="space-y-2">
                <Label>Professora</Label>
                <Select value={teacherId} onValueChange={setTeacherId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar professora" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => (
                      <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} className="w-full">{editId ? 'Salvar' : 'Criar Sala'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {classrooms.map((room) => (
          <Card key={room.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <School className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{room.name}</CardTitle>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(room)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(room.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{room.grade || 'Sem série'}</p>
              <p className="text-sm text-muted-foreground">
                Professora: {room.teacher_name || 'Não atribuída'}
              </p>
            </CardContent>
          </Card>
        ))}
        {classrooms.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-8">Nenhuma sala cadastrada.</p>
        )}
      </div>
    </div>
  );
}
