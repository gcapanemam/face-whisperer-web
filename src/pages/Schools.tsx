import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, School as SchoolIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate, useNavigate } from 'react-router-dom';

interface School {
  id: string;
  name: string;
  slug: string | null;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  enabled: boolean;
}

export default function Schools() {
  const { isSuperAdmin, loading, reloadSchools, setActiveSchoolId } = useAuth();
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', cnpj: '', address: '', phone: '', enabled: true });
  const [saving, setSaving] = useState(false);

  const fetchSchools = async () => {
    const { data } = await supabase.from('schools').select('*').order('name');
    setSchools((data as School[]) || []);
  };

  useEffect(() => { if (isSuperAdmin) fetchSchools(); }, [isSuperAdmin]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  const reset = () => {
    setEditId(null);
    setForm({ name: '', slug: '', cnpj: '', address: '', phone: '', enabled: true });
  };

  const openEdit = (s: School) => {
    setEditId(s.id);
    setForm({
      name: s.name, slug: s.slug || '', cnpj: s.cnpj || '',
      address: s.address || '', phone: s.phone || '', enabled: s.enabled,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Informe o nome'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || null,
        cnpj: form.cnpj.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        enabled: form.enabled,
      };
      if (editId) {
        const { error } = await supabase.from('schools').update(payload).eq('id', editId);
        if (error) throw error;
        toast.success('Escola atualizada');
      } else {
        const { error } = await supabase.from('schools').insert(payload);
        if (error) throw error;
        toast.success('Escola criada');
      }
      setOpen(false); reset(); fetchSchools(); reloadSchools();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleEnter = (id: string) => {
    setActiveSchoolId(id);
    toast.success('Escola ativa selecionada');
    navigate('/dashboard');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Escolas</h1>
          <p className="text-muted-foreground">Gerencie as escolas do sistema</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova escola</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? 'Editar escola' : 'Nova escola'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Identificador (slug)</Label><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="ex: colegio-x" /></div>
              <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} /></div>
              <div><Label>Endereço</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: v })} /><Label>Ativa</Label></div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {schools.map(s => (
          <Card key={s.id} className={!s.enabled ? 'opacity-60' : ''}>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <SchoolIcon className="h-4 w-4" /> {s.name}
              </CardTitle>
              <Badge variant={s.enabled ? 'default' : 'secondary'}>{s.enabled ? 'Ativa' : 'Inativa'}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {s.slug && <p className="text-xs text-muted-foreground">/{s.slug}</p>}
              {s.cnpj && <p className="text-xs">CNPJ: {s.cnpj}</p>}
              {s.phone && <p className="text-xs">Tel: {s.phone}</p>}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                <Button size="sm" onClick={() => handleEnter(s.id)}>Entrar</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {schools.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">Nenhuma escola cadastrada.</p>}
      </div>
    </div>
  );
}
