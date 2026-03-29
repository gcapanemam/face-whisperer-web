

# Vincular Responsáveis a Dispositivos

## Problema
O campo `intelbras_person_id` está na tabela `guardians`, mas com múltiplos dispositivos um responsável pode ter IDs diferentes em cada aparelho, ou estar cadastrado apenas em alguns.

## Solução

### 1. Nova tabela `guardian_devices` (migração)
```sql
CREATE TABLE public.guardian_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  intelbras_person_id text NOT NULL,
  synced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guardian_id, device_id)
);
```
- RLS: admins gerenciam, recepção visualiza
- Migrar dados existentes: para cada responsável com `intelbras_person_id` preenchido, inserir um registro vinculando ao dispositivo existente

### 2. Atualizar cadastro de Responsáveis (`src/pages/Guardians.tsx`)
- Ao invés de um único campo `intelbras_person_id`, mostrar uma seção com checkboxes/lista dos dispositivos ativos
- Para cada dispositivo selecionado, permitir informar o `intelbras_person_id` (ou buscar da lista do aparelho)
- O campo `intelbras_person_id` antigo da tabela `guardians` pode ser mantido como legado mas não mais editado pela UI

### 3. Atualizar Edge Functions
- **`intelbras-poll`**: ao identificar uma pessoa, buscar na tabela `guardian_devices` pelo `intelbras_person_id` + `device_id` em vez de buscar direto em `guardians`
- **`intelbras-face`**: ao enviar foto, registrar/atualizar o vínculo em `guardian_devices` para o dispositivo alvo
- **`intelbras-persons`**: ao listar pessoas, mostrar o status de sincronização por dispositivo

### 4. Atualizar ReceptionDashboard
- O polling já passa `deviceId`; a lógica de matching usará `guardian_devices` para resolver o responsável correto

## Arquivos impactados
- **Migração**: criar tabela `guardian_devices`, migrar dados existentes
- **Editar**: `src/pages/Guardians.tsx` (UI de vínculo por dispositivo)
- **Editar**: `supabase/functions/intelbras-poll/index.ts` (lookup via `guardian_devices`)
- **Editar**: `supabase/functions/intelbras-face/index.ts` (registrar vínculo)
- **Editar**: `supabase/functions/intelbras-persons/index.ts` (contexto por dispositivo)

