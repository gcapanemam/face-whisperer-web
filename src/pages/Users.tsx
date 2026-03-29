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
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  secretary: 'Secretaria',
  teacher: 'Professora',
  reception: 'Portaria',
};

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('teacher');
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    if (!roles) return;

    const userIds = roles.map(r => r.user_id);
    const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', userIds);

    const merged = roles.map(r => ({
      ...r,
      profile: profiles?.find(p => p.user_id === r.user_id),
    }));
    setUsers(merged);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    // Create user via Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    if (data.user) {
      // Assign role - need admin to insert
      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: data.user.id,
        role: role as any,
      });

      if (roleError) {
        toast({ title: 'Usuário criado, mas erro ao atribuir perfil', description: roleError.message, variant: 'destructive' });
      } else {
        toast({ title: 'Usuário criado!' });
      }
    }

    setEmail(''); setPassword(''); setFullName(''); setRole('teacher');
    setOpen(false);
    fetchUsers();
  };

  const handleDelete = async (userId: string) => {
    await supabase.from('user_roles').delete().eq('user_id', userId);
    fetchUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">Gerenciar usuários do sistema</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Usuário</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@escola.com" />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="secretary">Secretaria</SelectItem>
                    <SelectItem value="teacher">Professora</SelectItem>
                    <SelectItem value="reception">Portaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">Criar Usuário</Button>
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
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.profile?.full_name || '—'}</TableCell>
                  <TableCell>{u.profile?.email || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{roleLabels[u.role] || u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(u.user_id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhum usuário cadastrado.
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
