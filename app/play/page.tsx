import type { Metadata } from "next";
import { PlayerApp } from "@/components/player/PlayerGame";

export const metadata: Metadata = { title: "Jogando · Quiz ao vivo" };

export default function PlayPage() {
  return <PlayerApp />;
}
