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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Search, Link, ScanFace, Loader2, RefreshCw, Pencil, Upload, CheckCircle, Monitor } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PhotoUpload } from '@/components/PhotoUpload';
import { ImportExcel } from '@/components/ImportExcel';

interface IntelbrasPerson {
  userId: string;
  name: string;
  cardNo: string;
}

interface DeviceLink {
  device_id: string;
  intelbras_person_id: string;
  synced: boolean;
}

export default function Guardians() {
  const [guardians, setGuardians] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [deviceLinks, setDeviceLinks] = useState<DeviceLink[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkGuardianId, setLinkGuardianId] = useState('');
  const [linkChildren, setLinkChildren] = useState<string[]>([]);

  const [intelbrasPersons, setIntelbrasPersons] = useState<IntelbrasPerson[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [personsOpen, setPersonsOpen] = useState(false);
  const [personsDeviceId, setPersonsDeviceId] = useState<string>('');
  const [activeDeviceLinkIndex, setActiveDeviceLinkIndex] = useState<number>(0);
  const [syncingFace, setSyncingFace] = useState(false);

  // Guardian devices map for display
  const [guardianDevicesMap, setGuardianDevicesMap] = useState<Record<string, DeviceLink[]>>({});

  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: g }, { data: c }, { data: d }, { data: gd }] = await Promise.all([
      supabase.from('guardians').select('*').order('full_name'),
      supabase.from('children').select('id, full_name, classrooms(name)').order('full_name'),
      supabase.from('devices').select('id, name, enabled').eq('enabled', true).order('name'),
      supabase.from('guardian_devices').select('*'),
    ]);
    setGuardians(g || []);
    setChildren(c || []);
    setDevices(d || []);

    // Build map guardian_id -> device links
    const map: Record<string, DeviceLink[]> = {};
    for (const link of (gd || [])) {
      if (!map[link.guardian_id]) map[link.guardian_id] = [];
      map[link.guardian_id].push({ device_id: link.device_id, intelbras_person_id: link.intelbras_person_id, synced: link.synced });
    }
    setGuardianDevicesMap(map);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setName(''); setPhone(''); setCpf(''); setEmail(''); setPhotoUrl(''); setSelectedChildren([]); setDeviceLinks([]); setEditId(null);
  };

  const openEdit = async (g: any) => {
    setEditId(g.id);
    setName(g.full_name);
    setPhone(g.phone || '');
    setCpf(g.cpf || '');
    setEmail(g.email || '');
    setPhotoUrl(g.photo_url || '');
    const [{ data: childLinks }, { data: devLinks }] = await Promise.all([
      supabase.from('guardian_children').select('child_id').eq('guardian_id', g.id),
      supabase.from('guardian_devices').select('device_id, intelbras_person_id, synced').eq('guardian_id', g.id),
    ]);
    setSelectedChildren((childLinks || []).map(r => r.child_id));
    setDeviceLinks((devLinks || []).map(r => ({ device_id: r.device_id, intelbras_person_id: r.intelbras_person_id, synced: r.synced })));
    setOpen(true);
  };

  const addDeviceLink = () => {
    const unlinked = devices.filter(d => !deviceLinks.some(l => l.device_id === d.id));
    if (unlinked.length === 0) {
      toast({ title: 'Todos os dispositivos já estão vinculados' });
      return;
    }
    setDeviceLinks([...deviceLinks, { device_id: unlinked[0].id, intelbras_person_id: '', synced: false }]);
  };

  const removeDeviceLink = (index: number) => {
    setDeviceLinks(deviceLinks.filter((_, i) => i !== index));
  };

  const updateDeviceLink = (index: number, field: keyof DeviceLink, value: string) => {
    const updated = [...deviceLinks];
    (updated[index] as any)[field] = value;
    setDeviceLinks(updated);
  };

  const fetchIntelbrasPersons = async (deviceId: string) => {
    setLoadingPersons(true);
    try {
      const { data, error } = await supabase.functions.invoke('intelbras-persons', { body: { deviceId } });
      if (error) throw error;
      setIntelbrasPersons(data?.persons || []);
      setPersonsDeviceId(deviceId);
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
    const updated = [...deviceLinks];
    updated[activeDeviceLinkIndex].intelbras_person_id = person.userId;
    setDeviceLinks(updated);
    if (person.name && !name) setName(person.name);
    setPersonsOpen(false);
    toast({ title: `Pessoa "${person.userId}" selecionada` });
  };

  const handleSendFaceToDevice = async (link: DeviceLink) => {
    if (!link.intelbras_person_id) {
      toast({ title: 'Informe o ID da pessoa no dispositivo', variant: 'destructive' });
      return;
    }
    if (!photoUrl) {
      toast({ title: 'Adicione uma foto antes de enviar ao dispositivo', variant: 'destructive' });
      return;
    }
    setSyncingFace(true);
    try {
      const { data, error } = await supabase.functions.invoke('intelbras-face', {
        body: { action: 'set', personId: link.intelbras_person_id, photoUrl, deviceId: link.device_id },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: 'Foto enviada ao dispositivo!' });
      } else {
        toast({ title: 'Erro ao enviar', description: data?.error || 'Erro desconhecido', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao enviar foto', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingFace(false);
    }
  };

  const handleCheckFaceOnDevice = async (link: DeviceLink) => {
    if (!link.intelbras_person_id) {
      toast({ title: 'Informe o ID da pessoa no dispositivo', variant: 'destructive' });
      return;
    }
    setSyncingFace(true);
    try {
      const { data, error } = await supabase.functions.invoke('intelbras-face', {
        body: { action: 'check', personId: link.intelbras_person_id, deviceId: link.device_id },
      });
      if (error) throw error;
      if (data?.hasFace) {
        toast({ title: '✅ Face cadastrada no dispositivo', description: `${data.total} face(s) encontrada(s)` });
      } else {
        toast({ title: 'Nenhuma face cadastrada no dispositivo para este ID', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao verificar face', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingFace(false);
    }
  };

  const handleSave = async () => {
    if (editId) {
      const { error } = await supabase.from('guardians').update({
        full_name: name,
        phone: phone || null,
        cpf: cpf || null,
        email: email || null,
        photo_url: photoUrl || null,
        intelbras_person_id: deviceLinks.length > 0 ? deviceLinks[0].intelbras_person_id : null,
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
      // Update device links
      await supabase.from('guardian_devices').delete().eq('guardian_id', editId);
      const validLinks = deviceLinks.filter(l => l.intelbras_person_id);
      if (validLinks.length > 0) {
        await supabase.from('guardian_devices').insert(
          validLinks.map(l => ({ guardian_id: editId, device_id: l.device_id, intelbras_person_id: l.intelbras_person_id, synced: l.synced }))
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
        intelbras_person_id: deviceLinks.length > 0 ? deviceLinks[0].intelbras_person_id : null,
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

      // Insert device links
      const validLinks = deviceLinks.filter(l => l.intelbras_person_id);
      if (validLinks.length > 0 && data) {
        await supabase.from('guardian_devices').insert(
          validLinks.map(l => ({ guardian_id: data.id, device_id: l.device_id, intelbras_person_id: l.intelbras_person_id, synced: l.synced }))
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
  const getDeviceName = (deviceId: string) => devices.find(d => d.id === deviceId)?.name || 'Dispositivo';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Responsáveis</h1>
          <p className="text-muted-foreground">{guardians.length} cadastrados</p>
        </div>
        <div className="flex gap-2">
        <ImportExcel
          buttonLabel="Importar Responsáveis"
          fields={[
            { dbField: 'full_name', label: 'Nome', required: true },
            { dbField: 'phone', label: 'Telefone' },
            { dbField: 'cpf', label: 'CPF' },
            { dbField: 'email', label: 'Email' },
          ]}
          onImport={async (rows) => {
            let success = 0, errors = 0;
            for (const row of rows) {
              if (!row.full_name) { errors++; continue; }
              const { error } = await supabase.from('guardians').insert({
                full_name: row.full_name,
                phone: row.phone || null,
                cpf: row.cpf || null,
                email: row.email || null,
              });
              if (error) errors++; else success++;
            }
            fetchData();
            return { success, errors };
          }}
        />
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

              {/* Device links section */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" />
                  Dispositivos Intelbras
                </Label>
                {deviceLinks.map((link, index) => (
                  <div key={index} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Select value={link.device_id} onValueChange={(v) => updateDeviceLink(index, 'device_id', v)}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Dispositivo" />
                        </SelectTrigger>
                        <SelectContent>
                          {devices.map(d => (
                            <SelectItem key={d.id} value={d.id} disabled={deviceLinks.some((l, i) => i !== index && l.device_id === d.id)}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDeviceLink(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={link.intelbras_person_id}
                        onChange={e => updateDeviceLink(index, 'intelbras_person_id', e.target.value)}
                        placeholder="ID da pessoa (ex: 01)"
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        setActiveDeviceLinkIndex(index);
                        setPersonsOpen(true);
                        fetchIntelbrasPersons(link.device_id);
                      }}>
                        <ScanFace className="h-4 w-4 mr-1" /> Buscar
                      </Button>
                    </div>
                    {link.intelbras_person_id && (
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="secondary" className="gap-1">
                          <ScanFace className="h-3 w-3" /> {link.intelbras_person_id}
                        </Badge>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleSendFaceToDevice(link)} disabled={syncingFace || !photoUrl}>
                          {syncingFace ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                          Enviar foto
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleCheckFaceOnDevice(link)} disabled={syncingFace}>
                          {syncingFace ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                          Verificar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {devices.length > deviceLinks.length && (
                  <Button type="button" variant="outline" size="sm" onClick={addDeviceLink} className="w-full">
                    <Plus className="h-4 w-4 mr-1" /> Vincular dispositivo
                  </Button>
                )}
                {devices.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum dispositivo cadastrado.</p>
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
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar responsável..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Dialog open={personsOpen} onOpenChange={setPersonsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5 text-primary" /> Pessoas no Dispositivo
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => fetchIntelbrasPersons(personsDeviceId)} disabled={loadingPersons}>
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
              {intelbrasPersons.map((person, i) => (
                <div key={`${person.userId}-${i}`} className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-secondary transition-colors" onClick={() => handleSelectIntelbrasPerson(person)}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <ScanFace className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">ID: {person.userId}{person.name && ` — ${person.name}`}</p>
                      {person.cardNo && <p className="text-xs text-muted-foreground">Cartão: {person.cardNo}</p>}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-primary border-primary">Selecionar</Badge>
                </div>
              ))}
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
                <TableHead>Dispositivos</TableHead>
                <TableHead className="w-28">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(g => {
                const links = guardianDevicesMap[g.id] || [];
                return (
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
                      {links.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {links.map((l, i) => (
                            <Badge key={i} variant="secondary" className="gap-1 text-xs">
                              <Monitor className="h-3 w-3" /> {getDeviceName(l.device_id)}: {l.intelbras_person_id}
                            </Badge>
                          ))}
                        </div>
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
                );
              })}
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
