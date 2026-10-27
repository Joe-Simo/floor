import { notFound } from "next/navigation";
import { ClientOnly } from "@/components/client-only";
import { HostRoom } from "@/components/host-room";
import { isRoomCode } from "@/lib/ids";

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isRoomCode(code)) notFound();
  return (
    <ClientOnly>
      <HostRoom code={code} />
    </ClientOnly>
  );
}
