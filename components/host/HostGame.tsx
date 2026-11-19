"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHostGame } from "@/lib/realtime/useGameState";
import { phaseFraction, useRemainingMs, useServerClockOffset } from "@/lib/realtime/useServerClock";
import {
  AnswerProgress,
  HostIntroSkip,
  HostLeaderboard,
  HostLoading,
  HostLobby,
  HostQuestionControls,
  HostRanking,
  HostResults,
  ScreenIntro,
  ScreenQuestion,
} from "./HostScreens";
import { PodiumReveal } from "./PodiumReveal";
import { ScreenStage } from "./ScreenStage";
import styles from "./host.module.css";

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/** Endereço que o QR code abre (com o PIN preenchido) e a versão curta mostrada no telão. */
function useJoinUrl(pin: string | undefined) {
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_APP_URL ?? "");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window só existe no navegador
    if (!process.env.NEXT_PUBLIC_APP_URL) setOrigin(window.location.origin);
  }, []);
  const base = origin.replace(/\/$/, "");
  return {
    joinUrl: pin ? `${base}/?pin=${pin}` : base,
    shortUrl: base.replace(/^https?:\/\//, ""),
  };
}

/**
 * Agenda uma ação para quando o relógio do servidor chegar em `at`.
 * Roda uma vez por versão do estado; o servidor ignora repetições.
 */
function useActionAt(at: number | null, offset: number, key: string, action: () => void) {
  useEffect(() => {
    if (at === null) return;
    const delay = Math.max(at - (Date.now() + offset), 0);
    const id = window.setTimeout(action, delay);
    return () => window.clearTimeout(id);
    // `action` muda a cada render; a chave (status + versão) é o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, offset, key]);
}

export function HostGame({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { data, fatal, busy, error, connection, advance, closeQuestion, kick } =
    useHostGame(sessionId);
  const offset = useServerClockOffset();
  const state = data?.state;
  const remainingMs = useRemainingMs(state?.phaseEndsAt ?? null, offset);
  const { joinUrl, shortUrl } = useJoinUrl(data?.pin);

  useEffect(() => {
    if (fatal === "unauthorized") router.replace("/host");
  }, [fatal, router]);

  const status = state?.status;
  const versionKey = `${status}:${state?.version}`;

  // Tempo de leitura (só o enunciado): o telão dispara o avanço; se travar, há o botão "Abrir agora".
  useActionAt(
    status === "QUESTION_INTRO" ? (state?.phaseEndsAt ?? null) : null,
    offset,
    versionKey,
    () => void advance(),
  );
  // Cronômetro zerou: pede o fechamento (o servidor respeita a tolerância de 500 ms).
  useActionAt(
    status === "QUESTION_OPEN" ? (state?.phaseEndsAt ?? null) : null,
    offset,
    versionKey,
    () => void closeQuestion("timeout"),
  );

  if (fatal === "not_found") {
    return (
      <ScreenStage>
        <HostLoading message="Sessão não encontrada. Crie uma nova em /host." />
      </ScreenStage>
    );
  }
  if (!data || !state) {
    return (
      <ScreenStage>
        <HostLoading message="Conectando ao jogo…" />
      </ScreenStage>
    );
  }

  const question = state.question;
  let screen: React.ReactNode;

  switch (state.status) {
    case "LOBBY":
      screen = (
        <HostLobby
          pin={data.pin}
          joinUrl={joinUrl}
          shortUrl={shortUrl}
          players={data.players}
          busy={busy}
          onStart={() => void advance()}
          onKick={(id) => void kick(id)}
          onFullscreen={toggleFullscreen}
        />
      );
      break;
    case "QUESTION_INTRO":
      screen = question && (
        <ScreenIntro
          question={question}
          total={state.totalQuestions}
          fractionLeft={phaseFraction(remainingMs, state.phaseStartedAt, state.phaseEndsAt)}
          barLabel="Celular na mão, vai abrir em instantes"
          action={<HostIntroSkip busy={busy} onSkip={() => void advance()} />}
        />
      );
      break;
    case "QUESTION_OPEN":
      screen = question && (
        <ScreenQuestion
          question={question}
          total={state.totalQuestions}
          secondsLeft={Math.ceil(remainingMs / 1000)}
          headerRight={
            <HostQuestionControls
              busy={busy}
              onClose={() => void closeQuestion("manual")}
              onFullscreen={toggleFullscreen}
            />
          }
          belowQuestion={
            <AnswerProgress
              answered={data.answerCount.answered}
              players={data.answerCount.total || state.playerCount}
            />
          }
        />
      );
      break;
    case "RESULTS":
      screen = question && state.results && (
        <HostResults
          question={question}
          total={state.totalQuestions}
          results={state.results}
          busy={busy}
          isLast={state.position >= state.totalQuestions}
          onNext={() => void advance()}
        />
      );
      break;
    case "LEADERBOARD":
      screen = (
        <HostLeaderboard
          position={state.position}
          total={state.totalQuestions}
          top5={state.top5 ?? []}
          busy={busy}
          onNext={() => void advance()}
        />
      );
      break;
    case "PODIUM":
      screen = (
        <PodiumReveal
          key={versionKey}
          podium={state.podium ?? []}
          startedAt={state.phaseStartedAt}
          offset={offset}
          action={{ label: "Ver ranking completo", onClick: () => void advance(), busy }}
        />
      );
      break;
    case "FINISHED":
      screen = (
        <HostRanking
          ranking={data.ranking ?? []}
          totalQuestions={state.totalQuestions}
          csvHref={`/api/host/sessions/${sessionId}/export.csv`}
        />
      );
      break;
  }

  return (
    <ScreenStage>
      {screen ?? <HostLoading message="Carregando…" />}
      {error && (
        <div className={styles.toast} role="alert">
          {error}
        </div>
      )}
      {connection === "offline" && data.realtime && (
        <div className={styles.connection}>Reconectando ao tempo real…</div>
      )}
    </ScreenStage>
  );
}
