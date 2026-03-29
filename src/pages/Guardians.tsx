import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Search, Link } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Guardians() {
  const [guardians, setGuardians] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkGuardianId, setLinkGuardianId] = useState('');
  const [linkChildren, setLinkChildren] = useState<string[]>([]);
  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: g }, { data: c }] = await Promise.all([
      supabase.from('guardians').select('*').order('full_name'),
      supabase.from('children').select('id, full_name, classrooms(name)').order('full_name'),
    ]);
    setGuardians(g || []);
    setChildren(c || []);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    const { data, error } = await supabase.from('guardians').insert({
      full_name: name, phone: phone || null, cpf: cpf || null, email: email || null,
    }).select().single();

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    if (selectedChildren.length > 0 && data) {
      await supabase.from('guardian_children').insert(
        selectedChildren.map(childId => ({ guardian_id: data.id, child_id: childId }))
      );
    }

    toast({ title: 'Responsável cadastrado!' });
    setName(''); setPhone(''); setCpf(''); setEmail(''); setSelectedChildren([]);
    setOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('guardians').delete().eq('id', id);
    fetchData();
  };

  const handleLink = async () => {
    if (linkChildren.length > 0) {
      await supabase.from('guardian_children').insert(
        linkChildren.map(childId => ({ guardian_id: linkGuardianId, child_id: childId }))
      );
      toast({ title: 'Crianças vinculadas!' });
    }
    setLinkOpen(false);
    setLinkChildren([]);
  };

  const filtered = guardians.filter(g => g.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Responsáveis</h1>
          <p className="text-muted-foreground">{guardians.length} cadastrados</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Novo Responsável</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Cadastrar Responsável</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-2">
                <Label>Crianças Autorizadas</Label>
                <div className="max-h-40 overflow-y-auto space-y-2 rounded-lg border p-3">
                  {children.map(c => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedChildren.includes(c.id)}
                        onCheckedChange={(checked) => {
                          setSelectedChildren(prev =>
                            checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                          );
                        }}
                      />
                      <span className="text-sm">{c.full_name} {c.classrooms?.name ? `(${c.classrooms.name})` : ''}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full">Cadastrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar responsável..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Link children dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular Crianças</DialogTitle></DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {children.map(c => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={linkChildren.includes(c.id)}
                  onCheckedChange={(checked) => {
                    setLinkChildren(prev =>
                      checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                    );
                  }}
                />
                <span className="text-sm">{c.full_name}</span>
              </label>
            ))}
          </div>
          <Button onClick={handleLink}>Vincular</Button>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.full_name}</TableCell>
                  <TableCell>{g.phone || '—'}</TableCell>
                  <TableCell>{g.cpf || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setLinkGuardianId(g.id);
                        setLinkChildren([]);
                        setLinkOpen(true);
                      }}>
                        <Link className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(g.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhum responsável encontrado.
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
