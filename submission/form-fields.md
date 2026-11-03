# Reskilll submission form: values for Floor

The Reskilll pages (https://reskilll.com/hack/nexconn and /rules, read Nov 3, 2026) do not list the form fields. The form sits behind sign-in. The values below cover the required parts the rules name (write-up PDF, demo video link, live URL, public GitHub repo, App Key in the form), plus fields most forms ask for.

Rules that matter for the form:
- Only the team leader can select the track and submit. To enter alone, create a team of one on the dashboard.
- You can edit the submission as many times as you want until Nov 22, 23:59 AoE (Mon, Nov 23, 6:59 AM EST).
- Say which parts existed before the challenge and which were built for it. The write-up covers this in "What existed before the challenge".

## Project name

Floor

## Tagline (short)

Questions from the room, best first. Live audience Q&A on the Nexconn Chat SDK.

## Track

Social & Community

## Short description (about 50 words)

Floor is live audience Q&A for meetups, classes, all-hands and panels. The host opens a room and shows a code and QR. People ask from their phones with no sign up, upvote what they want answered, and the host answers the top question while a projector view shows it to the room.

## Long description

Every Q&A ends the same way: "Any questions?", then silence or the same two voices. The questions most of the room wants answered never get asked, because asking means standing up in front of everyone.

Floor fixes that in ten seconds. The host types a title and gets a six character code and a QR code. Attendees scan it, ask anonymously or with a name, and upvote. A duplicate check while typing offers to upvote a similar question instead. The host sees the queue in vote order, pins the question being answered, and can turn on slow mode for big rooms. A projector view shows the pinned question in large type with the join code. Room chat runs alongside for side conversation. When the session ends, everyone gets the same recap, with the most wanted questions first, ready to copy as Markdown.

Floor has no database. The Nexconn Chat SDK is the whole realtime and storage layer: each room is a Nexconn group channel, every action is a persisted custom message, and every client folds the same event log into the same state. Late joiners and reloads rebuild the full room from Nexconn message history.

## Live URL

https://floor-beige.vercel.app

## Source code (public GitHub repo)

https://github.com/Joe-Simo/floor

## Demo video

https://vimeo.com/1242867796

## Nexconn App Key

8brlm7uf89gq3

(App "Floor", North America data center.)

## Write-up PDF (upload)

/workspace/hackathons/floor/submission/floor-writeup.pdf

Also viewable at https://github.com/Joe-Simo/floor/blob/main/submission/floor-writeup.pdf

## Platform

Web (mobile first, works in any phone or laptop browser)

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Nexconn Chat SDK (@nexconn/chat and @nexconn/engine 26.2), Nexconn Server API, qrcode, Vitest, deployed on Vercel.

## Nexconn features used

- Chat SDK group channels: one channel per room (floor-CODE), created by the server when the host opens the room. Attendees are added when they join.
- Custom messages: every action (ask, vote, retract, pin, answer, hide, slow mode, end, chat) is a persisted custom message, so all clients share one event log in real time.
- Remote message history (BaseChannel.createMessagesQuery): late joiners and reloads replay the channel history and rebuild the full room.
- Late joiner catch-up: a non-persisted sync request, answered by a persisted snapshot from the host client.
- Connection status handler: drives the Live, Reconnecting and Offline indicator, and a reconnect reloads history.
- Server API: access token issue and group channel create and join, signed with the App Secret on the server only, with failover to the backup API domain.

## Nexconn SDK used

Chat SDK (no Call SDK)

## Team

Joe Simo (team of one)

## What existed before the challenge

Nothing. The challenge opened Oct 23, 2026. The first commit was Oct 26, 2026, and every line of Floor, Nexconn integration included, was written during the challenge. The git history shows each step.

## Traction proof (bonus, optional)

None yet. Add analytics screenshots or user feedback here if real sessions happen before Nov 22.
