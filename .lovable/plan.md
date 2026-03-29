

# Mostrar Foto do Aluno no Painel da Professora

## O que será feito
Exibir a foto de cada criança em dois lugares no painel da professora:

1. **Lista "Alunos da Sala"** — trocar a bolinha com inicial pela foto real (Avatar com fallback para inicial)
2. **Notificações de Busca** — mostrar a foto da criança sendo buscada ao lado das informações do responsável

## Mudanças

**Arquivo: `src/components/dashboards/TeacherDashboard.tsx`**

- Importar `Avatar`, `AvatarImage`, `AvatarFallback` de `@/components/ui/avatar`
- Na query de `children`, já temos `photo_url` disponível
- Na query de `pickup_events`, incluir `children(full_name, photo_url)` para trazer a foto
- Na seção de notificações de busca: adicionar Avatar da criança ao lado do nome
- Na lista de alunos: substituir o `div` com inicial por `Avatar` com `AvatarImage` usando `child.photo_url`

