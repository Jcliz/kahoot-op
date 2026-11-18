"use client";

import { useEffect, useState } from "react";

const SAMPLES = 3;

/**
 * Diferença entre o relógio do servidor e o do aparelho (serverNow − Date.now()).
 * Usa o ponto médio do tempo de ida e volta da menor de 3 medições.
 * O servidor continua decidindo o tempo de verdade; isto só alinha o cronômetro.
 */
export function useServerClockOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let best: { rtt: number; offset: number } | null = null;
      for (let i = 0; i < SAMPLES; i++) {
        try {
          const sentAt = Date.now();
          const response = await fetch("/api/time", { cache: "no-store" });
          const { serverNow } = (await response.json()) as { serverNow: number };
          const receivedAt = Date.now();
          const rtt = receivedAt - sentAt;
          if (!best || rtt < best.rtt) {
            best = { rtt, offset: serverNow - (sentAt + rtt / 2) };
          }
        } catch {
          // sem rede: tenta de novo na próxima amostra
        }
      }
      if (!cancelled && best) setOffset(best.offset);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return offset;
}

/** Milissegundos restantes até `endsAt` (relógio do servidor), atualizado a cada 200 ms. */
export function useRemainingMs(endsAt: number | null, offset: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return endsAt === null ? 0 : Math.max(endsAt - (now + offset), 0);
}
