import { notFound } from "next/navigation";
import { ClientOnly } from "@/components/client-only";
import { ScreenRoom } from "@/components/screen-room";
import { isRoomCode } from "@/lib/ids";

export default async function ScreenPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isRoomCode(code)) notFound();
  return (
    <ClientOnly>
      <ScreenRoom code={code} />
    </ClientOnly>
  );
}
