import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HostGame } from "@/components/host/HostGame";
import { isHostAuthenticated } from "@/lib/server/host-auth";

export const metadata: Metadata = { title: "Telão · Quiz ao vivo" };

export default async function HostSessionPage({ params }: PageProps<"/host/[sessionId]">) {
  if (!(await isHostAuthenticated())) redirect("/host");
  const { sessionId } = await params;
  return <HostGame sessionId={sessionId} />;
}
