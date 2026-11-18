-- Importa o conteúdo de content/quiz.json numa única transação.
-- Cada importação cria um quiz novo (as sessões antigas continuam apontando para
-- o conteúdo que jogaram) e o app usa sempre o quiz mais recente.
-- Se o conteúdo for idêntico ao último importado, devolve o id existente.

create or replace function public.import_quiz(p_title text, p_content_hash text, p_questions jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_latest record;
  v_quiz_id uuid;
  v_question_id uuid;
  v_question jsonb;
  v_option jsonb;
  v_option_index integer;
begin
  select id, content_hash into v_latest
  from public.quiz
  order by created_at desc
  limit 1;

  if v_latest.id is not null and v_latest.content_hash = p_content_hash then
    return v_latest.id;
  end if;

  insert into public.quiz (title, content_hash)
  values (p_title, p_content_hash)
  returning id into v_quiz_id;

  for v_question in select * from jsonb_array_elements(p_questions) loop
    if jsonb_array_length(v_question -> 'options') <> 4 then
      raise exception 'Pergunta % precisa de exatamente 4 alternativas', v_question ->> 'position';
    end if;

    if (select count(*) from jsonb_array_elements(v_question -> 'options') as o(value)
        where (o.value ->> 'correct')::boolean) <> 1 then
      raise exception 'Pergunta % precisa de exatamente 1 alternativa correta', v_question ->> 'position';
    end if;

    insert into public.question (quiz_id, position, text, media_url, time_limit_s, points_multiplier)
    values (
      v_quiz_id,
      (v_question ->> 'position')::integer,
      v_question ->> 'text',
      nullif(v_question ->> 'media', ''),
      (v_question ->> 'timeLimitSeconds')::integer,
      (v_question ->> 'pointsMultiplier')::integer
    )
    returning id into v_question_id;

    v_option_index := 0;
    for v_option in select * from jsonb_array_elements(v_question -> 'options') loop
      insert into public.option (question_id, position, text, is_correct)
      values (v_question_id, v_option_index, v_option ->> 'text', (v_option ->> 'correct')::boolean);
      v_option_index := v_option_index + 1;
    end loop;
  end loop;

  return v_quiz_id;
end;
$$;

revoke all on function public.import_quiz(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_quiz(text, text, jsonb) to service_role;
