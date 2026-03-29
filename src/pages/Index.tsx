import { Shield, CheckCircle, Camera, Bell, BarChart3, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const WHATSAPP_NUMBER = '553131570638';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Olá! Tenho interesse no SafeSchool. Gostaria de saber mais sobre o sistema.')}`;

const features = [
  {
    icon: Camera,
    title: 'Reconhecimento Facial',
    description: 'Identificação automática de responsáveis por câmeras Intelbras com IA embarcada.',
  },
  {
    icon: Bell,
    title: 'Alertas em Tempo Real',
    description: 'Professoras recebem notificação instantânea quando o responsável chega na portaria.',
  },
  {
    icon: Shield,
    title: 'Controle de Acesso',
    description: 'Apenas responsáveis autorizados podem retirar as crianças. Segurança total.',
  },
  {
    icon: Users,
    title: 'Gestão Completa',
    description: 'Cadastro de alunos, responsáveis, salas e professoras em um só lugar.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios Detalhados',
    description: 'Histórico completo de retiradas com filtros por período, criança e responsável.',
  },
  {
    icon: CheckCircle,
    title: 'Múltiplos Dispositivos',
    description: 'Gerencie vários pontos de acesso com dispositivos independentes.',
  },
];

const steps = [
  { number: '01', title: 'Cadastre', description: 'Registre alunos, responsáveis e suas fotos no sistema.' },
  { number: '02', title: 'Sincronize', description: 'As fotos são enviadas automaticamente para o dispositivo Intelbras.' },
  { number: '03', title: 'Monitore', description: 'O reconhecimento facial identifica e notifica em tempo real.' },
];

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold">SafeSchool</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/login')}>Entrar</Button>
            <Button asChild className="gap-2">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                Fale Conosco
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary mb-8">
            <Shield className="h-4 w-4" />
            Segurança escolar inteligente
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight max-w-4xl mx-auto">
            Controle de saída escolar com{' '}
            <span className="text-primary">reconhecimento facial</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            O SafeSchool garante que apenas responsáveis autorizados retirem as crianças,
            com identificação automática por câmera e notificações em tempo real para as professoras.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="text-base px-8 py-6 gap-2 shadow-lg shadow-primary/25">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                Quero contratar
                <ArrowRight className="h-5 w-5" />
              </a>
            </Button>
            <Button variant="outline" size="lg" className="text-base px-8 py-6" onClick={() => navigate('/login')}>
              Acessar o sistema
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-card/50">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl font-bold">Tudo que sua escola precisa</h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
              Uma solução completa para segurança e gestão de saída escolar.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="group hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl font-bold">Como funciona</h2>
            <p className="mt-4 text-muted-foreground text-lg">Simples de configurar, poderoso em segurança.</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.number} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-display text-2xl font-bold mb-5 shadow-lg shadow-primary/20">
                  {s.number}
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="relative rounded-3xl bg-primary px-8 py-16 text-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
                Proteja sua escola hoje
              </h2>
              <p className="text-primary-foreground/80 text-lg max-w-xl mx-auto mb-8">
                Entre em contato pelo WhatsApp e descubra como o SafeSchool pode transformar a segurança da sua instituição.
              </p>
              <Button asChild size="lg" variant="secondary" className="text-base px-10 py-6 gap-2 font-semibold shadow-xl">
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  Falar no WhatsApp
                  <ArrowRight className="h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-display font-bold">SafeSchool</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} SafeSchool. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
