"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearPlayer, loadPlayer, type StoredPlayer } from "@/lib/client/player-storage";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import { usePlayerGame } from "@/lib/realtime/useGameState";
import { phaseFraction, useRemainingMs, useServerClockOffset } from "@/lib/realtime/useServerClock";
import {
  AnswerSentView,
  ExitView,
  FinalView,
  LoadingView,
  LobbyView,
  PodiumTop3View,
  PrepareView,
  QuestionView,
  ResultView,
  StandingView,
} from "./PlayerScreens";

/** Lê o token do localStorage; sem ele, volta para a entrada. */
export function PlayerApp() {
  const router = useRouter();
  const [stored, setStored] = useState<StoredPlayer | null | undefined>(undefined);

  useEffect(() => {
    const player = loadPlayer();
    if (!player) router.replace("/");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage (só existe no navegador)
    setStored(player);
  }, [router]);

  if (!stored) return <LoadingView message="Conectando ao jogo…" />;
  return <PlayerGame player={stored} />;
}

function PlayerGame({ player }: { player: StoredPlayer }) {
  const { data, fatal, pending, answerError, answer } = usePlayerGame(player.token);
  const offset = useServerClockOffset();
  const remainingMs = useRemainingMs(data?.state.phaseEndsAt ?? null, offset);
  const wide = useMediaQuery("(min-width: 768px)");

  if (fatal) return <ExitView variant={fatal} onLeave={clearPlayer} />;
  if (!data) return <LoadingView message="Conectando ao jogo…" />;

  const { state, me } = data;
  const question = state.question;
  const total = state.totalQuestions;

  switch (state.status) {
    case "LOBBY":
      return <LobbyView nickname={me.nickname} />;

    case "QUESTION_INTRO":
      if (!question) return <LoadingView message="Carregando a pergunta…" />;
      return (
        <PrepareView
          question={question}
          total={total}
          fractionLeft={phaseFraction(remainingMs, state.phaseStartedAt, state.phaseEndsAt)}
        />
      );

    case "QUESTION_OPEN": {
      if (!question) return <LoadingView message="Carregando a pergunta…" />;
      const chosen =
        me.currentAnswer?.questionId === question.id
          ? me.currentAnswer.optionPosition
          : pending?.questionId === question.id
            ? pending.optionPosition
            : null;
      if (chosen !== null) {
        return (
          <AnswerSentView
            position={question.position}
            total={total}
            nickname={me.nickname}
            optionPosition={chosen}
            optionText={question.options.find((o) => o.position === chosen)?.text ?? ""}
          />
        );
      }
      const limitMs = question.timeLimitS * 1000;
      return (
        <QuestionView
          question={question}
          total={total}
          nickname={me.nickname}
          secondsLeft={Math.ceil(remainingMs / 1000)}
          fractionLeft={remainingMs / limitMs}
          disabled={remainingMs <= 0}
          error={answerError}
          layout={wide ? "web" : "phone"}
          onAnswer={(optionId, position) => void answer(question.id, optionId, position)}
        />
      );
    }

    case "RESULTS": {
      const result = me.lastResult;
      if (!question || !result || result.questionId !== question.id || me.rank === 0) {
        return <LoadingView message="Conferindo sua resposta…" />;
      }
      return (
        <ResultView
          position={question.position}
          total={total}
          nickname={me.nickname}
          correct={result.correct}
          answered={result.answered}
          points={result.points}
          score={me.score}
          rank={me.rank}
          totalPlayers={me.totalPlayers}
        />
      );
    }

    case "LEADERBOARD":
      if (me.rank === 0) return <LoadingView message="Atualizando o ranking…" />;
      return (
        <StandingView
          position={state.position}
          total={total}
          nickname={me.nickname}
          rank={me.rank}
          totalPlayers={me.totalPlayers}
          score={me.score}
          ahead={me.ahead}
        />
      );

    case "PODIUM":
    case "FINISHED":
      if (me.rank === 0) return <LoadingView message="Calculando o resultado final…" />;
      if (me.rank <= 3) {
        return (
          <PodiumTop3View
            nickname={me.nickname}
            rank={me.rank as 1 | 2 | 3}
            score={me.score}
            correctCount={me.correctCount}
            totalQuestions={total}
          />
        );
      }
      return (
        <FinalView
          nickname={me.nickname}
          rank={me.rank}
          totalPlayers={me.totalPlayers}
          score={me.score}
          correctCount={me.correctCount}
          totalQuestions={total}
        />
      );
  }
}
