# Demo video sources

How `floor-demo.mp4` was made:

1. `capture.mjs` drives the live app (https://floor-beige.vercel.app, Nexconn real mode) in headless Chrome with four separate browser contexts: host laptop, Maya's phone, a late joiner's phone and the projector view. It saves timed screenshots of each and the time of every step.
2. `tts.py` reads `script.json` and makes the narration with Piper TTS (LJ Speech voice). The voice is synthetic and the video says so on screen.
3. `Floor.tsx` is the Remotion composition that lays out the four captures side by side, adds captions, and renders 1920x1080 at 30 fps.
4. `render-chunks.sh` renders the composition in chunks (the shared box runs low on memory) and the narration is mixed in with ffmpeg at each segment start.

The mp4 itself is not in git.
