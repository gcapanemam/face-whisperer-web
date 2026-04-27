## Objetivo

Capturar e armazenar a foto que o dispositivo Intelbras tirou no momento do reconhecimento, para que ela possa ser exibida nos painéis (Recepção, Monitoramento, etc.) junto ao registro do evento.

## Situação atual

- A tabela `recognition_log` já tem a coluna `photo_url` — mas hoje fica sempre `null`.
- O `intelbras-poll` salva apenas os metadados do evento (`raw_data`), sem baixar a imagem.
- Os eventos do Dahua/Intelbras geralmente trazem campos apontando para a foto da captura (ex: `FacePicturePath`, `CardPath`, `CapturePicture`) como caminho **interno** do dispositivo, que precisa ser baixado via Digest Auth.

## Plano de implementação

### 1. Detectar o caminho da foto no evento
No `parseDahuaResponse` / `pollDevice`, identificar campos comuns que apontam para a foto capturada:
- `FacePicturePath`
- `CapturePicturePath`  
- `CardPath`
- `Pictures[0]` / `PictureList`

Logar o `raw_data` dos próximos eventos para confirmar qual campo é retornado pelo modelo SS 3532 MF W (já está sendo salvo, podemos inspecionar via `recognition_log`).

### 2. Baixar a foto do dispositivo (via Digest Auth)
Para cada evento novo com caminho de foto:
- Construir URL: `${device_url}/cgi-bin/RPC_Loadfile${path}` (ou endpoint equivalente que o teste mostrar)
- Usar a classe `DigestAuth` já existente para baixar
- Limitar tamanho (ex: 500KB) e timeout (5s) para não travar o poll

### 3. Subir para o Storage e salvar URL
- Bucket: reaproveitar o bucket público `photos` existente
- Caminho: `recognitions/{deviceId}/{eventId}.jpg`
- Após upload, salvar `publicUrl` em `recognition_log.photo_url`
- Se também houver `pickup_event` criado, salvar a mesma URL ali (vou adicionar coluna `capture_photo_url` na tabela `pickup_events` via migration)

### 4. Migração
```sql
ALTER TABLE pickup_events ADD COLUMN capture_photo_url text;
```
(O `recognition_log.photo_url` já existe, só vamos passar a preenchê-lo.)

### 5. Exibir nas telas
- **ReceptionDashboard**: ao lado do avatar do responsável, mostrar pequeno thumbnail "Captura" da foto real do momento do reconhecimento (clique abre em tamanho maior).
- **Monitoring**: na lista de logs de reconhecimento, exibir thumbnail da `photo_url`.
- **TeacherDashboard**: mesmo tratamento no card do pickup pendente.

### 6. Robustez
- Se o download da foto falhar, **não** falhar o evento — apenas logar e seguir salvando o `recognition_log` sem foto.
- Tratar caso o dispositivo retorne foto em base64 inline (alguns modelos fazem isso), salvando direto sem fetch adicional.

## Resultado esperado
Cada reconhecimento (recognized ou desconhecido) ficará com a foto real capturada pela câmera, permitindo:
- Auditoria visual de quem realmente passou na catraca
- Diferenciar quando alguém usa foto/máscara
- Histórico fotográfico no Monitoramento e Relatórios