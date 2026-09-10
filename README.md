# Salpe AI

Aplicação de chat com interface preto fosco, animações discretas e layout responsivo. Construída com Next.js, React e Supabase Auth/Postgres, preparada para Vercel.

## Estado da entrega

- Interface, login/cadastro, histórico, busca, exclusão e streaming implementados.
- O projeto Supabase `salpeai` já está conectado e o schema está aplicado.
- RLS está ativo nas tabelas expostas e as gravações sensíveis passam por RPCs protegidas que validam a sessão e o proprietário.
- O backend usa apenas a chave publishable do Supabase junto do JWT autenticado; não depende de `service_role` na aplicação.
- Quotas de chat, criação e exclusão são persistentes e aplicadas dentro do Postgres.
- A integração AnyModel usa a API OpenAI-compatible em `https://anymodel.org/v1/chat/completions` com Bearer auth e streaming.
- A chave privada do AnyModel permanece exclusivamente no ambiente da Vercel/desenvolvimento e nunca deve ser commitada.

## Desenvolvimento

Use Node.js 24:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

## Supabase

O projeto conectado usa:

- URL: `https://cmpkwtqhxgmnfdznaefq.supabase.co`
- Região: `sa-east-1`
- Autenticação: Email/Password
- Tabelas públicas com RLS: `salpe_conversations` e `salpe_messages`
- Dados internos: schema `salpe_private`

`database/schema.sql` contém o schema inicial. As evoluções aplicadas ao projeto ficam registradas em `database/migrations/`.

Para produção, mantenha confirmação de e-mail habilitada e configure Site URL/redirects no Supabase para a URL final da aplicação.

## Variáveis

Configure na Vercel:

| Variável | Valor |
| --- | --- |
| `APP_URL` | URL HTTPS de produção |
| `SUPABASE_URL` | `https://cmpkwtqhxgmnfdznaefq.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publishable ativa do projeto |
| `ANYMODEL_API_KEY` | Chave privada da conta AnyModel; nunca faça commit |
| `ANYMODEL_CHAT_URL` | `https://anymodel.org/v1/chat/completions` |
| `ANYMODEL_API_FORMAT` | `openai-chat-completions` |
| `ANYMODEL_MODELS_JSON` | Lista JSON de modelos exibidos no seletor |

A configuração de exemplo inclui `gpt-5.6-sol`, `gpt-5.6-terra` e `gpt-5.6-luna`.

## Segurança

Sessões são verificadas com Supabase Auth e `session_id`. Cookies são `HttpOnly`, `Secure` em produção e `SameSite=Lax`. Operações sensíveis exigem origem válida e sessão ativa. Leituras usam RLS por proprietário; gravações e quotas passam por funções privadas com wrappers RPC autenticados.

O endpoint do AnyModel é validado no servidor, exige HTTPS em `anymodel.org`/subdomínio e não segue redirecionamentos, reduzindo risco de vazamento da chave e SSRF por configuração incorreta.

## Vercel

Importe `sofiazy0/salpeai`, mantenha o framework Next.js, configure as variáveis acima e publique. O `vercel.json` já define instalação por lockfile e compilação.

Apenas `ANYMODEL_API_KEY` é segredo obrigatório dessa integração. O `.gitignore` bloqueia arquivos `.env*`, exceto o `.env.example` sem segredos privados.

## Verificação

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Limites atuais: 12 gerações/minuto e 100/dia por pessoa; 1.000/dia no site; até 4.096 tokens por resposta; uma geração simultânea por conversa. Contexto limitado às últimas 40 mensagens e 44.000 caracteres. O histórico lateral lista as 100 conversas mais recentes e cada conversa retorna até 400 mensagens.

Veja `SECURITY.md` para detalhes e limitações de segurança.
