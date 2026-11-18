import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { RealtimeAccess } from "@/lib/game/types";

export type ChannelStatus = "connecting" | "live" | "offline";

export interface ChannelSubscription {
  topic: string;
  /** Eventos de broadcast a escutar. */
  events: string[];
}

/**
 * Assina canais privados do Supabase Realtime só para ESCUTAR.
 * O token vem do servidor e a política do banco recusa qualquer publicação.
 */
export function subscribeChannels(
  access: RealtimeAccess,
  subscriptions: ChannelSubscription[],
  onMessage: (topic: string, event: string, payload: unknown) => void,
  onStatus: (status: ChannelStatus) => void,
): () => void {
  const client: SupabaseClient = createClient(access.url, access.anonKey, {
    accessToken: async () => access.token,
    realtime: { params: { eventsPerSecond: 5 } },
  });

  const statuses = new Map<string, ChannelStatus>();
  const report = () => {
    const values = [...statuses.values()];
    onStatus(
      values.length > 0 && values.every((s) => s === "live")
        ? "live"
        : values.some((s) => s === "offline")
          ? "offline"
          : "connecting",
    );
  };

  const channels: RealtimeChannel[] = subscriptions.map(({ topic, events }) => {
    statuses.set(topic, "connecting");
    let channel = client.channel(topic, { config: { private: true } });
    for (const event of events) {
      channel = channel.on("broadcast", { event }, ({ payload }) =>
        onMessage(topic, event, payload),
      );
    }
    return channel.subscribe((status) => {
      // SUBSCRIBED = conectado; CHANNEL_ERROR, TIMED_OUT e CLOSED = fora do ar
      statuses.set(topic, status === "SUBSCRIBED" ? "live" : "offline");
      report();
    });
  });

  return () => {
    for (const channel of channels) void client.removeChannel(channel);
    void client.realtime.disconnect();
  };
}
