import { chromium } from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
const BASE = "https://floor-beige.vercel.app";
fs.rmSync("capture", { recursive: true, force: true });
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--hide-scrollbars"] });
const T0 = Date.now() / 1000;
const marks = {};
const mark = (k) => { marks[k] = +(Date.now() / 1000 - T0).toFixed(2); console.log(k, marks[k]); };
const panes = {};
const sockets = new Set(), sessions = [], errs = [];
async function pane(name, vp, dsf, mw, mh) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf, isMobile: name === "guest" || name === "late", hasTouch: false });
  const p = await ctx.newPage();
  p.on("websocket", (ws) => sockets.add(new URL(ws.url()).host));
  p.on("pageerror", (e) => errs.push(name + " " + e.message));
  p.on("response", async (r) => { if (r.url().endsWith("/api/session")) { try { const j = await r.json(); sessions.push(`${name} mode=${j.mode} area=${j.area} group=${j.groupId}`); } catch {} } });
  fs.mkdirSync(`capture/${name}`, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(p);
  let running = true;
  const loop = (async () => {
    while (running) {
      const t = Date.now() / 1000 - T0;
      try {
        const r = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 88, clip: { x: 0, y: 0, width: vp.width, height: vp.height, scale: dsf } });
        const fn = `${name}/${String(frames.length).padStart(5, "0")}.jpg`;
        fs.writeFileSync("capture/" + fn, Buffer.from(r.data, "base64"));
        frames.push({ fn, t });
      } catch { await new Promise((r) => setTimeout(r, 50)); }
    }
  })();
  const stop = async () => { running = false; await loop; };
  const tick = setInterval(() => p.evaluate(() => { document.documentElement.dataset.t = String(Date.now()); }).catch(() => {}), 60);
  panes[name] = { p, cdp, frames, tick, stop };
  return p;
}
const host = await pane("host", { width: 1280, height: 800 }, 1.25, 1600, 1000);
const guest = await pane("guest", { width: 390, height: 844 }, 2, 780, 1688);
const late = await pane("late", { width: 390, height: 844 }, 2, 780, 1688);
await late.goto("about:blank");
const screen = await pane("screen", { width: 1600, height: 900 }, 1.2, 1920, 1080);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const see = (p, t, ms = 20000) => p.getByText(t).first().waitFor({ timeout: ms });
const type = async (p, sel, text) => { await p.click(sel); await p.type(sel, text, { delay: 45 }); };
const Q1 = "How do you keep the queue fair in a big room?";
const Q2 = "Will the slides be shared after the talk?";

await host.goto(BASE + "/", { waitUntil: "networkidle" });
await wait(800);
mark("landing");
await wait(2500);
await type(host, 'input[placeholder="Thursday all-hands"]', "Design review");
await wait(600);
await host.getByRole("button", { name: "Open the floor" }).click();
await host.waitForURL(/\/r\/[2-9A-Z]{6}\/host$/);
const code = host.url().match(/\/r\/([2-9A-Z]{6})\/host/)[1];
mark("hostopen");
await wait(5000);

await guest.goto(`${BASE}/r/${code}`);
await guest.waitForSelector("#ask", { timeout: 30000 });
mark("guestjoin");
await wait(1500);
await guest.getByText("Add your name").click();
await wait(300);
await type(guest, 'input[placeholder="Your name (optional)"]', "Maya");
await guest.getByRole("button", { name: "Save" }).click();
await wait(800);
mark("guestask");
await type(guest, "#ask", Q1);
await wait(400);
await guest.getByRole("button", { name: "Ask", exact: true }).click();
await see(host, Q1);
mark("hostgot");
await wait(3500);

await late.goto(`${BASE}/r/${code}`);
await late.waitForSelector("#ask", { timeout: 30000 });
mark("latejoin");
await see(late, Q1);
mark("latecaught");
await wait(2500);
await late.getByRole("button", { name: /^Upvote, 0 votes/ }).first().click();
await host.getByRole("button", { name: /1 votes?/ }).first().waitFor({ timeout: 20000 });
mark("voted");
await wait(3000);
await type(late, "#ask", Q2);
await late.getByRole("button", { name: "Ask", exact: true }).click();
await see(guest, Q2);
mark("q2");
await wait(1200);
await guest.getByRole("button", { name: /^Upvote, 0 votes/ }).first().click();
await wait(3500);

mark("chat");
await guest.getByRole("tab", { name: "Chat" }).click();
await late.getByRole("tab", { name: "Chat" }).click();
await wait(800);
await type(guest, "#chat", "Joining from the back row, great talk so far");
await guest.getByRole("button", { name: "Send" }).click();
await see(late, "Joining from the back row");
await wait(2500);
await type(late, "#chat", "Same here, the mic is a bit quiet");
await late.getByRole("button", { name: "Send" }).click();
await see(guest, "the mic is a bit quiet");
await wait(3000);
await guest.getByRole("tab", { name: "Questions" }).click();
await late.getByRole("tab", { name: "Questions" }).click();
await wait(1000);

mark("pin");
await host.getByRole("button", { name: "Answer now" }).first().click();
await see(guest, "Being answered now");
await wait(1500);
await screen.goto(`${BASE}/r/${code}/screen`);
await see(screen, "How do you keep the queue fair", 30000);
mark("screen");
await wait(5000);

mark("reload");
await guest.reload();
await late.reload();
await see(guest, "Being answered now", 30000);
await see(late, "Will the slides", 30000);
mark("reloaded");
await wait(2500);
await host.reload();
await see(host, Q1, 30000);
mark("hostreloaded");
await wait(3500);

mark("next");
await host.getByRole("button", { name: "Done, next" }).click();
await wait(5000);

mark("end");
await host.getByRole("button", { name: "End session" }).click();
await wait(700);
await host.getByRole("button", { name: "End session" }).first().click();
await wait(6000);
mark("stop");

for (const n of Object.keys(panes)) { clearInterval(panes[n].tick); await panes[n].stop(); }
await wait(500);
await b.close();
const span = Date.now() / 1000 - T0;
for (const [n, { frames }] of Object.entries(panes)) {
  let s = "ffconcat version 1.0\n";
  const fr = frames.filter((f) => f.t >= 0);
  for (let i = 0; i < fr.length; i++) {
    const start = i === 0 ? 0 : fr[i].t;
    const end = i + 1 < fr.length ? fr[i + 1].t : span;
    s += `file '${fr[i].fn.split("/")[1]}'\nduration ${Math.max(0.001, end - start).toFixed(4)}\n`;
  }
  s += `file '${fr.at(-1).fn.split("/")[1]}'\n`;
  fs.writeFileSync(`capture/${n}/frames.ffconcat`, s);
  console.log(n, "frames", fr.length);
}
fs.writeFileSync("capture/marks.json", JSON.stringify({ code, span, ...marks }, null, 1));
console.log("sessions", sessions.join(" | "));
console.log("sockets", [...sockets].join(","));
console.log("errors", errs.join(" | ") || "none");
