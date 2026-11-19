"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  checkStoredGame,
  clearPlayer,
  loadPlayer,
  type StoredPlayer,
} from "@/lib/client/player-storage";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import type { OptionPosition } from "@/lib/game/types";
import { usePlayerGame } from "@/lib/realtime/useGameState";
import { phaseFraction, useRemainingMs, useServerClockOffset } from "@/lib/realtime/useServerClock";
import { NicknameBadge, ScreenIntro, ScreenQuestion } from "@/components/host/HostScreens";
import { PodiumReveal } from "@/components/host/PodiumReveal";
import { ScreenStage } from "@/components/host/ScreenStage";
import hostStyles from "@/components/host/host.module.css";
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

/**
 * Lê o token do localStorage; sem ele, ou se aquele jogo já acabou, volta para a
 * entrada. Recarregar no meio do jogo continua funcionando; abrir /play dias
 * depois não puxa mais o pódio de uma sessão antiga.
 */
export function PlayerApp() {
  const router = useRouter();
  const [stored, setStored] = useState<StoredPlayer | null>(null);

  useEffect(() => {
    const player = loadPlayer();
    if (!player) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    void checkStoredGame(player).then((status) => {
      if (cancelled) return;
      if (status === "over") {
        clearPlayer();
        router.replace("/");
        return;
      }
      // "unknown" (sem rede): segue para o jogo, que reconecta sozinho
      setStored(player);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!stored) return <LoadingView message="Conectando ao jogo…" />;
  return <PlayerGame player={stored} />;
}

/** Computador: janela larga e alta o bastante para o layout do telão. */
const DESKTOP_QUERY = "(min-width: 1024px) and (min-height: 600px)";

function PlayerGame({ player }: { player: StoredPlayer }) {
  const { data, fatal, pending, answerError, answer } = usePlayerGame(player.token);
  const offset = useServerClockOffset();
  const remainingMs = useRemainingMs(data?.state.phaseEndsAt ?? null, offset);
  // No computador, a leitura e a pergunta usam a mesma tela do telão (com o GIF).
  const desktop = useMediaQuery(DESKTOP_QUERY);
  // Depois da revelação do pódio, o participante passa para o próprio resultado.
  const [podiumSeen, setPodiumSeen] = useState(false);

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
      if (desktop) {
        return (
          <ScreenStage>
            <ScreenIntro
              question={question}
              total={total}
              fractionLeft={phaseFraction(remainingMs, state.phaseStartedAt, state.phaseEndsAt)}
              barLabel="Prepare-se: as alternativas aparecem em instantes"
            />
          </ScreenStage>
        );
      }
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
      const onAnswer = (optionId: string, position: OptionPosition) =>
        void answer(question.id, optionId, position);
      if (desktop) {
        return (
          <ScreenStage>
            <ScreenQuestion
              question={question}
              total={total}
              secondsLeft={Math.ceil(remainingMs / 1000)}
              headerRight={<NicknameBadge nickname={me.nickname} />}
              belowQuestion={answerError && <p className={hostStyles.answerError}>{answerError}</p>}
              onAnswer={onAnswer}
              answersDisabled={remainingMs <= 0}
            />
          </ScreenStage>
        );
      }
      return (
        <QuestionView
          question={question}
          total={total}
          secondsLeft={Math.ceil(remainingMs / 1000)}
          fractionLeft={remainingMs / (question.timeLimitS * 1000)}
          disabled={remainingMs <= 0}
          error={answerError}
          onAnswer={onAnswer}
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
      // Mesma revelação do telão, sincronizada; depois, o resultado de cada um.
      if (state.status === "PODIUM" && !podiumSeen && state.podium?.length) {
        const reveal = (
          <PodiumReveal
            podium={state.podium}
            startedAt={state.phaseStartedAt}
            offset={offset}
            layout={desktop ? "screen" : "phone"}
            highlightPlayerId={me.playerId}
            action={{ label: "Meu resultado", onClick: () => setPodiumSeen(true) }}
          />
        );
        return desktop ? <ScreenStage>{reveal}</ScreenStage> : reveal;
      }
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
