import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Trash2, Search, Link, ScanFace, Loader2, RefreshCw, Pencil, Upload, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PhotoUpload } from '@/components/PhotoUpload';

interface IntelbrasPerson {
  userId: string;
  name: string;
  cardNo: string;
}

export default function Guardians() {
  const [guardians, setGuardians] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [intelbrasPersonId, setIntelbrasPersonId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkGuardianId, setLinkGuardianId] = useState('');
  const [linkChildren, setLinkChildren] = useState<string[]>([]);

  const [intelbrasPersons, setIntelbrasPersons] = useState<IntelbrasPerson[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [personsOpen, setPersonsOpen] = useState(false);
  const [syncingFace, setSyncingFace] = useState(false);

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

  const resetForm = () => {
    setName(''); setPhone(''); setCpf(''); setEmail(''); setIntelbrasPersonId(''); setPhotoUrl(''); setSelectedChildren([]); setEditId(null);
  };

  const openEdit = async (g: any) => {
    setEditId(g.id);
    setName(g.full_name);
    setPhone(g.phone || '');
    setCpf(g.cpf || '');
    setEmail(g.email || '');
    setIntelbrasPersonId(g.intelbras_person_id || '');
    setPhotoUrl(g.photo_url || '');
    // Load linked children
    const { data } = await supabase.from('guardian_children').select('child_id').eq('guardian_id', g.id);
    setSelectedChildren((data || []).map(r => r.child_id));
    setOpen(true);
  };

  const fetchIntelbrasPersons = async () => {
    setLoadingPersons(true);
    try {
      const { data, error } = await supabase.functions.invoke('intelbras-persons', { method: 'POST' });
      if (error) throw error;
      setIntelbrasPersons(data?.persons || []);
      if (data?.persons?.length === 0) {
        toast({ title: 'Nenhuma pessoa encontrada no dispositivo' });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao buscar pessoas', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingPersons(false);
    }
  };

  const handleSelectIntelbrasPerson = (person: IntelbrasPerson) => {
    setIntelbrasPersonId(person.userId);
    if (person.name && !name) setName(person.name);
    setPersonsOpen(false);
    toast({ title: `Pessoa "${person.userId}" selecionada` });
  };

  const handleSave = async () => {
    if (editId) {
      const { error } = await supabase.from('guardians').update({
        full_name: name,
        phone: phone || null,
        cpf: cpf || null,
        email: email || null,
        photo_url: photoUrl || null,
        intelbras_person_id: intelbrasPersonId || null,
      }).eq('id', editId);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return;
      }
      // Update children links
      await supabase.from('guardian_children').delete().eq('guardian_id', editId);
      if (selectedChildren.length > 0) {
        await supabase.from('guardian_children').insert(
          selectedChildren.map(childId => ({ guardian_id: editId, child_id: childId }))
        );
      }
      toast({ title: 'Responsável atualizado!' });
      resetForm(); setOpen(false); fetchData();
    } else {
      const { data, error } = await supabase.from('guardians').insert({
        full_name: name,
        phone: phone || null,
        cpf: cpf || null,
        email: email || null,
        photo_url: photoUrl || null,
        intelbras_person_id: intelbrasPersonId || null,
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
      resetForm(); setOpen(false); fetchData();
    }
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
  const usedIntelbrasIds = guardians.filter(g => !editId || g.id !== editId).map(g => g.intelbras_person_id).filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Responsáveis</h1>
          <p className="text-muted-foreground">{guardians.length} cadastrados</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Novo Responsável</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{editId ? 'Editar Responsável' : 'Cadastrar Responsável'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Foto</Label>
                <PhotoUpload folder="guardians" onUploaded={setPhotoUrl} name={name} currentUrl={photoUrl || null} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ScanFace className="h-4 w-4 text-primary" />
                  Pessoa no Dispositivo Intelbras
                </Label>
                <div className="flex gap-2">
                  <Input value={intelbrasPersonId} onChange={e => setIntelbrasPersonId(e.target.value)} placeholder="ID da pessoa (ex: 01)" className="flex-1" />
                  <Button type="button" variant="outline" onClick={() => { setPersonsOpen(true); if (intelbrasPersons.length === 0) fetchIntelbrasPersons(); }}>
                    <ScanFace className="h-4 w-4 mr-1" /> Buscar
                  </Button>
                </div>
                {intelbrasPersonId && (
                  <Badge variant="secondary" className="mt-1">
                    <ScanFace className="h-3 w-3 mr-1" /> Vinculado: {intelbrasPersonId}
                  </Badge>
                )}
              </div>
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
                          setSelectedChildren(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
                        }}
                      />
                      <span className="text-sm">{c.full_name} {c.classrooms?.name ? `(${c.classrooms.name})` : ''}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={handleSave} className="w-full">{editId ? 'Salvar' : 'Cadastrar'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar responsável..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Dialog open={personsOpen} onOpenChange={setPersonsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5 text-primary" /> Pessoas no Dispositivo Intelbras
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={fetchIntelbrasPersons} disabled={loadingPersons}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loadingPersons ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
          {loadingPersons ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Consultando dispositivo...</span>
            </div>
          ) : intelbrasPersons.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma pessoa encontrada no dispositivo.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {intelbrasPersons.map((person, i) => {
                const isUsed = usedIntelbrasIds.includes(person.userId);
                return (
                  <div key={`${person.userId}-${i}`} className={`flex items-center justify-between rounded-lg border p-3 ${isUsed ? 'opacity-50' : 'cursor-pointer hover:bg-secondary transition-colors'}`} onClick={() => !isUsed && handleSelectIntelbrasPerson(person)}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <ScanFace className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">ID: {person.userId}{person.name && ` — ${person.name}`}</p>
                        {person.cardNo && <p className="text-xs text-muted-foreground">Cartão: {person.cardNo}</p>}
                      </div>
                    </div>
                    {isUsed ? <Badge variant="secondary">Já vinculado</Badge> : <Badge variant="outline" className="text-primary border-primary">Selecionar</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular Crianças</DialogTitle></DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {children.map(c => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={linkChildren.includes(c.id)} onCheckedChange={(checked) => { setLinkChildren(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id)); }} />
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
                <TableHead className="w-12"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Intelbras</TableHead>
                <TableHead className="w-28">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(g => (
                <TableRow key={g.id}>
                  <TableCell>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={g.photo_url || undefined} />
                      <AvatarFallback className="text-xs bg-secondary">{g.full_name[0]}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{g.full_name}</TableCell>
                  <TableCell>{g.phone || '—'}</TableCell>
                  <TableCell>{g.cpf || '—'}</TableCell>
                  <TableCell>
                    {g.intelbras_person_id ? (
                      <Badge variant="secondary" className="gap-1"><ScanFace className="h-3 w-3" /> {g.intelbras_person_id}</Badge>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setLinkGuardianId(g.id); setLinkChildren([]); setLinkOpen(true); }}>
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
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum responsável encontrado.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
