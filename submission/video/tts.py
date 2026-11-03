import json,subprocess,wave,os
s=json.load(open('script.json'))
os.makedirs('vo',exist_ok=True)
for x in s:
    out=f"vo/{x['id']}.wav"
    say=x['text'].replace('Nexconn','Nex con').replace('Q and A','Q and A').replace('SDK','S D K')
    subprocess.run(["/workspace/video-pipeline/.venv/bin/piper","-m","/workspace/video-pipeline/en_US-ljspeech-high.onnx","-f",out,"--sentence-silence","0.35"],input=say.encode(),check=True,capture_output=True)
    w=wave.open(out); x['dur']=round(w.getnframes()/w.getframerate(),2)
    print(x['id'],x['dur'],flush=True)
json.dump(s,open('script.json','w'),indent=1)
print("total",sum(x['dur'] for x in s))
