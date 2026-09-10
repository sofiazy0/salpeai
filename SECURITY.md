# Segurança do Salpe AI

Nenhum sistema pode garantir ausência total de vulnerabilidades. As medidas abaixo reduzem riscos concretos; operação, atualizações e revisão contínua continuam necessárias.

## Proteções implementadas

- Sessões verificadas no servidor com Supabase Auth, confirmação de e-mail e validação adicional de `session_id` em `auth.sessions`.
- Cookies `HttpOnly`, `Secure` em produção, `SameSite=Lax`, escopo `/` e prefixo `__Host-`. Tokens nunca são persistidos no localStorage nem retornados ao JavaScript do navegador.
- Verificação de origem conhecida, cabeçalho personalizado e Fetch Metadata para operações de escrita, inclusive login e logout.
- RLS em todas as tabelas expostas; políticas por proprietário e sessão ativa. Chaves estrangeiras compostas impedem mensagens vinculadas a outra conta.
- O app usa somente a chave publishable do Supabase. Gravações sensíveis passam por RPCs autenticadas que chamam funções privadas e validam `auth.uid()`, sessão ativa, propriedade e lease da geração.
- Quotas persistentes e atômicas para chat, criação e exclusão são aplicadas dentro do Postgres com escopos fixos; o cliente não escolhe limites nem consegue usar uma chave privilegiada para ignorá-los.
- A exclusão direta de conversas foi revogada para `authenticated`; exclusões passam pela RPC protegida.
- Cada lease aceita somente um registro de mensagem do usuário antes da resposta, reduzindo abuso de armazenamento pelo endpoint de geração.
- Quota global diária e limite de saída reduzem abuso de créditos; sem fallback para quotas locais em memória.
- Bloqueio temporário de geração por conversa com expiração e identificação única.
- Limites sobre bytes reais do corpo HTTP, caracteres, contexto, modelos, tamanho de resposta e duração da conexão.
- Endpoint de IA definido apenas no servidor, HTTPS e domínio permitido; redirecionamentos desativados para impedir encaminhamento da chave.
- React Markdown sem HTML bruto; imagens remotas não são carregadas; links com `noopener noreferrer`.
- CSP com nonce por resposta, sem scripts inline liberados em produção; bloqueio de frames, cabeçalhos contra MIME sniffing e política de referência.
- Respostas privadas sem cache. Chaves, senhas, corpos de mensagens e erros detalhados de serviços não são registrados nos logs.
- Dependências fixadas por versão e lockfile.

## Condições de operação

A autenticação depende do projeto Supabase conectado, com Email/Password e confirmação de e-mail configurados. Site URL, redirects e SMTP de produção precisam acompanhar o domínio publicado.

As mensagens são armazenadas no Supabase e enviadas à AnyModel para geração. Não existe criptografia de ponta a ponta. O administrador do banco e o provedor têm as permissões inerentes à operação; não prometa sigilo em relação a eles.

A chave `ANYMODEL_API_KEY` deve existir somente no ambiente de execução da Vercel ou em `.env.local` local. Nunca deve ser adicionada ao GitHub, logs, respostas de API ou código entregue ao navegador.

Limites da aplicação não substituem proteção volumétrica na borda. Revise os controles nativos da Vercel, limites de gastos e uso nos painéis dos provedores. Não há testes de carga nem auditoria externa certificada nesta entrega.

Execute verificação de dependências e revise mudanças antes de atualizações. Reporte falhas ao mantenedor de forma privada, sem incluir credenciais nem dados de usuários em issues públicas.
