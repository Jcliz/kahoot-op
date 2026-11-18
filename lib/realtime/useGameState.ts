"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, apiFetch, bearer, postJson } from "@/lib/client/api";
import { FROZEN_STATUSES } from "@/lib/game/status";
import {
  hostTopic,
  REALTIME_EVENTS,
  sessionTopic,
  type AnswerCount,
  type GameState,
  type HostStateResponse,
  type LobbyPlayer,
  type OptionPosition,
  type PlayerStateResponse,
  type RealtimeAccess,
} from "@/lib/game/types";
import { subscribeChannels, type ChannelStatus, type ChannelSubscription } from "./client";

/** Sem canal conectado por mais que isso, liga o polling de reserva. */
const FALLBACK_AFTER_MS = 3_000;
const FALLBACK_POLL_MS = 2_000;
/** Sem tempo real configurado (modo memória), o polling é o único meio. */
const NO_REALTIME_POLL_MS = 1_000;
/** Espalha os pedidos de resultado individual para não chegarem todos juntos. */
const RESULT_JITTER_MS = 300;

/**
 * Núcleo comum: assina os canais quando há acesso ao tempo real e cai para
 * polling quando o canal não conecta. Também recarrega ao voltar para a aba.
 */
function useLiveSync({
  access,
  subscriptions,
  onMessage,
  refresh,
}: {
  access: RealtimeAccess | null | undefined;
  subscriptions: ChannelSubscription[] | null;
  onMessage: (topic: string, event: string, payload: unknown) => void;
  refresh: () => Promise<void>;
}): ChannelStatus {
  const [connection, setConnection] = useState<ChannelStatus>("connecting");
  const onMessageRef = useRef(onMessage);
  const refreshRef = useRef(refresh);

  useEffect(() => {
    onMessageRef.current = onMessage;
    refreshRef.current = refresh;
  });

  // O servidor assina um token novo a cada retrato (muda o `iat`). Guardar num ref
  // em vez de usar como dependência evita derrubar e refazer o canal a cada
  // refresh — o que, somado ao refresh feito ao conectar, virava um ciclo de
  // reconexão sem fim.
  const accessToken = access?.token;
  const tokenRef = useRef(accessToken);
  useEffect(() => {
    if (accessToken) tokenRef.current = accessToken;
  }, [accessToken]);

  const hasToken = Boolean(accessToken);
  const accessUrl = access?.url;
  const accessKey = access?.anonKey;
  const subscriptionKey = subscriptions ? JSON.stringify(subscriptions) : null;

  // Canal de tempo real
  useEffect(() => {
    if (!hasToken || !accessUrl || !accessKey || !subscriptionKey) return;
    const unsubscribe = subscribeChannels(
      { url: accessUrl, anonKey: accessKey },
      () => tokenRef.current ?? "",
      JSON.parse(subscriptionKey) as ChannelSubscription[],
      (topic, event, payload) => onMessageRef.current(topic, event, payload),
      (status) => {
        setConnection(status);
        // Ao (re)conectar, busca o retrato: pode ter perdido mensagens no meio.
        if (status === "live") void refreshRef.current();
      },
    );
    return unsubscribe;
  }, [hasToken, accessUrl, accessKey, subscriptionKey]);

  // Polling de reserva
  const realtimeAvailable = access !== null;
  useEffect(() => {
    if (connection === "live" && realtimeAvailable) return;
    const interval = realtimeAvailable ? FALLBACK_POLL_MS : NO_REALTIME_POLL_MS;
    let timer: number | undefined;
    const start = window.setTimeout(
      () => {
        timer = window.setInterval(() => void refreshRef.current(), interval);
      },
      realtimeAvailable ? FALLBACK_AFTER_MS : 0,
    );
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [connection, realtimeAvailable]);

  // Primeira carga, e de novo quando o celular desbloqueia, a aba volta ou a rede volta.
  useEffect(() => {
    void refreshRef.current();
    const onWake = () => {
      if (document.visibilityState === "visible") void refreshRef.current();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, []);

  return realtimeAvailable ? connection : "offline";
}

// ------------------------------------------------------------------ participante

export type PlayerFatal = "kicked" | "ended";

export interface PendingAnswer {
  questionId: string;
  optionPosition: OptionPosition;
}

export function usePlayerGame(token: string | null) {
  const [data, setData] = useState<PlayerStateResponse | null>(null);
  const [fatal, setFatal] = useState<PlayerFatal | null>(null);
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const playerIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const next = await apiFetch<PlayerStateResponse>("/api/state", { headers: bearer(token) });
      if (next.state.version < versionRef.current) return;
      versionRef.current = next.state.version;
      playerIdRef.current = next.me.playerId;
      setData(next);
    } catch (error) {
      if (!(error instanceof ApiRequestError)) return;
      if (error.code === "PLAYER_KICKED") setFatal("kicked");
      else if (error.code === "PLAYER_NOT_FOUND" || error.code === "SESSION_NOT_FOUND") {
        setFatal("ended");
      }
    }
  }, [token]);

  const sessionId = data?.state.sessionId;
  const onMessage = useCallback(
    (_topic: string, event: string, payload: unknown) => {
      if (event === REALTIME_EVENTS.kicked) {
        if ((payload as { playerId: string }).playerId === playerIdRef.current) setFatal("kicked");
        return;
      }
      if (event !== REALTIME_EVENTS.state) return;
      const state = payload as GameState;
      if (state.version <= versionRef.current) return;
      versionRef.current = state.version;
      setData((prev) => (prev ? { ...prev, state } : prev));
      // Resultado individual vem por HTTP, com atraso aleatório de 0 a 300 ms.
      if (FROZEN_STATUSES.has(state.status)) {
        window.setTimeout(() => void refresh(), Math.random() * RESULT_JITTER_MS);
      }
    },
    [refresh],
  );

  const connection = useLiveSync({
    access: data ? data.realtime : undefined,
    subscriptions: sessionId
      ? [
          {
            topic: sessionTopic(sessionId),
            events: [REALTIME_EVENTS.state, REALTIME_EVENTS.kicked],
          },
        ]
      : null,
    onMessage,
    refresh,
  });

  const answer = useCallback(
    async (questionId: string, optionId: string, optionPosition: OptionPosition) => {
      if (!token) return;
      setAnswerError(null);
      setPending({ questionId, optionPosition });
      try {
        await postJson("/api/answer", { questionId, optionId }, bearer(token));
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "ALREADY_ANSWERED") return;
        setPending(null);
        setAnswerError(
          error instanceof Error ? error.message : "Não foi possível enviar. Tente de novo.",
        );
        void refresh();
      }
    },
    [token, refresh],
  );

  return { data, fatal, connection, pending, answerError, answer };
}

