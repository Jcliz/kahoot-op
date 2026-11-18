-- Quiz ao vivo: schema inicial.
-- Quiz, perguntas e alternativas são conteúdo fixo (seed); sessão, participantes
-- e respostas nascem a cada jogo.
--
-- Acesso: RLS ligado em todas as tabelas e NENHUMA política para anon/authenticated.
-- Toda leitura e escrita passa pelas rotas do Next.js com a chave service_role,
-- então o gabarito (option.is_correct) nunca chega ao navegador.

create type public.session_status as enum (
  'LOBBY',
  'QUESTION_INTRO',
  'QUESTION_OPEN',
  'RESULTS',
  'LEADERBOARD',
  'PODIUM',
  'FINISHED'
);

create table public.quiz (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- hash do content/quiz.json importado; o seed não duplica um conteúdo igual
  content_hash text not null,
  created_at timestamptz not null default now()
);

create table public.question (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quiz (id) on delete cascade,
  position integer not null check (position >= 1),
  text text not null check (char_length(text) between 1 and 240),
  media_url text,
  time_limit_s integer not null default 20 check (time_limit_s between 5 and 120),
  points_multiplier integer not null default 1 check (points_multiplier between 1 and 3),
  unique (quiz_id, position)
);

create table public.option (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question (id) on delete cascade,
  -- define forma e cor: 0 triângulo, 1 losango, 2 círculo, 3 quadrado
  position smallint not null check (position between 0 and 3),
  text text not null check (char_length(text) between 1 and 120),
  is_correct boolean not null default false,
  unique (question_id, position)
);

-- no máximo 1 correta por pergunta (o "exatamente 1" é conferido no import_quiz)
create unique index option_single_correct on public.option (question_id) where is_correct;

create table public.session (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quiz (id),
  pin text not null check (pin ~ '^[1-9][0-9]{5}$'),
  status public.session_status not null default 'LOBBY',
  current_position integer not null default 0 check (current_position >= 0),
  -- cresce a cada mudança de fase; serve de trava otimista e de versão do retrato
  version integer not null default 1,
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- PIN único entre as sessões não encerradas
create unique index session_active_pin on public.session (pin) where status <> 'FINISHED';

create table public.player (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  -- apelido sem acento e minúsculo, para a unicidade
  nickname_key text not null,
  -- sha-256 do token guardado no celular; o token em si nunca é gravado
  token_hash text not null unique,
  kicked boolean not null default false,
  last_seen_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (session_id, nickname_key)
);

create index player_session on public.player (session_id);

create table public.answer (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session (id) on delete cascade,
  question_id uuid not null references public.question (id),
  player_id uuid not null references public.player (id) on delete cascade,
  option_id uuid not null references public.option (id),
  is_correct boolean not null,
  response_ms integer not null check (response_ms >= 0),
  points integer not null check (points >= 0),
  created_at timestamptz not null default now(),
  -- uma resposta por pergunta, mesmo com clique duplo ou reenvio
  unique (player_id, question_id)
);

-- contagem ao vivo e resultados
create index answer_session_question on public.answer (session_id, question_id);

-- Pontuação acumulada derivada das respostas (fonte única da verdade).
-- Substitui as colunas score/correct_count/streak previstas no plano em player:
-- assim o placar nunca diverge das respostas gravadas.
create view public.player_standing
with (security_invoker = true) as
select
  p.id as player_id,
  p.session_id,
  p.nickname,
  p.joined_at,
  p.kicked,
  coalesce(sum(a.points), 0)::integer as score,
  (count(a.id) filter (where a.is_correct))::integer as correct_count,
  coalesce(sum(a.response_ms) filter (where a.is_correct), 0)::integer as correct_ms
from public.player p
left join public.answer a on a.player_id = p.id
group by p.id;

alter table public.quiz enable row level security;
alter table public.question enable row level security;
alter table public.option enable row level security;
alter table public.session enable row level security;
alter table public.player enable row level security;
alter table public.answer enable row level security;

-- Defesa em profundidade: além de não haver políticas, os papéis usados pelo
-- navegador não têm privilégio nenhum nas tabelas do jogo.
revoke all on public.quiz, public.question, public.option, public.session, public.player,
  public.answer, public.player_standing from anon, authenticated;
