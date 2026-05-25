# WhatsApp Affiliate Bot Handoff

## Objetivo
Automatizar postagens de ofertas do Mercado Livre em grupo de WhatsApp usando:
- API WhatsApp existente como gateway de sessão e envio
- bot separado dentro do mesmo projeto para busca, seleção, deduplicação e agendamento
- etapa de afiliado inicialmente simplificada, a ser substituída por automação real com Playwright MCP

## Arquitetura decidida
- A API atual continua responsável por sessão WhatsApp e envio de mensagens.
- O bot roda como processo separado no mesmo projeto (`npm run bot`).
- A v1 publica em um grupo fixo.
- A seleção de produtos é automática por filtros configuráveis.
- O bot nunca republica um item já enviado com sucesso.
- Formato da postagem: texto com link.

## O que já foi implementado

### API WhatsApp
- Extraído app factory para testes em `src/app.js`
- Nova rota `GET /api/sessions/:id/chats`
- Suporte no `whatsapp.service.js` para listar:
  - grupos via `groupFetchAllParticipating()`
  - contatos a partir de eventos do Baileys

### Bot
- Entrada do bot: `src/bot/main.js`
- Runner do ciclo: `src/bot/create-bot-runner.js`
- Scheduler simples: `src/bot/create-bot-scheduler.js`
- Provider de catálogo do Mercado Livre:
  - `src/bot/providers/mercado-livre-catalog-provider.js`
- Provider de afiliado temporário por template:
  - `src/bot/providers/affiliate-link-provider.js`
- Cliente HTTP da API WhatsApp:
  - `src/bot/clients/whatsapp-api-client.js`
- Repositório Prisma do bot:
  - `src/bot/repositories/prisma-bot-repository.js`
- Configuração do bot:
  - `src/bot/config.js`
- Loader de `.env`:
  - `src/lib/load-env.js`

### Prisma
Schema estendido com:
- `SearchFilter`
- `PostingExecution`
- `PublishedOffer`
- `PostingFailure`

### Configuração
Atualizados:
- `.env.example`
- `package.json`

Scripts atuais:
- `npm run bot`
- `npm test`
- `npm run db:push`
- `npm run db:generate`

## Testes já adicionados
- `tests/api/session-chats.test.js`
- `tests/bot/run-posting-cycle.test.js`
- `tests/bot/mercado-livre-provider.test.js`

## Última verificação executada
Comandos executados com sucesso:
- `npm run db:push`
- `npm run db:generate`
- `npm test`

Resultado:
- 7 testes passando

## Pendência principal
Substituir a implementação simplificada de afiliado em `src/bot/providers/affiliate-link-provider.js` por automação real com Playwright MCP.

## Como continuar na próxima sessão
1. Confirmar que o MCP `playwright` está carregado na nova sessão.
2. Abrir Mercado Livre/portal de afiliados em modo visível com Playwright MCP.
3. Esperar login manual do usuário.
4. Inspecionar o fluxo real de geração do link de afiliado.
5. Implementar provider real reutilizando sessão persistida.
6. Adicionar configurações para:
   - headless true/false
   - diretório de sessão/user data
   - timeouts
   - reaproveitamento de autenticação
7. Ajustar testes e rodar verificação final.

## Prompt recomendado para a próxima sessão
```text
Leia o arquivo `docs/implementation-handoff-affiliate-bot.md` e continue a implementação a partir dele.

Use o Playwright MCP para implementar a etapa real de geração de link de afiliado no projeto `C:\Users\Robert Moura\OneDrive\Documentos\BotWhatsAppML\WhatsAppSenderApi`.

Regras:
- primeiro confirme que o MCP `playwright` está disponível
- abra o Mercado Livre em modo visível
- espere meu login manual
- descubra o fluxo real de geração do link de afiliado
- substitua a implementação simplificada em `src/bot/providers/affiliate-link-provider.js`
- preserve o restante da arquitetura já implementada
- ajuste testes se necessário
- execute as verificações antes de concluir
```
