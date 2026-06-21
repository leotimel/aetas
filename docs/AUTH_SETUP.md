# Auth Setup — Google + Apple OAuth

Passos manuais necessários para configurar login social no Aetas.
Nada aqui pode ser automatizado — requer acesso aos consoles do Google, Apple e Supabase.

> **Por que só OAuth?** Conforme `ARCHITECTURE.md`: Google + Apple já entregam nome
> e foto prontos, úteis para identificar jogadores numa partida de 4-8 pessoas,
> sem construir fluxo de recuperação de senha.

---

## Pré-requisito: criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project**
2. Anote:
   - **Project URL**: `https://<seu-projeto>.supabase.co`
   - **Anon key** (público, vai no client)
   - **Service role key** (privado, vai nas Edge Functions — nunca exponha no client)
3. No Supabase Dashboard → **Settings → General**: anote o **Project Reference ID**

---

## Seção 1 — Google OAuth

### 1.1 Google Cloud Console

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie ou selecione um projeto → **APIs & Services → OAuth consent screen**
3. Tipo: **External** → preencha nome do app ("Aetas"), e-mail de suporte
4. Escopos mínimos: `email`, `profile`, `openid`
5. Adicione seu e-mail em "Test users" (enquanto em desenvolvimento)
6. Vá em **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
7. Application type: **Web application**
8. Authorized redirect URIs — adicione:
   ```
   https://<seu-projeto>.supabase.co/auth/v1/callback
   ```
   (Para dev local com Supabase CLI:)
   ```
   http://localhost:54321/auth/v1/callback
   ```
9. Clique **Create** → anote o **Client ID** e o **Client Secret**

### 1.2 Supabase Dashboard

1. **Authentication → Providers → Google** → habilitar
2. Cole o **Client ID** e **Client Secret** obtidos acima
3. Salve

### 1.3 Variáveis de ambiente

Em `supabase/.env` (crie o arquivo, não commite):

```env
GOOGLE_CLIENT_ID=<seu-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<seu-client-secret>
```

---

## Seção 2 — Apple OAuth ("Sign in with Apple")

Apple é mais complexo que Google. Requer uma Apple Developer account paga ($99/ano).

### 2.1 App ID (App Identifier)

