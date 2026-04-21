import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Loader2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  secretary: 'Secretaria',
  teacher: 'Professora',
  reception: 'Portaria',
};

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('teacher');
  const [classroomId, setClassroomId] = useState('');
  const [monitorClassroomIds, setMonitorClassroomIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchUsers = async () => {
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    if (!roles) return;
    const userIds = roles.map(r => r.user_id);
    const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', userIds);
    const { data: rooms } = await supabase.from('classrooms').select('id, name, teacher_user_id');
    const { data: monitors } = await supabase.from('monitor_classrooms').select('user_id, classroom_id');
    const merged = roles.map(r => ({
      ...r,
      profile: profiles?.find(p => p.user_id === r.user_id),
      classroom: rooms?.find(c => c.teacher_user_id === r.user_id),
      monitorClassroomIds: (monitors || []).filter(m => m.user_id === r.user_id).map(m => m.classroom_id),
    }));
    setUsers(merged);
  };

  const fetchClassrooms = async () => {
    const { data } = await supabase.from('classrooms').select('id, name, teacher_user_id').order('name');
    setClassrooms(data || []);
  };

  useEffect(() => { fetchUsers(); fetchClassrooms(); }, []);

  const resetForm = () => {
    setEmail(''); setPassword(''); setFullName(''); setRole('teacher'); setClassroomId(''); setMonitorClassroomIds([]); setEditUserId(null);
  };

  const openEdit = (u: any) => {
    setEditUserId(u.user_id);
    setFullName(u.profile?.full_name || '');
    setEmail(u.profile?.email || '');
    setPassword('');
    setRole(u.role);
    setClassroomId(u.classroom?.id || '');
    setMonitorClassroomIds(u.monitorClassroomIds || []);
    setOpen(true);
  };

  const syncMonitorClassrooms = async (userId: string, ids: string[]) => {
    await supabase.from('monitor_classrooms').delete().eq('user_id', userId);
    if (ids.length > 0) {
      await supabase.from('monitor_classrooms').insert(
        ids.map(classroom_id => ({ user_id: userId, classroom_id }))
      );
    }
  };

  const handleSave = async () => {
    if (editUserId) {
      // Update profile
      const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('user_id', editUserId);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return;
      }
      // Update role
      await supabase.from('user_roles').update({ role: role as any }).eq('user_id', editUserId);
      // Update classroom link
      await supabase.from('classrooms').update({ teacher_user_id: null }).eq('teacher_user_id', editUserId);
      if (role === 'teacher' && classroomId) {
        await supabase.from('classrooms').update({ teacher_user_id: editUserId }).eq('id', classroomId);
      }
      // Sync monitor classrooms (reception/secretary)
      if (role === 'reception' || role === 'secretary') {
        await syncMonitorClassrooms(editUserId, monitorClassroomIds);
      } else {
        await supabase.from('monitor_classrooms').delete().eq('user_id', editUserId);
      }
      toast({ title: 'Usuário atualizado!' });
      resetForm(); setOpen(false); fetchUsers(); fetchClassrooms();
      return;
    }

    if (!email || !password || !fullName) {
      toast({ title: 'Erro', description: 'Preencha todos os campos obrigatórios.', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { email, password, full_name: fullName, role, classroom_id: role === 'teacher' ? classroomId || null : null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newUserId = data?.user?.id || data?.userId;
      if (newUserId && (role === 'reception' || role === 'secretary') && monitorClassroomIds.length > 0) {
        await syncMonitorClassrooms(newUserId, monitorClassroomIds);
      }
      toast({ title: 'Usuário criado com sucesso!' });
      resetForm(); setOpen(false); fetchUsers(); fetchClassrooms();
    } catch (err: any) {
      toast({ title: 'Erro ao criar usuário', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string) => {
    await supabase.from('user_roles').delete().eq('user_id', userId);
    await supabase.from('classrooms').update({ teacher_user_id: null }).eq('teacher_user_id', userId);
    await supabase.from('monitor_classrooms').delete().eq('user_id', userId);
    fetchUsers(); fetchClassrooms();
  };

  const toggleMonitorClassroom = (id: string) => {
    setMonitorClassroomIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const availableClassrooms = classrooms.filter(c => !c.teacher_user_id || c.teacher_user_id === editUserId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">Gerenciar usuários do sistema</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editUserId ? 'Editar Usuário' : 'Criar Usuário'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nome completo" />
              </div>
              {!editUserId && (
                <>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@escola.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select value={role} onValueChange={(v) => { setRole(v); if (v !== 'teacher') setClassroomId(''); if (v !== 'reception' && v !== 'secretary') setMonitorClassroomIds([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="secretary">Secretaria</SelectItem>
                    <SelectItem value="teacher">Professora</SelectItem>
                    <SelectItem value="reception">Portaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role === 'teacher' && availableClassrooms.length > 0 && (
                <div className="space-y-2">
                  <Label>Sala (opcional)</Label>
                  <Select value={classroomId} onValueChange={setClassroomId}>
                    <SelectTrigger><SelectValue placeholder="Vincular depois" /></SelectTrigger>
                    <SelectContent>
                      {availableClassrooms.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(role === 'reception' || role === 'secretary') && (
                <div className="space-y-2">
                  <Label>Salas que irá monitorar</Label>
                  <p className="text-xs text-muted-foreground">Deixe vazio para monitorar todas as salas.</p>
                  <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                    {classrooms.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhuma sala cadastrada.</p>
                    )}
                    {classrooms.map(c => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={monitorClassroomIds.includes(c.id)}
                          onCheckedChange={() => toggleMonitorClassroom(c.id)}
                        />
                        <span className="text-sm">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleSave} className="w-full" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editUserId ? 'Salvar' : 'Criar Usuário'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Sala</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.profile?.full_name || '—'}</TableCell>
                  <TableCell>{u.profile?.email || '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{roleLabels[u.role] || u.role}</Badge></TableCell>
                  <TableCell>{u.classroom?.name || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u.user_id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum usuário cadastrado.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
