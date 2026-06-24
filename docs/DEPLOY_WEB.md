# Deploy Web — Aetas na Vercel

Este documento descreve o processo completo de deploy da aplicação web do
Aetas em `playaetas.vercel.app`.

---

## O que o Claude Code já preparou

- **`vercel.json`** na raiz do monorepo — configura build, output directory e
  rewrite de SPA automaticamente.
- **`apps/web/.env.example`** — lista todas as variáveis de ambiente necessárias.

Você não precisa criar nenhum arquivo de configuração adicional.

---

## Passos que você precisa fazer (manual)

### Passo 1 — Criar conta e projeto na Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login (ou crie uma conta).
2. Clique em **"Add New… → Project"**.
3. Conecte ao repositório GitHub do Aetas.
4. **Root Directory**: deixe como **`/`** (raiz do monorepo).
   O `vercel.json` já instrui a Vercel a fazer build em `apps/web/`.
5. **Framework Preset**: a Vercel deve detectar automaticamente "Vite".
   Se não detectar, selecione "Vite" manualmente.
6. **Build Command / Output Directory**: a Vercel lerá do `vercel.json`.
   Não precisa preencher manualmente.

### Passo 2 — Configurar variáveis de ambiente na Vercel

No painel do projeto Vercel → **Settings → Environment Variables**, adicione:

| Variável | Onde buscar | Ambiente |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → "Project URL" | Production + Preview |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → "anon public" key | Production + Preview |
| `VITE_APP_URL` | `https://playaetas.vercel.app` | Production |
| `VITE_APP_URL` | `https://*.vercel.app` (ou a URL de preview) | Preview |

> **Importante**: variáveis prefixadas com `VITE_` são expostas no bundle
> client-side. Nunca adicione a `service_role` key do Supabase aqui —
> ela só deve existir nas Edge Functions do Supabase.

### Passo 3 — Configurar o domínio

1. No painel Vercel → **Settings → Domains**.
2. O domínio padrão `<nome-do-projeto>.vercel.app` é gerado automaticamente.
3. Para garantir `playaetas.vercel.app`, o nome do projeto Vercel deve ser
   **"playaetas"** (definido na criação). Se já estiver tomado, use
   **"aetas-game"** → URL: `aetas-game.vercel.app`.

### Passo 4 — Deploy automático (já configurado por padrão na Vercel)

A Vercel configura automaticamente:
- Push na branch `main` → deploy de **produção**
- Push em qualquer outra branch → **preview deploy** com URL única

Não é necessário nenhuma configuração adicional de CI/CD.

### Passo 5 — Configurar OAuth para o domínio de produção

O login do Aetas usa Supabase Auth com Google OAuth. Para funcionar em
produção, você precisa:

**No painel do Supabase** (Authentication → URL Configuration):
1. Adicionar `https://playaetas.vercel.app` em **"Site URL"**.
2. Adicionar `https://playaetas.vercel.app/**` em **"Redirect URLs"**.

**No Google Cloud Console** (APIs & Services → Credentials → seu OAuth client):
1. Em **"Authorized JavaScript origins"**, adicionar:
   - `https://playaetas.vercel.app`
2. Em **"Authorized redirect URIs"**, adicionar:
   - `https://<seu-projeto>.supabase.co/auth/v1/callback`
   (esta URI já deve existir se o login funciona em dev — só confirme que não está
   restrita a localhost)

### Passo 6 — Deploy das Edge Functions do Supabase

As Edge Functions (Deno) rodam no Supabase, não na Vercel. Deploy separado:

```bash
# Na raiz do monorepo, com a CLI do Supabase instalada e logada:
cd supabase
supabase functions deploy create-game
supabase functions deploy join-game
supabase functions deploy submit-action
supabase functions deploy resolve-dispute
supabase functions deploy award-xp
supabase functions deploy create-daily-game
```

Ou para fazer deploy de todas de uma vez:
```bash
supabase functions deploy
```

Se ainda não fez o link do projeto local com o Supabase remoto:
```bash
supabase link --project-ref <seu-project-ref>
```

### Passo 7 — Aplicar migrations no Supabase de produção

```bash
supabase db push
```

Isso aplica todas as migrations de `supabase/migrations/` no banco de produção.

---

## Verificação pós-deploy

Após o deploy:

1. **URL abre**: acesse `https://playaetas.vercel.app` — deve mostrar a tela
   de login do Aetas.

2. **Login OAuth**: clique em "Entrar com Google" — deve autenticar e redirecionar
   para a lista de partidas.

3. **Partida end-to-end**:
   - Crie uma nova partida (Solo vs IA, qualquer configuração)
   - Jogue um turno
   - A IA deve responder automaticamente (Edge Function `submit-action`)
   - Finalize a partida

4. **Multiplayer (link de convite)**:
   - Crie uma partida "Multiplayer" com 2 jogadores
   - Copie o link de convite — deve ter o formato `https://playaetas.vercel.app?join=<gameId>`
   - Abra em outra aba / dispositivo com outro usuário

---

## O que o Claude Code NÃO pode fazer por você

- Criar a conta na Vercel (requer autenticação no browser)
- Conectar o repositório GitHub ao projeto Vercel (requer OAuth do GitHub)
- Clicar em "Deploy" no painel
- Cadastrar variáveis de ambiente no painel da Vercel (valores sensíveis)
- Configurar o Google OAuth no Google Cloud Console (requer sua conta Google)
- Fazer `supabase link` e `supabase functions deploy` (requer CLI autenticada
  com suas credenciais do Supabase)

---

## Referências

- [Vercel — Monorepo support](https://vercel.com/docs/monorepos)
- [Vercel — vercel.json reference](https://vercel.com/docs/projects/project-configuration)
- [Supabase — Auth with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase CLI — functions deploy](https://supabase.com/docs/reference/cli/supabase-functions-deploy)
