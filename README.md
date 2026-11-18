# Quiz ao vivo · Programa Periódico de Qualidade

Quiz ao vivo no estilo Kahoot para cerca de 110 participantes jogando pelo celular, sem login.
O apresentador projeta o telão e controla o ritmo; cada participante entra com o PIN e um apelido.

Um único projeto **Next.js (App Router) + TypeScript** na Vercel, com **Supabase** como banco
(Postgres) e canal de tempo real (Realtime Broadcast). Não há servidor separado: o back-end são
as rotas em `app/api/*`, rodando em Node.

## Rodando localmente

Requisitos: Node 24+.

```bash
npm install
cp .env.example .env.local   # e preencha
npm run dev
```

### Sem Supabase (modo memória)

Para desenvolver e testar sem criar o projeto no Supabase, use no `.env.local`:

```env
DATA_BACKEND=memory
HOST_PASSWORD=uma-senha
HOST_SESSION_SECRET=um-segredo-com-pelo-menos-32-caracteres
```

O jogo fica na memória do processo e lê `content/quiz.json` direto. Sem tempo real, os navegadores
se atualizam pelo polling de reserva (1 s). **Só funciona com um processo**: nunca use na Vercel.

- Telão: <http://localhost:3000/host>
- Participante: <http://localhost:3000> (ou o QR code do lobby)

## Configurando o Supabase

1. Crie o projeto na região **sa-east-1 (São Paulo)**.
2. Rode as migrations de `supabase/migrations/` em ordem (`supabase db push`, ou cole cada arquivo
   no SQL Editor).
3. Em **Project Settings → Realtime**, desligue **"Allow public access"** para aceitar só canais
   privados.
4. Copie para o `.env.local` (ou para a Vercel):
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (só servidor)
   - `SUPABASE_JWT_SECRET`: o segredo JWT do projeto (Settings → API → JWT Secret / legacy
     JWT secret). O servidor usa esse segredo para assinar o token que deixa o navegador apenas
     **escutar** o canal da própria sessão. Se o projeto usar as novas chaves de assinatura
     assimétricas, mantenha o segredo HS256 legado ativo como chave compartilhada.
5. `npm run seed` para gravar `content/quiz.json` no banco.

## Scripts

| Comando                                                 | O que faz                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                           | Servidor de desenvolvimento                                                                                     |
| `npm run build` / `npm start`                           | Build e servidor de produção                                                                                    |
| `npm run lint` · `npm run typecheck` · `npm run format` | Qualidade de código                                                                                             |
| `npm test`                                              | Testes unitários e de integração (Vitest), incluindo as migrations em PGlite                                    |
| `npm run test:e2e`                                      | Ponta a ponta (Playwright): telão + 3 celulares de 360 px. Rode `npx playwright install chromium` uma vez antes |
| `npm run seed`                                          | Valida e grava `content/quiz.json` (`-- --check` só valida)                                                     |
| `npm run simulate -- --url=… --players=20`              | Joga uma partida inteira só pela API e confere o CSV                                                            |
| `npm run load-test -- --url=… --clients=150`            | Teste de carga com as metas do plano                                                                            |

## Conteúdo do quiz

As 6 perguntas ficam em `content/quiz.json`, com o gabarito confirmado (B, C, C, B, C, C).
Regras validadas no seed: exatamente 4 alternativas, exatamente 1 correta e posições 1..N sem
buracos. A ordem das alternativas define forma e cor (triângulo, losango, círculo, quadrado).

Cada pergunta tem um GIF em `public/media/` (`q01.gif` a `q06.gif`), mostrado só no telão; o
celular nunca baixa mídia. O telão pré-carrega o GIF durante os 3 s de abertura. A mídia é
opcional: com `"media": null` o quadro de imagem some. GIFs pesados podem virar MP4/WebM em loop,
que o telão também aceita.

Depois de editar, rode `npm run seed`. Cada importação cria uma versão nova do quiz (as sessões
antigas continuam apontando para o conteúdo que jogaram) e conteúdo idêntico não é duplicado.

## Deploy na Vercel

