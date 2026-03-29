import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Check, X, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function TeacherDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [classroom, setClassroom] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [pendingPickups, setPendingPickups] = useState<any[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchClassroom = async () => {
      const { data } = await supabase.from('classrooms').select('*').eq('teacher_user_id', user.id).single();
      if (data) {
        setClassroom(data);
        const { data: kids } = await supabase.from('children').select('*').eq('classroom_id', data.id);
        setChildren(kids || []);
        const { data: pickups } = await supabase
          .from('pickup_events')
          .select('*, guardians(full_name, photo_url), children(full_name)')
          .eq('classroom_id', data.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        setPendingPickups(pickups || []);
      }
    };

    fetchClassroom();
  }, [user]);

  // Realtime subscription for pickup events
  useEffect(() => {
    if (!classroom) return;

    const channel = supabase
      .channel('pickup-events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pickup_events',
        filter: `classroom_id=eq.${classroom.id}`,
      }, (payload) => {
        const newEvent = payload.new as any;
        // Fetch full data
        supabase
          .from('pickup_events')
          .select('*, guardians(full_name, photo_url), children(full_name)')
          .eq('id', newEvent.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setPendingPickups(prev => [data, ...prev]);
              // Play notification sound
              try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHjmC0teleT4cNoKz4sR3RiEzca3e0IRsTic1d6za0I5kSywqbKXW1J1tVTYkYJvM0KZ+Yks6OGaRwsqliHFUTENdj77JqI13Wk1IYpO+y6uRfGFUTFmMt8msknthVk5fjL3Lr5B7YVdMYY69yq+Re2FXTGCN');
                audio.volume = 0.5;
                audio.play().catch(() => {});
              } catch {}
              toast({
                title: '🔔 Responsável chegou!',
                description: `${data.guardians?.full_name} veio buscar ${data.children?.full_name}`,
              });
            }
          });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [classroom, toast]);

  const handleConfirm = async (eventId: string) => {
    await supabase.from('pickup_events').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: user?.id,
    }).eq('id', eventId);
    setPendingPickups(prev => prev.filter(p => p.id !== eventId));
    toast({ title: 'Criança liberada!' });
  };

  const handleReject = async (eventId: string) => {
    await supabase.from('pickup_events').update({ status: 'rejected' }).eq('id', eventId);
    setPendingPickups(prev => prev.filter(p => p.id !== eventId));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">
          {classroom ? classroom.name : 'Minha Sala'}
        </h1>
        <p className="text-muted-foreground">
          {children.length} alunos • {pendingPickups.length} notificações pendentes
        </p>
      </div>

      {pendingPickups.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-destructive notification-pulse" />
            Notificações de Busca
          </h2>
          {pendingPickups.map((pickup) => (
            <Card key={pickup.id} className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{pickup.guardians?.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Buscando: <strong>{pickup.children?.full_name}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(pickup.recognized_at).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleReject(pickup.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={() => handleConfirm(pickup.id)}>
                    <Check className="h-4 w-4 mr-1" /> Liberar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alunos da Sala</CardTitle>
        </CardHeader>
        <CardContent>
          {children.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum aluno cadastrado nesta sala.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {children.map((child) => (
                <div key={child.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    <span className="text-sm font-medium">{child.full_name[0]}</span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">{child.full_name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
