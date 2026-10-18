# DOKU & FILM / Bratislava 2026

Nezávislý filmový sprievodca pre Bratislavu, 19.–25. októbra 2026. Statická stránka bez backendu, účtov, analytiky a platených služieb. Program a mapa fungujú z jedného zdroja dát.

Verejná adresa po aktivovaní GitHub Pages: https://sammkoo.github.io/doku-film-ba-2026/

## Aktualizácia programu

1. Uprav `data/program.json`. To je jediný zdroj pravdy. Web ho načítava priamo.
2. Pri existujúcej udalosti **nikdy nemeň `id` ani `uid`**, ani pri posune dátumu alebo zmene názvu. Zvýš `sequence` o 1 a nastav `updatedAt` na aktuálny ISO dátum s časovým pásmom. Aktualizuj aj koreňové `updatedAt`.
3. `start` a potvrdený `end` obsahujú explicitný offset: do 24. 10. `+02:00`, od 25. 10. `+01:00`. Zobrazovanie vždy používa `Europe/Bratislava`, export je v UTC.
4. Ak organizátor koniec nepotvrdil, nechaj `end: null`. Voliteľný odhad ulož do `estimatedEnd`, vysvetli ho v `endSource`. Nezamieňaj stopáž filmu s dĺžkou diskusie alebo celého bloku.
5. Pri zmene pridaj ľudsky čitateľný `notice`. Pri rozpore termínov použi `status: "tentative"` a uveď oba zdroje. Aktuálny príklad je masterclass Oskouei/Akhlaghi.
6. Nové premietanie toho istého filmu má vlastné `id` a `uid`, ale spoločný `group`. Tak sa zobrazia ostatné termíny bez spájania rôznych projekcií.
7. Filmové pásmo má `films` (názov, réžia, rok, stopáž, typ, krátky súhrn a URL). Nevytváraj vlastné časy začiatku jednotlivých filmov.
8. Nové miesto pridaj do `venues` s overenou adresou, súradnicami a `coordinateSource`. Ak súradnice nie sú potvrdené, použi `null`; udalosť ostane v zozname, na mapu sa nevymyslí bod.
9. Spusti:

   ```sh
   python3 scripts/build.py
   python3 scripts/test_data.py
   node --check assets/app.js
   ```

10. Commitni dáta aj generovaný `program.ics`. GitHub Actions ho pred publikovaním aj tak znovu vygeneruje. Rovnaký feed v koreňovej vetve zachová existujúce odbery z raw.githubusercontent.com.

`data/baseline-20261018.json` je minimálny auditný záznam pôvodných 84 udalostí, nie druhý aktívny program. Netreba ho meniť pri bežných aktualizáciách. `audit.md` vysvetľuje zdroje, opravy a neistoty.

## Publikovanie na GitHub Pages

V **Settings → Pages → Build and deployment → Source** vyber **GitHub Actions**. Workflow `Validate and publish GitHub Pages` overí dáta, vygeneruje kalendár a publikuje iba verejné súbory. Po úspešnom deployi over stránku aj `program.ics` na verejnej adrese. Samotný commit ešte neznamená nasadenie.

Ak je zapnuté staršie publikovanie z vetvy, stránka vie fungovať aj z `main` / root, keďže všetky hotové súbory sú v koreňovej vetve. Preferovaný je workflow s validáciou pred publikovaním.

## Kalendáre

- **Odber**: `https://sammkoo.github.io/doku-film-ba-2026/program.ics`. Aplikácia opakovane sťahuje feed. Interval obnovovania riadi Apple/Google/Outlook, nie stránka.
- **Jedna udalosť**: tlačidlo v detaile vytvorí samostatný .ics s rovnakým UID.
- **Viac udalostí**: označenie pomocou + a export vlastného výberu.
- Import súboru je jednorazová kópia. Nebude sa automaticky aktualizovať. Opakované ručné importy môžu závisieť od správania aplikácie; pre priebežné zmeny používaj odber.
- Výber sa ukladá v lokálnom úložisku prehliadača. Stránka nevytvára nič priamo v osobných Google kalendároch.

