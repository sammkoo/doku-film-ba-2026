#!/usr/bin/env python3
"""Validate the single source of truth and generate the public RFC 5545 feed."""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://sammkoo.github.io/doku-film-ba-2026/'
TZ = ZoneInfo('Europe/Bratislava')
def utc(value):
    return datetime.fromisoformat(value).astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
def escape(value):
    return str(value or '').replace('\\', '\\\\').replace('\r\n', '\n').replace('\n', '\\n').replace(';', '\\;').replace(',', '\\,')
def fold(line):
    out, part, length = [], '', 0
    for c in line:
        size = len(c.encode('utf-8'))
        if length + size > 75:
            out.append(part)
            part, length = ' ', 1
        part += c
        length += size
    return '\r\n'.join(out + [part])
def validate(model):
    ids, uids, occurrences = set(), set(), set()
    venues = {v['id']:v for v in model['venues']}
    assert len(venues) == len(model['venues']), 'Duplicate venue ID'
    for v in venues.values():
        if v.get('lat') is not None:
            assert 48.0 < v['lat'] < 48.3 and 16.9 < v['lon'] < 17.3, f"Venue outside Bratislava: {v['id']}"
            assert v.get('coordinateSource'), f"Missing geocoding evidence: {v['id']}"
    for e in model['events']:
        for key in ['id','uid','title','start','url','venueId','types','festival','updatedAt','group']:
            assert e.get(key), f"Missing {key}: {e.get('id')}"
        assert e['id'] not in ids and e['uid'] not in uids, f"Duplicate identifier: {e['id']}"
        ids.add(e['id']); uids.add(e['uid'])
        assert e['venueId'] in venues, f"Missing venue: {e['id']}"
        start = datetime.fromisoformat(e['start'])
        assert start.tzinfo and start.utcoffset() == start.astimezone(TZ).utcoffset(), f"Wrong DST offset: {e['id']}"
        assert '2026-10-19' <= start.astimezone(TZ).date().isoformat() <= '2026-10-25', f"Outside week: {e['id']}"
        for key in ['end','estimatedEnd']:
            if e.get(key):
                end = datetime.fromisoformat(e[key])
                assert end > start, f"End before start: {e['id']}"
                assert end.utcoffset() == end.astimezone(TZ).utcoffset(), f"Wrong end offset: {e['id']}"
        assert not (e.get('end') and e.get('estimatedEnd')), f"Ambiguous end: {e['id']}"
        assert e['url'].startswith('https://') and not re.search(r'\s',e['url']), f"Invalid URL: {e['id']}"
        assert re.fullmatch(r'[A-Za-z0-9._-]+',e['id']), 'Unsafe route ID'
        occurrence = (e['group'],e['start'],e['venueId'],e.get('room'))
        assert occurrence not in occurrences, f"Duplicate screening: {e['id']}"
        occurrences.add(occurrence)
        for film in e.get('films',[]):
            assert film.get('title') and film.get('url'), f"Incomplete film: {e['id']}"
    return len(ids)
def generate(model):
    lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DOKU & FILM BA//Program 2026//SK','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:DOKU & FILM / Bratislava 2026','X-WR-TIMEZONE:Europe/Bratislava','REFRESH-INTERVAL;VALUE=DURATION:PT6H','X-PUBLISHED-TTL:PT6H']
    venues = {v['id']:v for v in model['venues']}
    for e in model['events']:
        v = venues[e['venueId']]
        url = BASE + '#event=' + e['id']
        films = '\n'.join(f"{f['title']} — {f.get('director') or 'réžia nezverejnená'}" + (f" ({f['duration']} min)" if f.get('duration') else '') for f in e.get('films',[]))
        desc = '\n\n'.join(x for x in [e.get('summary'),e.get('notice'),'Vstupné: '+(e.get('price') or 'nezverejnené'),e.get('guests'),e.get('registrationNote'),films,('Koniec nie je potvrdený. '+('Čas konca v kalendári je iba orientačný odhad.' if e.get('estimatedEnd') else '')) if not e.get('end') else None,'Koniec podľa: '+e['endSource'] if e.get('endSource') else None,'Zdroj: '+e['url'],url] if x)
        lines += ['BEGIN:VEVENT','UID:'+e['uid'],'DTSTAMP:'+utc(e.get('updatedAt',model['updatedAt'])),'LAST-MODIFIED:'+utc(e.get('updatedAt',model['updatedAt'])),'SEQUENCE:'+str(e.get('sequence',0)),'DTSTART:'+utc(e['start'])]
        end=e.get('end') or e.get('estimatedEnd')
        if end: lines += ['DTEND:'+utc(end)]
        lines += ['SUMMARY:'+escape(e['title']),'LOCATION:'+escape(', '.join(x for x in [v['name'],e.get('room'),v.get('address')] if x)),'DESCRIPTION:'+escape(desc),'URL:'+url,'TRANSP:TRANSPARENT','STATUS:'+('TENTATIVE' if e.get('status')=='tentative' else 'CONFIRMED'),'END:VEVENT']
    return '\r\n'.join(fold(line) for line in lines+['END:VCALENDAR'])+'\r\n'
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    model=json.loads((ROOT/'data/program.json').read_text());count=validate(model);feed=generate(model)
    if args.check:
        assert (ROOT/'program.ics').read_bytes()==feed.encode('utf-8'),'program.ics is stale: run python3 scripts/build.py'
    else: (ROOT/'program.ics').write_bytes(feed.encode('utf-8'))
    print(f'Validated {count} events; ICS '+('matches data.' if args.check else 'generated.'))
if __name__=='__main__':main()
