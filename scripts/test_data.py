#!/usr/bin/env python3
import json,unittest
from datetime import datetime,timedelta
from pathlib import Path
from build import validate,generate,fold
ROOT=Path(__file__).resolve().parent.parent
class ProgrammeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model=json.loads((ROOT/'data/program.json').read_text())
        cls.by_id={e['id']:e for e in cls.model['events']}
    def test_schema_and_duplicates(self):
        self.assertEqual(validate(self.model),len(self.by_id))
    def test_original_uid_preserved(self):
        for old in json.loads((ROOT/'data/baseline-20261018.json').read_text()):
            self.assertEqual(self.by_id[old['id']]['uid'],old['uid'])
    def test_dst_on_sunday(self):
        for e in self.by_id.values():
            expected=timedelta(hours=1 if e['start'].startswith('2026-10-25') else 2)
            self.assertEqual(datetime.fromisoformat(e['start']).utcoffset(),expected)
    def test_uncertain_masterclass(self):
        e=self.by_id['acko332026'];self.assertEqual(e['start'],'2026-10-23T13:00:00+02:00')
        self.assertFalse(e['end']);self.assertEqual(e['status'],'tentative');self.assertIn('13:30',e['notice'])
    def test_corrected_venue_and_repeats(self):
        self.assertEqual(self.by_id['jeden152026']['venueId'],'noclaharen')
        self.assertEqual(self.by_id['jeden22026']['venueId'],'domec')
        self.assertEqual(self.by_id['jeden02026']['group'],self.by_id['jeden32026']['group'])
    def test_unknown_end_not_fabricated(self):
        e=self.by_id['imago-drz-piesen20261024'];self.assertFalse(e['end']);self.assertFalse(e.get('estimatedEnd'))
    def test_block_missing_film_repaired(self):
        films=self.by_id['acko22026']['films'];self.assertEqual(len(films),8)
        self.assertIn('Rozšliapnutý melón',[f['title'] for f in films])
    def test_feed_matches_single_source(self):
        feed=generate(self.model)
        self.assertEqual(feed.encode(),(ROOT/'program.ics').read_bytes())
        self.assertEqual(feed.count('BEGIN:VEVENT'),len(self.by_id))
        self.assertTrue(all(len(line.encode())<=75 for line in feed.split('\r\n')))
        self.assertEqual(fold('Ž'*100).replace('\r\n ',''),'Ž'*100)
        self.assertIn('DTSTART:20261025T093000Z',feed)
if __name__=='__main__':unittest.main()
