import { notFound } from "next/navigation";
import { AttendeeRoom } from "@/components/attendee-room";
import { ClientOnly } from "@/components/client-only";
import { isRoomCode } from "@/lib/ids";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isRoomCode(code)) notFound();
  return (
    <ClientOnly>
      <AttendeeRoom code={code} />
    </ClientOnly>
  );
}
