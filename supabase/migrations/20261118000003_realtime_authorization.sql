-- Realtime Authorization para os canais privados (Broadcast).
--
-- Só o servidor publica (pela API REST de broadcast, com a service_role).
-- Os navegadores recebem do servidor um JWT com a claim `session_id`
-- (participante e telão) e `host_session_id` (só o telão), e conseguem apenas ESCUTAR:
--   session:<id>  todos os participantes daquela sessão
--   host:<id>     só o telão daquela sessão
-- Não existe política de INSERT, então nenhum navegador consegue publicar.
--
-- Importante: em Project Settings > Realtime, desligue "Allow public access"
-- para que só canais privados sejam aceitos.

create policy "quiz: escutar apenas os canais da propria sessao"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    (select realtime.topic()) = 'session:' || coalesce((select auth.jwt() ->> 'session_id'), '')
    or (select realtime.topic()) = 'host:' || coalesce((select auth.jwt() ->> 'host_session_id'), '')
  )
);