Priame odkazy majú tvar `/#event=acko332026`; hash funguje na GitHub Pages bez serverového presmerovania.

## Mapa a súkromie

Leaflet 1.9.4 je súčasťou repozitára a načíta sa až po otvorení mapy. Podklady © OpenStreetMap contributors sa načítajú z `tile.openstreetmap.org`; poskytovateľ dostáva bežnú sieťovú požiadavku na mapové dlaždice. Žiadne sledovacie pixely ani analytika.

Geolokácia sa vyžiada až kliknutím na „Použiť moju polohu“ a zostáva v pamäti prehliadača. Dá sa nahradiť výberom miesta alebo bodu na mape. Peší čas je **odhad**: vzdušná vzdialenosť × 1,25 pri 4,5 km/h. Nie je to routing ani záruka priechodnosti. Navigácia otvorí Google Maps až po vedomom kliknutí používateľa.

Pri výpadku mapy zostáva dostupný zoznam, detail a navigácia. Mapa rešpektuje rovnaké filtre ako program.

## Kontrola zmien oficiálnych zdrojov

Workflow `Review official source changes` kontroluje zdroje denne o 05:15 UTC iba 18.–25. októbra 2026. Mimo tohto obdobia nevykonáva sieťové požiadavky. Dá sa spustiť aj ručne. Výsledok uloží do artefaktu `source-changes-for-review` na 14 dní.

Kontrola porovnáva SHA-256 HTML s `data/source-fingerprints.json`. Zmena je iba podnet na ručnú kontrolu — stránky môžu meniť tokeny, dostupnosť lístkov alebo technické HTML. Skript **nikdy neprepisuje program**. Po ručne overenej aktualizácii môžeš obnoviť fingerprint kontrolovaného zdroja. Gmail ani súkromné kalendáre sa do verejnej automatizácie nezapájajú.

## Overenie

`python3 scripts/test_data.py` kontroluje zachovanie pôvodných UID, duplicity, časové pásmo vrátane 25. októbra, neistý masterclass, opravené miesta, film navyše v pásme, UTC export a UTF-8 skladanie riadkov podľa RFC 5545. `python3 scripts/build.py --check` overí, či feed presne zodpovedá dátam.

Rozhranie používa natívne formuláre a dialógy, ovládanie klávesnicou, viditeľný focus, oznamovanie počtu výsledkov a rešpektuje `prefers-reduced-motion`. Živé prehliadačové overenie a jeho prípadné limity sú v `audit.md`.

## Licencie

Kód sprievodcu v tomto repozitári; Leaflet © Vladimir Agafonkin a prispievatelia, BSD-2-Clause (`assets/leaflet-LICENSE`). Mapové údaje © OpenStreetMap contributors, ODbL. Názvy, autorské kredity a fakty o programe pochádzajú z uvedených oficiálnych zdrojov; krátke redakčné súhrny odkazujú na plné anotácie organizátorov.

## Živý priebeh programu

Rozhranie obnovuje čas každých 30 sekúnd a hneď po návrate na kartu. Skončené položky sú predvolene skryté; tlačidlo „Zobraziť skončené“ ich vedome sprístupní. Plánovaný priebeh bloku sa zobrazuje cez progressbar, uplynuté a zostávajúce minúty. Odhadované konce sú výslovne odlíšené; pri nezverejnenom konci sa percento ani zostávajúci čas nevymýšľajú. Neznámy koniec zostáva počas dňa označený ako neznámy.

Film v pásme sa môže označiť ako aktuálny len ak má konkrétne potvrdené `films[].start` a `films[].end` v ISO formáte. Stopáže sa automaticky nesčítavajú do vymysleného harmonogramu. Priebeh je podľa publikovaného plánu, nie živý prenos zo sály.

Najviac každých päť minút sa overí nový `data/program.json` bez cache. Pri zmene `updatedAt` sa načíta aktualizovaný program; pri výpadku siete zostávajú posledné dáta. Nevyžaduje sa obnovenie stránky.
