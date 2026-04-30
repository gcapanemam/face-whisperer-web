import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Eye, EyeOff, Wifi, WifiOff, Loader2, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Device {
  id: string;
  name: string;
  device_url: string;
  username: string;
  password: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface DeviceForm {
  name: string;
  device_url: string;
  username: string;
  password: string;
  enabled: boolean;
}

const emptyForm: DeviceForm = { name: '', device_url: '', username: '', password: '', enabled: true };

export default function Devices() {
  const { schoolId } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDevices = async () => {
    const { data } = await supabase.from('devices').select('*').order('created_at');
    setDevices(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDevices(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEdit = (device: Device) => {
    setEditingId(device.id);
    setForm({
      name: device.name,
      device_url: device.device_url,
      username: device.username,
      password: device.password,
      enabled: device.enabled,
    });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.device_url.trim() || !form.username.trim() || !form.password.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    setSaving(true);
    try {
      const cleanUrl = form.device_url.replace(/\/+$/, '');
      if (editingId) {
        const { error } = await supabase.from('devices').update({
          name: form.name.trim(),
          device_url: cleanUrl,
          username: form.username.trim(),
          password: form.password,
          enabled: form.enabled,
        }).eq('id', editingId);
        if (error) throw error;
        toast.success('Dispositivo atualizado');
      } else {
        if (!schoolId) { toast.error('Selecione uma escola primeiro'); return; }
        const { error } = await supabase.from('devices').insert({
          name: form.name.trim(),
          device_url: cleanUrl,
          username: form.username.trim(),
          password: form.password,
          enabled: form.enabled,
          school_id: schoolId,
        });
        if (error) throw error;
        toast.success('Dispositivo adicionado');
      }
      setDialogOpen(false);
      fetchDevices();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este dispositivo?')) return;
    const { error } = await supabase.from('devices').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir');
    } else {
      toast.success('Dispositivo excluído');
      fetchDevices();
    }
  };

  const handleTest = async (device: Device) => {
    setTesting(device.id);
    try {
      const { data, error } = await supabase.functions.invoke('intelbras-poll', {
        body: { deviceId: device.id, testOnly: true },
      });
      if (error) throw error;
      if (data?.deviceStatus === 'online') {
        toast.success(`${device.name}: Online ✓`);
      } else {
        toast.warning(`${device.name}: Offline ou sem resposta`);
      }
    } catch (err: any) {
      toast.error(`Erro ao testar: ${err.message}`);
    } finally {
      setTesting(null);
    }
  };

  const toggleEnabled = async (device: Device) => {
    const { error } = await supabase.from('devices').update({ enabled: !device.enabled }).eq('id', device.id);
    if (error) {
      toast.error('Erro ao atualizar');
    } else {
      fetchDevices();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Dispositivos</h1>
          <p className="text-muted-foreground">Gerencie os dispositivos Intelbras conectados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Dispositivo' : 'Novo Dispositivo'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome</Label>
                <Input placeholder="Ex: Portaria Principal" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>URL do Dispositivo</Label>
                <Input placeholder="http://192.168.1.100:8080" value={form.device_url} onChange={e => setForm({ ...form, device_url: e.target.value })} />
              </div>
              <div>
                <Label>Usuário</Label>
                <Input placeholder="admin" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
              </div>
              <div>
                <Label>Senha</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: v })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {devices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MonitorSmartphone className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum dispositivo cadastrado</p>
            <Button className="mt-4" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar Dispositivo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {devices.map(device => (
            <Card key={device.id} className={!device.enabled ? 'opacity-60' : ''}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MonitorSmartphone className="h-4 w-4 shrink-0" />
                    <span className="truncate">{device.name}</span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{device.device_url}</p>
                </div>
                <Badge variant={device.enabled ? 'default' : 'secondary'}>
                  {device.enabled ? 'Ativo' : 'Inativo'}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Usuário: {device.username}</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => handleTest(device)} disabled={testing === device.id}>
                    {testing === device.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Wifi className="h-3 w-3 mr-1" />
                    )}
                    Testar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(device)}>
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleEnabled(device)}>
                    {device.enabled ? <WifiOff className="h-3 w-3 mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
                    {device.enabled ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(device.id)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
