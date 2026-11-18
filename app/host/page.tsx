import type { Metadata } from "next";
import { HostLogin } from "@/components/host/HostLogin";
import { isHostAuthenticated } from "@/lib/server/host-auth";

export const metadata: Metadata = { title: "Apresentador · Quiz ao vivo" };

export default async function HostPage() {
  return <HostLogin authenticated={await isHostAuthenticated()} />;
}
