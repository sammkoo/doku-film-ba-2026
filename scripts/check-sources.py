#!/usr/bin/env python3
"""Read-only change monitor. Never overwrites program.json or announces unverified changes."""
import hashlib,json,urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parent.parent
SOURCES=ROOT/'data/source-fingerprints.json'
OUTPUT=ROOT/'source-check.json'
def check(item):
    url=item['url']
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'DokuFilmBA/2026 source-monitor'})
        with urllib.request.urlopen(request,timeout=30) as response:
            digest=hashlib.sha256(response.read()).hexdigest()
        return {'url':url,'changed':digest!=item.get('sha256'),'sha256':digest,'note':'Zmena HTML je iba podnet na ručnú kontrolu; môže ísť aj o technickú zmenu stránky.'}
    except Exception as error:return {'url':url,'error':str(error),'changed':None}
items=json.loads(SOURCES.read_text())
with ThreadPoolExecutor(max_workers=3) as pool: result=list(pool.map(check,items))
OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
for item in result:print(item['url'], 'ERROR' if item.get('error') else 'REVIEW' if item['changed'] else 'unchanged')
