import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Floor: questions from the room, best first",
  description: "Open a room, show the code, and let the audience ask and upvote. The best questions rise. Built on Nexconn Chat.",
};

export const viewport: Viewport = { themeColor: "#f6f4ef", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
