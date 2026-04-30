## Multi-tenancy por Escola

Tornar o sistema escalável para múltiplas escolas, garantindo isolamento total de dados (dispositivos, salas, usuários, responsáveis, crianças, eventos) entre escolas, usando uma estratégia de **tenant por linha** (`school_id` em todas as tabelas + RLS).

### Modelo conceitual

- Novo papel: **`super_admin`** — único que pode criar/editar escolas e ver dados de todas. Será atribuído ao admin atual existente.
- Papel **`admin`** passa a ser "admin **da escola**" — gerencia apenas dados da própria escola.
- Demais papéis (`teacher`, `reception`, `secretary`) sempre pertencem a **uma única escola**.

```text
super_admin  ──> cria escolas e admins de escola
   │
   └── school A
        ├── admin (escola A)
        ├── teachers / reception / secretary
        ├── classrooms, children, guardians
        ├── devices, pickup_events, recognition_log
   └── school B
        └── (totalmente isolado de A)
```

### Mudanças no banco (migração)

1. Nova tabela `schools` (id, name, slug, cnpj, address, phone, enabled, created_at).
2. Adicionar enum `app_role` o valor `'super_admin'`.
3. Adicionar coluna `school_id uuid NOT NULL REFERENCES schools(id)` em:
   `classrooms, children, guardians, devices, guardian_children, guardian_devices, monitor_classrooms, pickup_events, recognition_log, user_roles, profiles`.
4. Criar **escola padrão** ("Escola Principal") e fazer backfill de `school_id` em todos os registros existentes apontando para ela (preserva dados atuais).
5. Atribuir `super_admin` ao admin existente (definido em memória) e setar `school_id` da escola padrão para todos os usuários atuais.
6. Funções de segurança:
   - `get_user_school(_user_id uuid) returns uuid` (SECURITY DEFINER) — retorna `school_id` do usuário a partir de `user_roles`.
   - `is_super_admin(_user_id uuid) returns boolean`.
   - `has_role_in_school(_user_id, _role, _school_id) returns boolean`.
7. Reescrever **todas as RLS** para padrão:
   - `super_admin` → acesso total.
   - Demais papéis → apenas linhas onde `school_id = get_user_school(auth.uid())`.
   - Manter regras finas existentes (professora vê só sua sala, recepção vê só salas atribuídas em `monitor_classrooms`) **dentro** do filtro de escola.
8. Atualizar `handle_new_user`: profile criado sem `school_id` (será setado pela edge function `create-user`).
9. Trigger `BEFORE INSERT` em cada tabela tenant: se `school_id` for nulo, preencher com `get_user_school(auth.uid())` (segurança/UX).
10. Constraint `UNIQUE (user_id)` em `user_roles` (um usuário pertence a uma só escola/papel) — após dedupe.

### Mudanças nas Edge Functions

- **`create-user`**: passa a exigir `school_id`. `super_admin` pode informar qualquer escola; `admin` só a própria. Insere `school_id` em `profiles` e `user_roles`.
- **Nova `create-school-admin`**: usada pelo `super_admin` para criar uma escola + admin inicial em um único fluxo.
- **`intelbras-poll`, `intelbras-face`, `intelbras-persons`, `intelbras-snapshot`**: ler `device_id` → derivar `school_id` do device e gravar `school_id` em `recognition_log` e `pickup_events`. Validar que o device pertence à escola do chamador (exceto super_admin).

### Mudanças no Frontend

- **`AuthContext`**: expor `schoolId` e `isSuperAdmin` (ler de `user_roles` + `schools`).
- **Nova página `/schools`** (apenas `super_admin`): CRUD de escolas + criar admin inicial.
- **AppSidebar**: mostrar item "Escolas" só para `super_admin`; mostrar nome da escola atual no header.
- **Páginas existentes** (`Classrooms, Children, Guardians, Devices, Users, Monitoring, Reports, Notifications, Dashboards`):
  - Inserts passam a incluir `school_id` (ou deixar trigger preencher).
  - Selects continuam iguais — RLS faz o filtro automaticamente.
  - Em formulários de admin de escola, remover qualquer campo de seleção de escola.
- **`super_admin` switcher**: dropdown no header para escolher "ver como escola X" (filtro client-side aplicado às queries quando definido).
- **Login/Dashboard**: redirecionar `super_admin` para `/schools`; demais para `/dashboard` da escola.

### Pontos técnicos importantes

- `monitor_classrooms.user_id` e `classrooms.id` já permitem o vínculo professora↔sala — basta garantir mesma `school_id`.
- Bucket `photos` continua único, mas caminhos passam a usar prefixo `schools/{school_id}/...` e políticas de Storage filtram por esse prefixo.
- `intelbras_person_id` em `guardian_devices` continua único **por device**, e device pertence a uma escola → sem colisão entre escolas.
- Memória "Credenciais de Admin" será atualizada: o admin atual vira `super_admin`.

### Migração de dados (sem perda)

1. Criar `schools` + escola "Escola Principal".
2. Adicionar colunas `school_id` nullable, backfill com a escola principal, depois `SET NOT NULL`.
3. Promover admin atual a `super_admin`; criar também um `admin` da Escola Principal (mesmo usuário ou novo, conforme preferência).

### Entregáveis

1. Migração SQL (schema + backfill + RLS + triggers + funções).
2. Edge functions atualizadas + nova `create-school-admin`.
3. Frontend: AuthContext, página `/schools`, sidebar, ajustes em todas as páginas de CRUD para passar `school_id`.
4. Atualização das memórias do projeto (perfis de usuário, credenciais).

### Pergunta antes de implementar

Quer que o **super_admin** seja um papel **separado do admin atual** (criamos um novo usuário só para gerenciar escolas) ou que o **admin atual acumule** os dois papéis (super_admin + admin da Escola Principal)?