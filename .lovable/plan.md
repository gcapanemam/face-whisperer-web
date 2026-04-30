## Problema

As duas escolas mostram exatamente os mesmos dados porque o usuário atual é **super_admin** — e a política RLS `Super admin all *` (que existe em todas as tabelas tenant) permite que ele veja **todos os registros de todas as escolas**, sem qualquer filtro.

O switcher de escola atualiza apenas um valor `activeSchoolId` no `AuthContext`, mas **as queries SELECT das páginas não usam esse valor** — confiam apenas na RLS, que para super_admin é "ver tudo". Resultado: ao "entrar" em qualquer escola, aparece o conteúdo agregado de todas.

Verifiquei no banco que os dados estão corretamente atribuídos:
- `Escola Principal` (id `0000…0001`): 2 salas, 2 crianças, 1 responsável, 1 dispositivo
- `Instituto Cecília Meireles`: 0 de tudo (vazia, como esperado)

Então o banco está certo. A correção é **no frontend**: aplicar o filtro `school_id = activeSchoolId` em todas as queries quando o usuário é super_admin.

## Solução

Adicionar um filtro client-side por `schoolId` (vindo de `useAuth`) em **todas as queries SELECT** das tabelas tenant. Para usuários comuns isso é redundante (a RLS já filtra), mas é o que fará o switcher do super_admin funcionar.

### 1. Forçar escolha de escola para super_admin

Hoje o super_admin pode ficar com `activeSchoolId = null` e aí `schoolId` fica `null`. Para evitar mostrar "tudo de todas escolas":

- Se `isSuperAdmin && !activeSchoolId`, redirecionar as páginas operacionais (`/dashboard`, `/children`, `/classrooms`, etc.) para `/schools` com aviso "Selecione uma escola para continuar".
- Manter livre o acesso a `/schools` (gerenciamento global).

### 2. Filtrar todas as queries por school_id

Em cada página adicionar `.eq('school_id', schoolId)` nos SELECTs (e abortar a query enquanto `schoolId` for null). Páginas afetadas:

- `src/pages/Children.tsx` — SELECT em `children`, `classrooms`
- `src/pages/Classrooms.tsx` — SELECT em `classrooms`
- `src/pages/Devices.tsx` — SELECT em `devices`
- `src/pages/Guardians.tsx` — SELECT em `guardians`, `children`, `devices`, `guardian_children`, `guardian_devices`
- `src/pages/Users.tsx` — SELECT em `classrooms`, `profiles`, `user_roles`, `monitor_classrooms`
- `src/pages/Monitoring.tsx` — SELECT em `pickup_events`, `recognition_log`, `classrooms`, `children`, `guardians`
- `src/pages/Notifications.tsx` — idem
- `src/pages/Reports.tsx` — idem
- `src/components/dashboards/AdminDashboard.tsx`, `TeacherDashboard.tsx`, `ReceptionDashboard.tsx` — todas as queries de contagem/listagem

### 3. Recarregar dados ao trocar de escola

Adicionar `schoolId` como dependência nos `useEffect` que disparam fetches, para que mudar de escola no switcher recarregue automaticamente as listas.

### 4. Mostrar a escola ativa no header

Pequena melhoria de UX: exibir o nome da escola ativa na sidebar/header (já existe estrutura para isso) para o super_admin saber em qual contexto está.

## Arquivos a editar

```text
src/contexts/AuthContext.tsx          (manter — apenas referência)
src/components/AppLayout.tsx          (guard: redirect super_admin sem escola → /schools)
src/pages/Children.tsx                (filtros + dep schoolId)
src/pages/Classrooms.tsx              (filtros + dep schoolId)
src/pages/Devices.tsx                 (filtros + dep schoolId)
src/pages/Guardians.tsx               (filtros + dep schoolId)
src/pages/Users.tsx                   (filtros + dep schoolId)
src/pages/Monitoring.tsx              (filtros + dep schoolId)
src/pages/Notifications.tsx           (filtros + dep schoolId)
src/pages/Reports.tsx                 (filtros + dep schoolId)
src/components/dashboards/AdminDashboard.tsx     (filtros + dep schoolId)
src/components/dashboards/TeacherDashboard.tsx   (filtros + dep schoolId)
src/components/dashboards/ReceptionDashboard.tsx (filtros + dep schoolId)
src/components/AppSidebar.tsx         (mostrar nome da escola ativa)
```

Sem mudanças no banco — RLS continua correta para usuários não super_admin, e a correção no frontend resolve o caso do super_admin sem afetar segurança (RLS continua sendo a barreira real para os demais perfis).

## Resultado esperado

- Ao entrar na "Escola Principal": aparecem 2 salas, 2 crianças, 1 responsável, 1 dispositivo.
- Ao entrar em "Instituto Cecília Meireles": tudo vazio (como deve ser, pois é uma escola nova).
- Trocar de escola no switcher recarrega automaticamente todas as listas.
- Super_admin sem escola selecionada é levado para `/schools`.