// ------------------------------------------------------------------ apresentador

export type HostFatal = "unauthorized" | "not_found";

export function useHostGame(sessionId: string) {
  const [data, setData] = useState<HostStateResponse | null>(null);
  const [fatal, setFatal] = useState<HostFatal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<HostStateResponse>(`/api/host/sessions/${sessionId}`);
      if (next.state.version < versionRef.current) return;
      versionRef.current = next.state.version;
      setData(next);
    } catch (err) {
      if (!(err instanceof ApiRequestError)) return;
      if (err.status === 401) setFatal("unauthorized");
      else if (err.code === "SESSION_NOT_FOUND" || err.code === "INVALID_INPUT") {
        setFatal("not_found");
      }
    }
  }, [sessionId]);

  const applyState = useCallback(
    (state: GameState) => {
      if (state.version <= versionRef.current) return;
      versionRef.current = state.version;
      setData((prev) =>
        prev
          ? {
              ...prev,
              state,
              answerCount:
                state.status === "QUESTION_INTRO"
                  ? { answered: 0, total: prev.players.length }
                  : prev.answerCount,
            }
          : prev,
      );
      // Pódio e ranking final precisam do ranking completo, que não vai no broadcast.
      if (state.status === "PODIUM" || state.status === "FINISHED") void refresh();
    },
    [refresh],
  );

  const onMessage = useCallback(
    (_topic: string, event: string, payload: unknown) => {
      if (event === REALTIME_EVENTS.state) return applyState(payload as GameState);
      if (event === REALTIME_EVENTS.answerCount) {
        const count = payload as AnswerCount;
        setData((prev) =>
          prev
            ? {
                ...prev,
                answerCount: {
                  answered: Math.max(prev.answerCount.answered, count.answered),
                  total: count.total,
                },
              }
            : prev,
        );
        return;
      }
      if (event === REALTIME_EVENTS.lobby) {
        const { players } = payload as { players: LobbyPlayer[] };
        setData((prev) => (prev ? { ...prev, players } : prev));
      }
    },
    [applyState],
  );

  const connection = useLiveSync({
    access: data ? data.realtime : undefined,
    subscriptions: [
      { topic: sessionTopic(sessionId), events: [REALTIME_EVENTS.state] },
      {
        topic: hostTopic(sessionId),
        events: [REALTIME_EVENTS.answerCount, REALTIME_EVENTS.lobby],
      },
    ],
    onMessage,
    refresh,
  });

  const command = useCallback(
    async (path: string, body: unknown) => {
      setBusy(true);
      setError(null);
      try {
        const state = await postJson<GameState>(`/api/host/sessions/${sessionId}/${path}`, body);
        applyState(state);
      } catch (err) {
        // Versão desatualizada: outro clique ou o servidor já avançou. Só recarrega.
        if (!(err instanceof ApiRequestError && err.code === "STALE_VERSION")) {
          setError(err instanceof Error ? err.message : "Algo deu errado.");
        }
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [sessionId, applyState, refresh],
  );

  const version = data?.state.version;
  const advance = useCallback(
    () => (version ? command("advance", { expectedVersion: version }) : Promise.resolve()),
    [command, version],
  );
  const closeQuestion = useCallback(
    (reason: "manual" | "timeout") =>
      version ? command("close-question", { expectedVersion: version, reason }) : Promise.resolve(),
    [command, version],
  );

  const kick = useCallback(
    async (playerId: string) => {
      setData((prev) =>
        prev ? { ...prev, players: prev.players.filter((p) => p.id !== playerId) } : prev,
      );
      try {
        await postJson(`/api/host/sessions/${sessionId}/kick`, { playerId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível remover.");
        await refresh();
      }
    },
    [sessionId, refresh],
  );

  return { data, fatal, busy, error, connection, advance, closeQuestion, kick };
}
