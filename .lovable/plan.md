
# SafeSchool - Sistema de Controle de Busca Escolar com Reconhecimento Facial

## Visão Geral
Sistema web que integra com o dispositivo de reconhecimento facial Intelbras para controlar a retirada de crianças na escola. Quando um responsável é identificado pelo dispositivo, o sistema notifica automaticamente a professora da sala correspondente.

## Fluxo Principal
1. **Responsável chega** → dispositivo Intelbras reconhece o rosto
2. **Sistema recebe o evento** → identifica quem é o responsável e quais crianças ele pode buscar
3. **Notificação automática** → alerta visual e sonoro aparece no painel da professora de cada sala
4. **Professora confirma** → libera a criança e registra a saída

## Perfis de Usuário

### Administrador (Secretaria)
- Cadastro de salas, turmas e professoras
- Cadastro de crianças (nome, sala, turma, foto)
- Cadastro de responsáveis autorizados (com vínculo ao dispositivo facial)
- Vincular múltiplos responsáveis a múltiplas crianças
- Relatórios gerais de entradas/saídas
- Gerenciamento de usuários do sistema

### Professora
- Painel da sua sala com lista de alunos
- Recebe notificações em tempo real quando um responsável chega
- Confirma liberação da criança
- Histórico de retiradas da sua sala

### Portaria/Recepção
- Dashboard com feed ao vivo de reconhecimentos
- Visão geral de todas as salas
- Histórico de acessos do dia
- Alerta para pessoas não autorizadas

## Páginas e Funcionalidades

### Login
- Tela de login com email e senha
- Redirecionamento baseado no perfil do usuário

### Dashboard (adaptado por perfil)
- **Admin**: Estatísticas gerais, últimos eventos, atalhos de cadastro
- **Professora**: Lista de alunos da sala, notificações de busca pendentes com alerta sonoro
- **Portaria**: Feed ao vivo de reconhecimentos faciais, status do dispositivo

### Cadastros (Admin)
- **Salas/Turmas**: Nome, professora responsável
- **Crianças**: Nome, foto, sala, turma
- **Responsáveis**: Nome, foto, grau de parentesco, crianças autorizadas
- **Usuários do sistema**: Email, perfil, sala vinculada (para professoras)

### Painel da Professora
- Cards de notificação com foto do responsável, nome, e criança a ser buscada
- Botão "Liberar Criança" para confirmar a entrega
- Som de alerta quando nova notificação chega
- Lista de crianças presentes/já retiradas

### Monitoramento (Portaria)
- Timeline de eventos em tempo real
- Filtros por sala, por horário
- Alertas para reconhecimentos de pessoas não cadastradas

### Relatórios (Admin)
- Histórico por criança, por responsável, por sala
- Filtros por data
- Exportação dos dados

## Integração com Intelbras
- Conexão com a API do dispositivo (http://191.185.205.23:8080) para receber eventos de reconhecimento facial
- Sincronização do cadastro de faces entre o sistema web e o dispositivo
- Edge Function para fazer polling ou receber callbacks do dispositivo

## Tecnologias
- **Frontend**: React + Tailwind + shadcn/ui
- **Backend**: Lovable Cloud (Supabase) para banco de dados, autenticação e Edge Functions
- **Tempo real**: Supabase Realtime para notificações instantâneas às professoras
- **Integração**: Edge Function para comunicar com a API do dispositivo Intelbras