1. Acesse [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles**
2. **Identifiers → +** → App IDs → App
3. Description: "Aetas"
4. Bundle ID (Explicit): `com.seudominio.aetas` (ex: `com.timel.aetas`)
5. Capabilities: marque **Sign in with Apple** → **Enable as primary App ID**
6. Registre

### 2.2 Service ID (para web/OAuth redirect)

O **Service ID** é o que o Supabase usa como `client_id` no fluxo web.

1. **Identifiers → +** → Services IDs
2. Description: "Aetas Web"
3. Identifier: `com.seudominio.aetas.web` (ex: `com.timel.aetas.web`)
4. Registre → clique no Service ID criado → **Configure**
5. Primary App ID: selecione o App ID criado em 2.1
6. Domains and Subdomains:
   ```
   <seu-projeto>.supabase.co
   ```
7. Return URLs:
   ```
   https://<seu-projeto>.supabase.co/auth/v1/callback
   ```
8. Salve → Continue → Register
9. Anote o **Service ID** (ex: `com.timel.aetas.web`)

### 2.3 Chave privada (.p8)

O `secret` da Apple não é uma senha simples — é um **JWT assinado** com uma chave privada.

1. **Keys → +** → Sign in with Apple (marque)
2. Key Name: "Aetas Sign In Key"
3. Configure → Primary App ID: selecione o App ID de 2.1
4. Registre → **Download** o arquivo `.p8` (você só pode baixar UMA vez)
5. Anote:
   - **Key ID** (ex: `ABC1234567`)
   - **Team ID** (canto superior direito do Apple Developer, ex: `XYZ987654`)
6. Guarde o arquivo `.p8` em local seguro (não commite)

### 2.4 Gerar o JWT secret

O Supabase precisa do `secret` como um JWT assinado. Gere com o script abaixo
(rode localmente, precisa de Node.js):

```bash
node -e "
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./AuthKey_<KEY_ID>.p8', 'utf8');
const teamId  = '<SEU_TEAM_ID>';
const clientId = '<SEU_SERVICE_ID>';
const keyId   = '<SEU_KEY_ID>';

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',  // máximo permitido pela Apple: 6 meses
  audience: 'https://appleid.apple.com',
  issuer: teamId,
  subject: clientId,
  keyid: keyId,
});

console.log(token);
"
```

> Se não tiver `jsonwebtoken`: `npm install jsonwebtoken` (só para geração local).

### 2.5 Supabase Dashboard

1. **Authentication → Providers → Apple** → habilitar
2. **Service ID**: `com.seudominio.aetas.web`
3. **Secret (JWT)**: cole o token gerado no passo 2.4
4. Salve

> **Atenção:** O JWT da Apple expira em 6 meses. Você precisa regenerar e atualizar
> no Supabase antes do vencimento — coloque um lembrete no calendário.

### 2.6 Variáveis de ambiente

Em `supabase/.env`:

```env
APPLE_SERVICE_ID=com.seudominio.aetas.web
APPLE_SECRET_JWT=<jwt-gerado-no-passo-2.4>
```

---

## Seção 3 — URLs de redirect por ambiente

| Ambiente | URL de redirect |
|---|---|
| Supabase local (CLI) | `http://localhost:54321/auth/v1/callback` |
| Dev web local | `http://localhost:3000/auth/callback` |
| Produção web | `https://<seu-dominio>/auth/callback` |
| Produção Supabase | `https://<seu-projeto>.supabase.co/auth/v1/callback` |

Adicione **todas** as URLs necessárias nos consoles do Google e Apple.
No Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**.

---

## Seção 4 — Teste do fluxo completo

Após configurar ambos os providers:

1. Rode `supabase start` localmente
2. Rode `supabase db reset` para aplicar as migrations (incluindo o trigger de `user_profiles`)
3. No debug-client (Fase 3): clique em "Login com Google" → autorize → verifique:
   - Sessão criada (`supabase.auth.getSession()` retorna usuário)
   - `user_profiles` tem uma linha criada automaticamente pelo trigger
   - `display_name` preenchido com o nome do Google/Apple

```sql
-- Verificação manual no Supabase Dashboard → SQL Editor:
SELECT id, display_name, account_xp, created_at
FROM user_profiles
ORDER BY created_at DESC
LIMIT 5;
```

---

## Seção 5 — Variáveis de ambiente para Edge Functions

As Edge Functions (Fase 2.3) precisarão de:

```env
# supabase/functions/.env (não commite)
SUPABASE_URL=https://<seu-projeto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
# Segredo compartilhado que protege a função timeout-sweep (gere um valor aleatório forte)
CRON_SECRET=<segredo-aleatorio-forte>
```

O `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são
injetados automaticamente nas Edge Functions pelo runtime do Supabase — declará-los
no `.env` só é necessário para `supabase functions serve` local. O `CRON_SECRET`
sempre precisa ser definido (via `supabase secrets set CRON_SECRET=...`).

> **Antes de fazer deploy das Edge Functions:** rode
> `pnpm --filter @aetas/backend-core bundle` para gerar
> `packages/backend-core/dist/index.js` — o artefato que as funções importam via
> o import map em `supabase/functions/deno.json`.

### Agendamento do timeout-sweep

A função `timeout-sweep` deve rodar periodicamente (ex: a cada 5 min). Agende via
pg_cron no Supabase Dashboard → SQL Editor, chamando-a com o header do segredo:

```sql
select cron.schedule(
  'aetas-timeout-sweep', '*/5 * * * *',
  $$ select net.http_post(
       url     := 'https://<seu-projeto>.supabase.co/functions/v1/timeout-sweep',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
     ) $$
);
```

---

## Checklist de conclusão

- [ ] Projeto criado no Supabase, Project URL e chaves anotadas
- [ ] Google OAuth: Client ID + Secret configurados no Supabase
- [ ] Apple: App ID + Service ID + .p8 key criados
- [ ] Apple: JWT secret gerado e configurado no Supabase (lembrete de renovação em 6 meses)
- [ ] Redirect URIs de todos os ambientes adicionados nos consoles Google e Apple
- [ ] `supabase db reset` local: migrations aplicadas sem erro
- [ ] Login com Google funciona e cria `user_profiles` automaticamente
- [ ] Login com Apple funciona e cria `user_profiles` automaticamente
