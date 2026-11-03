#!/bin/bash
set -u
cd /workspace/video-pipeline/rtest
OUT=/workspace/video-pipeline/floor/chunks
N=3580; STEP=${STEP:-500}; START=${START:-0}
for ((a=START; a<N; a+=STEP)); do
  b=$((a+STEP-1)); [ $b -ge $N ] && b=$((N-1))
  f=$OUT/c$(printf %05d $a).mp4
  [ -s $f ] && continue
  for try in 1 2 3; do
    npx remotion render Floor $f --frames=$a-$b --muted --crf=18 --concurrency=${CONC:-2} --browser-executable=/usr/bin/google-chrome --log=error && break
    rm -f $f
  done
  [ -s $f ] || { echo "CHUNK FAIL $a"; echo EXIT 1; exit 1; }
  echo "CHUNK OK $a-$b"
done
npx remotion render Floor $OUT/audio.wav --codec=wav --browser-executable=/usr/bin/google-chrome --log=error || { echo EXIT 2; exit 2; }
echo EXIT 0
