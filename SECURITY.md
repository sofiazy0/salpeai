# Segurança do Salpe AI

Nenhum sistema pode garantir ausência total de vulnerabilidades. As medidas abaixo reduzem riscos concretos; operação, atualizações e revisão contínua continuam necessárias.

## Proteções implementadas

- Sessões verificadas no servidor com Supabase Auth, confirmação de e-mail e validação adicional de `session_id` em `auth.sessions`.
- Cookies `HttpOnly`, `Secure` em produção, `SameSite=Lax`, escopo `/` e prefixo `__Host-`. Tokens nunca são persistidos no localStorage nem retornados ao JavaScript do navegador.
- Verificação de origem conhecida, cabeçalho personalizado e Fetch Metadata para operações de escrita, inclusive login e logout.
- RLS em todas as tabelas expostas; políticas por proprietário e sessão ativa. Chaves estrangeiras compostas impedem mensagens vinculadas a outra conta.
- Criação e edição de dados apenas pelo servidor com secret key; consultas com token de usuário e filtro explícito de proprietário. O serviço privilegiado nunca aceita um `user_id` enviado pelo navegador.
- Quotas persistentes e atômicas para autenticação, mensagens, criação e exclusão; identidade do IP obtida do cabeçalho sobrescrito pela Vercel e transformada com HMAC antes de armazenar.
- Quota global diária e limite de saída para reduzir abuso de créditos; sem fallback para quotas locais em memória.
- Bloqueio temporário de geração por conversa com expiração e identificação única.
- Limites sobre bytes reais do corpo HTTP, caracteres, contexto, modelos, tamanho de resposta e duração da conexão.
- Endpoint de IA definido apenas no servidor, HTTPS e domínio permitido; redirecionamentos desativados para impedir encaminhamento da chave.
- React Markdown sem HTML bruto; imagens remotas não são carregadas; links com `noopener noreferrer`.
- CSP com nonce por resposta, sem scripts inline liberados em produção; bloqueio de frames, cabeçalhos contra MIME sniffing e política de referência.
- Respostas privadas sem cache. Chaves, senhas, corpos de mensagens e erros detalhados de serviços não são registrados nos logs.
- Dependências fixadas por versão e lockfile.

## Condições de operação

A autenticação depende de Supabase configurado e das tabelas instaladas. Confirmação de e-mail, SMTP e proteções adicionais do provedor precisam ser configurados no painel. A integração AnyModel está pendente de verificação de contrato e credencial.

As mensagens são armazenadas no banco e enviadas à AnyModel para geração. Não existe criptografia de ponta a ponta. O administrador do banco e o provedor têm as permissões inerentes à operação; não prometa sigilo em relação a eles.

Limites da aplicação não substituem proteção volumétrica na borda. Revise os controles nativos da Vercel, limites de gastos e uso nos painéis dos provedores. Não há testes de carga nem auditoria externa certificada nesta entrega.

Execute verificação de dependências e revise mudanças antes de atualizações. Reporte falhas ao mantenedor de forma privada, sem incluir credenciais nem dados de usuários em issues públicas.
