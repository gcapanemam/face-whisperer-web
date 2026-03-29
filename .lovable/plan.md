

# Gerenciamento de Dispositivos Intelbras pela Interface

## Visão Geral
Atualmente as credenciais do dispositivo Intelbras são fixas em variáveis de ambiente (secrets). O usuário quer poder editar URL, usuário e senha pelo sistema, e adicionar múltiplos dispositivos.

## Mudanças

### 1. Nova tabela `devices` (migração)
```sql
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  device_url text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Apenas admins gerenciam dispositivos
CREATE POLICY "Admins can manage devices" ON public.devices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Recepção pode visualizar dispositivos
CREATE POLICY "Reception can view devices" ON public.devices FOR SELECT
  USING (has_role(auth.uid(), 'reception'::app_role));

-- Trigger de updated_at
CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

Migrar o dispositivo atual (da env var) para a tabela via INSERT inicial com os dados atuais.

### 2. Nova página de Configurações de Dispositivos (`src/pages/Devices.tsx`)
- Listagem de dispositivos com nome, URL, status (ativo/inativo)
- Formulário (Dialog) para adicionar/editar: nome, URL, usuário, senha
- Campo de senha com toggle de visibilidade
- Botão de testar conexão (chama edge function com as credenciais informadas)
- Botão de excluir dispositivo
- Acessível apenas por admins

### 3. Rota e navegação
- Adicionar rota `/devices` em `App.tsx`
- Adicionar link "Dispositivos" no `AppSidebar.tsx` (apenas para admin)

### 4. Atualizar Edge Functions para ler do banco
- **`intelbras-poll`**: Receber `deviceId` opcional no body. Buscar credenciais da tabela `devices` via Supabase service role. Se não receber deviceId, iterar todos os dispositivos ativos.
- **`intelbras-face`**: Receber `deviceId` opcional no body. Buscar credenciais da tabela `devices`. Fallback para env vars se não houver dispositivos na tabela.
- **`intelbras-persons`**: Receber `deviceId` no body e buscar credenciais da tabela.

### 5. Atualizar ReceptionDashboard
- Mostrar seletor de dispositivo (se houver mais de um)
- Passar `deviceId` ao chamar `intelbras-poll`

## Arquivos impactados
- **Novo**: `src/pages/Devices.tsx`
- **Editar**: `src/App.tsx`, `src/components/AppSidebar.tsx`
- **Editar**: `supabase/functions/intelbras-poll/index.ts`, `supabase/functions/intelbras-face/index.ts`, `supabase/functions/intelbras-persons/index.ts`
- **Editar**: `src/components/dashboards/ReceptionDashboard.tsx` (seletor de dispositivo)
- **Migração**: criar tabela `devices`