1. Ligue o repositório à Vercel e conecte o Supabase pela integração do Marketplace.
2. Configure as variáveis da tabela do `.env.example` (`DATA_BACKEND` fica vazio).
   `NEXT_PUBLIC_APP_URL` é a URL curta mostrada no lobby e usada no QR code.
3. As funções rodam em `gru1` (São Paulo), definido em `vercel.json`.
4. No dia: abra o projeto Supabase antes (projetos gratuitos pausam) e crie a sessão poucos
   minutos antes de começar.

## Arquitetura

```
app/                     páginas (/, /play, /host, /host/[sessionId]) e rotas /api/*
components/ui            componentes do design (formas, alternativas, cartões, botões)
components/player        telas do celular
components/host          telas do telão (1920×1080 escaladas para qualquer projetor)
lib/game                 regras em funções puras: estados, pontos, desempate, apelidos, CSV
lib/server               serviço do jogo, autenticação do apresentador, tokens, env
lib/db                   repositório: Supabase (produção) e memória (dev/testes)
lib/realtime             publicação (servidor) e hooks com polling de reserva (cliente)
supabase/migrations      schema, função de importação e política do Realtime
scripts                  seed, simulação via API e teste de carga
e2e                      testes Playwright
```

- **Fonte da verdade no servidor:** tempo, gabarito e pontos nunca são calculados no cliente.
  O gabarito só sai do servidor no estado `RESULTS` (há teste garantindo isso).
- **Transições condicionais:** toda mudança de fase é um `UPDATE … WHERE version = <esperada>`;
  dois cliques no botão não pulam pergunta.
- **Tempo real:** só o servidor publica (API REST de Broadcast). Os navegadores assinam canais
  privados com um JWT que só permite escutar. Cada mensagem é um retrato completo com `version`
  crescente; quem perde mensagem se recupera no próximo retrato ou pelo polling.
- **Pico de resultados:** o ranking de cada fase congelada é calculado uma vez e reaproveitado
  pelos ~110 pedidos de `GET /api/state`, que chegam espalhados por 0 a 300 ms.

## Diferenças em relação ao plano e ao design

- **Placar derivado das respostas:** em vez das colunas `score`, `correct_count` e `streak` em
  `player`, a view `player_standing` soma as respostas. Assim o placar nunca diverge do que foi
  gravado. O bônus de sequência (`STREAK_BONUS`) é calculado a partir das respostas anteriores.
- **Coluna `session.version`:** trava otimista das transições e versão do retrato publicado.
- **Coluna `quiz.content_hash`:** evita duplicar o quiz ao rodar o seed de novo.
- **Lobby no canal do telão:** a lista de apelidos vai só para `host:<id>`, não para todos os
  celulares. Publicar 110 entradas para 110 celulares estouraria o limite de mensagens do plano
  gratuito.
- **Fechamento por tempo:** quando o cronômetro do telão zera, o servidor espera a tolerância de
  500 ms antes de fechar. Se o telão sumir, o primeiro pedido que chegar depois do tempo fecha a pergunta.
- **Lobby do telão com 800 px de painel** (o design tem 720): com 720 o PIN não cabia ao lado do QR.
- **"Tempo esgotado!"** no celular de quem não respondeu (o design só tinha acertou/errou).
- **Botão "Abrir agora"** na abertura da pergunta, para o caso de o avanço automático travar.
- **Entrada com o jogo em andamento** não é permitida (decisão pendente no plano).

## Pendências (antes do evento)

- [x] Perguntas: são 6 no total.
- [x] Gabarito confirmado: B, C, C, B, C, C.
- [x] Amarelo oficial da ObraPrima (`#FFCD00`, medido no logo) em `styles/tokens.css`; contraste
      de 12,6:1 com o preto.
- [ ] Criar o projeto Supabase, rodar migrations e seed, configurar a Vercel.
- [ ] Rodar `npm run load-test -- --clients=150` contra a Vercel (o resultado local não vale para
      produção). Se aparecer `tenant_events` ou `too_many_connections`, ativar o plano Pro do
      Supabase no mês do evento.
- [ ] Ensaio com pelo menos 10 pessoas reais, na rede do local e no projetor real (atenção ao
      amarelo claro da 4ª alternativa perto do branco da 3ª).
