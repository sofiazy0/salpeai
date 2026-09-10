# Salpe AI

Aplicação de chat com interface preto fosco, animações discretas e layout responsivo. Construída com Next.js, React e Supabase Auth/Postgres, preparada para Vercel.

## Estado da entrega

- Interface, login/cadastro, histórico, busca, exclusão e streaming implementados.
- Contas e conversas dependem de um projeto Supabase dedicado e das variáveis abaixo.
- A integração AnyModel foi validada contra a documentação pública atual: o serviço expõe uma API compatível com OpenAI em `https://anymodel.org/v1`, e o chat usa `POST /v1/chat/completions` com autenticação Bearer e suporte a streaming.
- O adaptador do projeto já usa esse contrato e permanece server-only para evitar exposição da chave da API no navegador.
- Sem configuração, o site mostra um aviso real de configuração e não simula contas nem respostas.

## Desenvolvimento

Use Node.js 24:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

## Autenticação e banco de dados

1. Crie um projeto Supabase dedicado ao Salpe AI.
2. Execute `database/schema.sql` uma vez no SQL Editor. O arquivo é transacional e precisa das tabelas e funções de autenticação do Supabase.
3. Ative Email/Password e a confirmação de e-mail. Configure Site URL como a URL de produção do Salpe e configure um SMTP para e-mails de confirmação em produção. Ajuste os limites de autenticação do Supabase ao uso previsto.
4. Cadastre na Vercel: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` e `RATE_LIMIT_SECRET` (segredo aleatório de pelo menos 32 caracteres).
5. Configure `APP_URL` com a origem HTTPS de produção. O servidor também reconhece as origens fornecidas pela Vercel em `VERCEL_URL` e `VERCEL_PROJECT_PRODUCTION_URL`.

As variáveis são exclusivas do servidor. Não use o prefixo `NEXT_PUBLIC_` para nenhuma chave deste projeto. A secret key é usada para quotas e gravações; leituras usam o token da pessoa e RLS. Autorizações usam o ID validado, nunca `user_metadata`.

O cadastro envia a confirmação pelo Supabase. Depois de confirmar, a pessoa volta e entra com e-mail e senha. A aplicação não inclui recuperação de senha nem integrações sociais nesta versão.

## AnyModel

A base documentada é `https://anymodel.org/v1`. O adaptador usa o endpoint de chat completo `https://anymodel.org/v1/chat/completions`.

Configure estas variáveis na Vercel:

| Variável | Valor |
| --- | --- |
| `ANYMODEL_API_KEY` | Chave privada da conta AnyModel; nunca faça commit |
| `ANYMODEL_CHAT_URL` | `https://anymodel.org/v1/chat/completions` |
| `ANYMODEL_MODELS_JSON` | Array de objetos `{ "id": "id-real", "name": "nome-exibido" }` |
| `ANYMODEL_API_FORMAT` | `openai-chat-completions` |

A configuração de exemplo inclui `gpt-5.6-sol`, `gpt-5.6-terra` e `gpt-5.6-luna`, que podem ser trocados por outros IDs suportados pelo catálogo AnyModel.

O adaptador usa `Authorization: Bearer`, `model`, `messages`, `stream: true` e `max_tokens: 4096`. O endpoint é validado no servidor e só aceita HTTPS em `anymodel.org` ou subdomínios, reduzindo risco de SSRF por configuração indevida.

## Vercel

Importe `sofiazy0/salpeai`, mantenha o framework Next.js, configure as variáveis e publique. O arquivo `vercel.json` define instalação por lockfile e compilação. Um deploy via upload de arquivos não cria automaticamente a integração Git; vincule o repositório nas configurações para publicar futuros pushes automaticamente.

A chave `ANYMODEL_API_KEY` deve existir apenas nas Environment Variables da Vercel (Production/Preview conforme necessário) ou em `.env.local` no desenvolvimento. O `.gitignore` bloqueia arquivos `.env*`, exceto o `.env.example` sem segredos.

## Verificação

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Os testes executam as políticas SQL em Postgres/PGlite, com primitivas de identidade de teste. Cobrem isolamento entre duas contas, revogação de sessão, escrita direta bloqueada, quotas, validação de entrada, CSRF e SSE fragmentado. Não substituem uma verificação real de cadastro/e-mail/AnyModel com as credenciais de produção.

Limites atuais: 12 gerações/minuto e 100/dia por pessoa; 1.000/dia no site; até 4.096 tokens por resposta; uma geração simultânea por conversa. Contexto limitado às últimas 40 mensagens e 44.000 caracteres. O histórico lateral lista as 100 conversas mais recentes e cada conversa retorna até 400 mensagens. Respostas interrompidas não são salvas como completas. Ajuste limites considerando custos e capacidade do provedor.

Veja `SECURITY.md` para detalhes e limitações de segurança.
