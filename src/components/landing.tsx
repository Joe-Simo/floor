"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isRoomCode, normalizeCode, roomCode } from "@/lib/ids";
import { Wordmark } from "./ui";

export function Landing() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  function start(e: React.FormEvent) {
    e.preventDefault();
    const c = roomCode();
    sessionStorage.setItem(`floor:new:${c}`, title.trim() || "Questions");
    router.push(`/r/${c}/host`);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!isRoomCode(c)) return setCodeError("Room codes are six letters and numbers, like K7M2QX.");
    router.push(`/r/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <a className="text-sm text-mute hover:text-ink" href="https://github.com/Joe-Simo/floor">
          Source
        </a>
      </header>

      <section className="mt-16 sm:mt-24">
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Questions from the room, best first.</h1>
        <p className="mt-5 max-w-xl text-lg text-mute">
          Open a room, show the code, and let people ask and upvote from their phones. The questions most people want answered rise to the top. No app, no sign-up.
        </p>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        <form onSubmit={start} className="rounded-2xl border border-line bg-card p-6">
          <h2 className="font-semibold">Start a room</h2>
          <p className="mt-1 text-sm text-mute">For the person on stage, or running the meeting.</p>
          <label className="mt-5 block text-sm font-medium" htmlFor="title">
            What is it called?
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Thursday all-hands"
            className="mt-2 w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-base outline-none focus:border-accent"
          />
          <button className="mt-4 w-full rounded-xl bg-ink px-4 py-3 font-medium text-paper hover:opacity-90">Open the floor</button>
        </form>

        <form onSubmit={join} className="rounded-2xl border border-line bg-card p-6">
          <h2 className="font-semibold">Join a room</h2>
          <p className="mt-1 text-sm text-mute">Type the code on the screen.</p>
          <label className="mt-5 block text-sm font-medium" htmlFor="code">
            Room code
          </label>
          <input
            id="code"
            value={code}
            onChange={(e) => {
              setCode(normalizeCode(e.target.value));
              setCodeError(null);
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="K7M2QX"
            aria-invalid={!!codeError}
            aria-describedby={codeError ? "code-error" : undefined}
            className="mt-2 w-full rounded-xl border border-line bg-paper px-3.5 py-3 font-mono text-lg tracking-[0.3em] uppercase outline-none focus:border-accent"
          />
          {codeError && (
            <p id="code-error" className="mt-2 text-sm text-warn">
              {codeError}
            </p>
          )}
          <button className="mt-4 w-full rounded-xl border border-ink px-4 py-3 font-medium hover:bg-ink hover:text-paper">Join</button>
        </form>
      </section>

      <section className="mt-16 grid gap-8 border-t border-line pt-10 sm:grid-cols-3">
        {[
          ["Ask", "Anyone with the code can ask. If a question already exists, Floor suggests an upvote instead of a duplicate."],
          ["Vote", "One tap to back a question. The list re-orders itself live, so the room decides what matters."],
          ["Answer", "The host pins the question being answered, marks it done, and takes a plain-text recap home."],
        ].map(([h, p]) => (
          <div key={h}>
            <h3 className="font-semibold">{h}</h3>
            <p className="mt-2 text-sm leading-relaxed text-mute">{p}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-16 text-xs text-mute">
        Real-time messaging by Nexconn Chat. Built for the Nexconn Build Challenge 2026 with AI coding assistance.
      </footer>
    </main>
  );
}
