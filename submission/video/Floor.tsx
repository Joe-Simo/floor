import React from 'react';
import {AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import data from './floor-data.json';

type Seg = {id: string; text: string; dur: number; clips: number[][]; label: string; layout: string};
const FPS = 30;
const GAP = 0.55;
export const fsegs = (data as Seg[]).map((s) => ({...s, frames: Math.ceil((s.dur + GAP) * FPS)}));
export const FTOTAL = fsegs.reduce((a, s) => a + s.frames, 0);

const font = 'Inter, "Helvetica Neue", Arial, sans-serif';
const BG = '#171716';
const INK = '#f3f1ec';
const MUTE = '#a3a19a';
const ACCENT = '#9db4f5';
const LIVE = '#7fd49b';

type Box = {src: string; x: number; y: number; w: number; h: number; title: string; phone?: boolean};
const SRC: Record<string, [number, number]> = {host: [1600, 1000], guest: [780, 1688], late: [780, 1688], screen: [1920, 1080]};
const TITLES: Record<string, string> = {host: 'Host laptop', guest: "Maya's phone", late: 'Late joiner, new device', screen: 'Projector'};

const row = (names: string[], hs: number[], gap: number, top: number): Box[] => {
  const heights = names.map((_, i) => hs[Math.min(i, hs.length - 1)]);
  const ws = names.map((n, i) => (SRC[n][0] / SRC[n][1]) * heights[i]);
  const total = ws.reduce((a, b) => a + b, 0) + gap * (names.length - 1);
  let x = (1920 - total) / 2;
  const maxH = Math.max(...heights);
  return names.map((n, i) => {
    const b = {src: n, x, y: top + (maxH - heights[i]) / 2, w: ws[i], h: heights[i], title: TITLES[n], phone: n === 'guest' || n === 'late'};
    x += ws[i] + gap;
    return b;
  });
};
const LAYOUTS: Record<string, Box[]> = {
  host: row(['host'], [800], 0, 92),
  'host+guest': row(['host', 'guest'], [740], 56, 110),
  'host+guest+late': row(['host', 'guest', 'late'], [660, 680], 36, 124),
  'guest+late': row(['guest', 'late'], [760], 90, 110),
  'screen+guest': row(['screen', 'guest'], [660, 740], 60, 110),
  'host+screen': row(['host', 'screen'], [540, 500], 44, 230),
};

const Captions: React.FC<{text: string; frames: number}> = ({text, frames}) => {
  const f = useCurrentFrame();
  const parts = text.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  const total = parts.reduce((a, p) => a + p.length, 0);
  const speech = frames - GAP * FPS;
  let acc = 0;
  let current = parts[parts.length - 1];
  for (const p of parts) {
    const end = ((acc + p.length) / total) * speech;
    if (f < end) { current = p; break; }
    acc += p.length;
  }
  return (
    <div style={{position: 'absolute', left: 150, right: 150, bottom: 22, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: font, fontSize: 36, lineHeight: 1.3, color: INK, fontWeight: 500}}>
      <span style={{background: 'rgba(0,0,0,.55)', padding: '8px 22px', borderRadius: 12}}>{current}</span>
    </div>
  );
};

const Pane: React.FC<{seg: (typeof fsegs)[number]; box: Box}> = ({seg, box}) => {
  const avail = seg.frames;
  const srcLen = seg.clips.reduce((a, [s, e]) => a + (e - s) * FPS, 0);
  const rate = Math.max(1, srcLen / avail);
  let offset = 0;
  const pieces = seg.clips.map(([s, e]) => {
    const len = Math.round(((e - s) * FPS) / rate);
    const p = {from: offset, len, start: Math.round(s * FPS), end: Math.round(e * FPS)};
    offset += len;
    return p;
  });
  const last = pieces[pieces.length - 1];
  const src = staticFile(`floor/${box.src}.mp4`);
  const vs = {width: box.w, height: box.h, display: 'block'} as const;
  return (
    <div style={{position: 'absolute', left: box.x, top: box.y}}>
      <div style={{position: 'absolute', top: -34, left: 0, right: 0, textAlign: box.phone ? 'center' : 'left', fontFamily: font, fontSize: 21, color: MUTE, whiteSpace: 'nowrap'}}>{box.title}</div>
      <div style={{width: box.w, height: box.h, borderRadius: box.phone ? 30 : 14, overflow: 'hidden', boxShadow: '0 26px 70px rgba(0,0,0,.55)', outline: box.phone ? '7px solid #2c2c2a' : '1px solid #34342f'}}>
        {pieces.map((p, i) => (
          <Sequence key={i} from={p.from} durationInFrames={p.len} layout="none">
            <OffthreadVideo src={src} startFrom={p.start} endAt={p.end} playbackRate={rate} muted style={vs} />
          </Sequence>
        ))}
        {offset < avail ? (
          <Sequence from={offset} durationInFrames={avail - offset} layout="none">
            <Freeze frame={0}>
              <OffthreadVideo src={src} startFrom={last.end - 1} muted style={vs} />
            </Freeze>
          </Sequence>
        ) : null}
      </div>
    </div>
  );
};

const fadeIn = (f: number, delay = 0) => ({
  opacity: interpolate(f, [delay, delay + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  transform: `translateY(${interpolate(f, [delay, delay + 14], [14, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}px)`,
});

const End: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', fontFamily: font, color: INK, paddingBottom: 120}}>
      <div style={{...fadeIn(f), width: 92, height: 92, borderRadius: 22, background: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9}}>
        {[44, 44, 30].map((w, i) => <div key={i} style={{width: w, height: 8, borderRadius: 4, background: BG}} />)}
      </div>
      <div style={{...fadeIn(f, 6), fontSize: 92, fontWeight: 650, letterSpacing: -2, marginTop: 28}}>Floor</div>
      <div style={{...fadeIn(f, 14), fontSize: 40, color: INK, marginTop: 6}}>Questions from the room, best first.</div>
      <div style={{...fadeIn(f, 24), marginTop: 40, fontSize: 30, color: MUTE, textAlign: 'center', lineHeight: 1.6}}>
        floor-beige.vercel.app<br />github.com/Joe-Simo/floor
      </div>
      <div style={{...fadeIn(f, 34), marginTop: 34, display: 'flex', gap: 16}}>
        {['Real-time sync', 'Late joiner catch-up', 'Reload replay'].map((t) => (
          <div key={t} style={{fontSize: 24, border: '1px solid #3a3a36', borderRadius: 12, padding: '10px 20px', color: ACCENT}}>{t}</div>
        ))}
      </div>
      <div style={{...fadeIn(f, 44), marginTop: 30, fontSize: 24, color: MUTE}}>Built on the Nexconn Chat SDK</div>
    </AbsoluteFill>
  );
};

export const FloorVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: BG}}>
      {fsegs.map((s) => {
        const start = from;
        from += s.frames;
        const boxes = LAYOUTS[s.layout];
        return (
          <Sequence key={s.id} from={start} durationInFrames={s.frames}>
            {boxes ? boxes.map((b) => <Pane key={b.src} seg={s} box={b} />) : <End />}
            {s.label ? (
              <div style={{position: 'absolute', left: 60, top: 18, fontFamily: font, fontSize: 26, fontWeight: 600, color: s.label.startsWith('Nexconn') ? LIVE : ACCENT}}>{s.label}</div>
            ) : null}
            <Audio src={staticFile(`floor/vo/${s.id}.wav`)} />
            <Captions text={s.text} frames={s.frames} />
          </Sequence>
        );
      })}
      <div style={{position: 'absolute', right: 60, top: 20, fontFamily: font, fontSize: 22, color: MUTE}}>Voice: synthetic (Piper TTS)</div>
      <Sequence from={0} durationInFrames={Math.ceil(9 * FPS)}>
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 140, textAlign: 'center', fontFamily: font, fontSize: 22, color: MUTE}}>
          Real screen capture of the live app on Nexconn, recorded Nov 3, 2026. Names are sample data.
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
