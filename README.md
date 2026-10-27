# Floor

Questions from the room, best first.

Floor is live audience Q&A for meetups, classes, all-hands and panels. The host opens a room and shows a six character code and a QR code. People in the room ask questions from their phones and upvote the ones they want answered. The host sees the queue in vote order, pins the question they are answering, and copies a clean recap when the session ends.

Nobody signs up. Attendees scan, ask and vote.

Built for the [Nexconn Build Challenge 2026](https://reskilll.com/hack/nexconn/). Realtime delivery runs on the Nexconn Chat SDK.

## What it does

- **Ask and upvote.** One vote per person, and you can take it back. You cannot vote for your own question.
- **Duplicate check while you type.** If your question looks like one already asked, Floor offers to upvote that one instead, so the queue does not fill with near copies.
- **Host queue.** Answer now, mark answered, hide, reopen. "Answer top question" pins whatever has the most votes.
- **Projector view.** `/r/CODE/screen` shows the question being answered in large type, the next three, and the join QR.
- **Room chat.** A side channel for reactions and links that stays out of the question list.
- **Recap.** One click copies a Markdown summary: answered questions, still open questions, vote counts.

## How it works

Every action is an event (`q.ask`, `q.vote`, `q.pin` and so on) sent as a Nexconn custom message (`floor:evt`) to a group channel named `floor-CODE`. Each client folds the event log into the same room state, so:

- late joiners load channel history and catch up;
- duplicate delivery is harmless, because events are deduplicated by id;
- arrival order does not matter, because events are sorted by time and id before folding;
- host rights belong to whoever sent the first `room.open`, and host-only events from anyone else are ignored.

The server's only job is identity. `POST /api/session` issues a Nexconn access token with the server API and creates or joins the group channel. The App Secret never leaves the server.

```
src/lib/room.ts              event schema, fold, rank, duplicate check, recap
src/lib/transport/nexconn.ts Nexconn Chat SDK transport
src/lib/transport/local.ts   demo transport (one browser, BroadcastChannel)
src/lib/nexconn-server.ts    signed server API calls (token, group create, join)
src/app/api/session          token and channel setup
src/app/r/[code]             attendee, host and screen views
```

## Run it

```bash
pnpm install
pnpm dev
```

Without Nexconn keys Floor runs in **demo mode**: a room lives in one browser, and tabs talk over BroadcastChannel. Open the host view and a guest tab side by side to try it.

For real rooms across devices, create a Nexconn app and set:

```bash
NEXCONN_APP_KEY=...
NEXCONN_APP_SECRET=...
NEXCONN_API_BASE=...   # the server API domain for your app's data center
```

## Checks

```bash
pnpm test        # Vitest: room model, signing, server calls, session API
pnpm typecheck
pnpm lint
pnpm build
```

## Notes

- Rate limit on `/api/session` is per instance and in memory. It is a speed bump, not a security boundary.
- Questions are capped at 280 characters, chat messages at 500, names at 40.
- Built with help from AI coding assistants. All code was reviewed and tested before commit.

## License

MIT
