'use strict';
(() => {
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const TZ = 'Europe/Bratislava';
const time = value => new Intl.DateTimeFormat('sk-SK',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
const day = value => new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const date = value => new Intl.DateTimeFormat('sk-SK',{timeZone:TZ,weekday:'long',day:'numeric',month:'long'}).format(new Date(value));
const longDate = value => new Intl.DateTimeFormat('sk-SK',{timeZone:TZ,day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const typeNames = {dokument:'Dokument',hrany:'Hraný film',animacia:'Animácia',diskusia:'Diskusia',masterclass:'Masterclass',industry:'Industry',ostatne:'Ostatné'};
const FEED = new URL('program.ics',location.href.split('#')[0]).href;
let model, events=[], venues=[], activeDay='', map, markers, originMarker, origin=null, place='', picking=false, mapLoading;
let showPast=false,followDay=true,lastDay='',lastRefresh=0;
let selection = new Set();
try { selection = new Set(JSON.parse(localStorage.getItem('df26-selection') || '[]')); } catch {}
const now = () => new Date();
const finish = e => e.end || e.estimatedEnd || null;
const past = (e,n=now()) => finish(e) ? +new Date(finish(e))<=+n : day(e.start)<day(n);
const running = (e,n=now()) => finish(e) && +new Date(e.start)<=+n && +new Date(finish(e))>+n;
const recentlyStarted = (e,n=now()) => !finish(e) && +new Date(e.start)<=+n && day(e.start)===day(n);
function liveHTML(e,n=now()){
 const start=+new Date(e.start),end=finish(e)?+new Date(finish(e)):null,elapsed=Math.max(0,Math.floor((+n-start)/60000));
 if(start>+n){const mins=Math.ceil((start-+n)/60000);return mins<=60?`<div class="event-status upcoming-status">Začína o ${mins} min</div>`:'';}
 if(past(e,n))return `<div class="event-status past-status">${e.end?'Skončilo':e.estimatedEnd?'Predpokladaný koniec':'Termín uplynul'}${end?' '+time(finish(e)):''}</div>`;
 if(!end)return `<div class="event-status unknown-status">Začalo o ${time(e.start)} · koniec nezverejnený</div>`;
 const remaining=Math.max(1,Math.ceil((end-+n)/60000)),percent=Math.min(100,Math.max(0,(+n-start)/(end-start)*100));
 const exact=(e.films||[]).find(f=>f.start&&f.end&&+new Date(f.start)<=+n&&+new Date(f.end)>+n);
 return `<div class="live-progress"><div class="progress-caption"><strong>${e.end?'Práve prebieha':'Pravdepodobne prebieha'}</strong><span>${e.end?'':'≈ '}ešte ${remaining} min</span></div><progress max="100" value="${percent.toFixed(2)}" aria-label="${esc(e.title)}: ${Math.round(percent)} % plánovaného času"></progress><div class="progress-detail">${elapsed} min od začiatku${e.estimatedEnd?' · koniec je odhad':''}${exact?`<br>Práve podľa programu: <strong>${esc(exact.title)}</strong>`:e.films?.length?'<br>Priebeh celého pásma. Aktuálny film nie je potvrdený.':''}</div></div>`;
}
const venue = e => venues.find(v=>v.id===e.venueId);
const loc = e => [venue(e)?.name || e.location || 'Miesto čaká na potvrdenie',e.room].filter(Boolean).join(' / ');
const eventURL = e => `${location.href.split('#')[0]}#event=${encodeURIComponent(e.id)}`;
const price = e => e.price || 'Vstupné nezverejnené';
const clockMinutes = value => {const [h,m]=value.split(':').map(Number);return h*60+m;};
const walkMinutes = v => {
 if(!origin || !v?.lat || !v?.lon) return null;
 const r=Math.PI/180, a=(v.lat-origin.lat)*r,b=(v.lon-origin.lon)*r;
 const distance=6371*2*Math.asin(Math.sqrt(Math.sin(a/2)**2+Math.cos(origin.lat*r)*Math.cos(v.lat*r)*Math.sin(b/2)**2));
 return Math.max(1,Math.round(distance*1.25/4.5*60));
};
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
function persist(){try{localStorage.setItem('df26-selection',JSON.stringify([...selection]));}catch{} updateSelection();}
function updateSelection(){
 $('selection-bar').hidden=!selection.size;$('selected-count').textContent=selection.size;
 document.querySelectorAll('[data-select]').forEach(b=>{const selected=selection.has(b.dataset.select);b.setAttribute('aria-pressed',selected);b.textContent=selected?'✓︎':'+';b.setAttribute('aria-label',(selected?'Odobrať z výberu: ':'Vybrať: ')+(events.find(e=>e.id===b.dataset.select)?.title||''));});
}
function toggleSelection(id){selection.has(id)?selection.delete(id):selection.add(id);persist();if($('selected-only').checked)render();}
function renderDays(){
 const labels=['PO','UT','ST','ŠT','PI','SO','NE'], today=day(now());
 $('days').innerHTML=`<label class="mobile-day">Deň programu<select id="day-select" aria-label="Vyber deň"><option value="" ${!activeDay?'selected':''}>Celý týždeň · 19.–25. 10.</option>${labels.map((label,i)=>{const d=`2026-10-${19+i}`;return `<option value="${d}" ${activeDay===d?'selected':''}>${['Pondelok','Utorok','Streda','Štvrtok','Piatok','Sobota','Nedeľa'][i]} ${19+i}. októbra${today===d?' · dnes':''}</option>`;}).join('')}</select></label><div class="desktop-days"><button type="button" data-day="" class="${!activeDay?'active':''}" aria-pressed="${!activeDay}"><strong>Týždeň</strong><span>19. — 25. 10.</span></button>`+labels.map((label,i)=>{const d=`2026-10-${19+i}`;return `<button type="button" data-day="${d}" class="${activeDay===d?'active ':''}${today===d?'today':''}" aria-pressed="${activeDay===d}"><strong>${19+i}</strong><span>${label} / 10</span></button>`;}).join('')+'</div>';
}
function updatePulse(){
 const n=now(),today=day(n),archived=today>'2026-10-25',before=today<'2026-10-19';
 const live=events.filter(e=>running(e,n)),next=events.find(e=>+new Date(e.start)>+n);
 $('phase-label').textContent=archived?'ARCHÍV / 2026':before?'ZAČÍNAME 19. OKTÓBRA':'PRÁVE PREBIEHA';
 $('phase').textContent=archived?'Týždeň vo filme.':before?'Už čoskoro.':live.length?`${live.length} ${live.length===1?'podujatie':'podujatí'}`:'Chvíľa medzi filmami.';
 $('clock').textContent=new Intl.DateTimeFormat('sk-SK',{timeZone:TZ,weekday:'short',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}).format(n)+' / Bratislava';
 const featured=live[0]||next;
 $('next-label').textContent=archived?'PROGRAM OSTÁVA PRÍSTUPNÝ':live.length?'PRÁVE TERAZ':'NAJBLIŽŠIE';
 $('next-event').textContent=archived?'Pozrieť festivalový archív':featured?.title||'Ďakujeme za filmový týždeň.';
 $('next-event').href=featured&&!archived?`#event=${encodeURIComponent(featured.id)}`:'#program';
 $('next-time').textContent=featured&&!archived?`${date(featured.start)} · ${time(featured.start)} · ${loc(featured)}`:'Všetky dni, filmy aj kalendárové exporty zostávajú dostupné.';
 $('today-count').textContent=events.filter(e=>day(e.start)===today).length;
 $('remaining-count').textContent=events.filter(e=>+new Date(e.start)>+n).length;
 $('count-explain').textContent=archived?`${events.length} podujatí v archíve`:'podujatí v programe';
}
function filtered(includePast=showPast){
 const q=norm($('search').value.trim()), f=$('festival').value,t=$('type').value,p=$('part').value,from=$('from').value,to=$('to').value,n=now();
 return events.filter(e=>{
  if(!includePast&&past(e,n))return false;
  if(activeDay && day(e.start)!==activeDay)return false;
  if(f && e.festival!==f && !e.programmes?.includes(f))return false;
  if(t && !e.types.includes(t))return false;
  if(q && !e.searchText.includes(q))return false;
  const m=clockMinutes(time(e.start));
  if(p==='morning'&&m>=720 || p==='afternoon'&&(m<720||m>=1080) || p==='evening'&&m<1080)return false;
  // Interval means an event overlaps the requested time; unpublished ends cannot be inferred.
  if(from||to){
   const lo=from?clockMinutes(from):0,hi=to?clockMinutes(to):1440;
   if(hi<=lo)return false;
   const end=e.end&&day(e.end)===day(e.start)?clockMinutes(time(e.end)):e.end?1440:m+1;
   if(m>=hi || end<=lo)return false;
  }
  if($('upcoming').checked && !(running(e,n)||recentlyStarted(e,n)||(+new Date(e.start)>=+n&&+new Date(e.start)<=+n+10800000)))return false;
  if($('selected-only').checked&&!selection.has(e.id))return false;
  if($('free-only').checked&&!e.free)return false;
  if(origin&&$('walk').value){const minutes=walkMinutes(venue(e));if(minutes===null||minutes>+$('walk').value)return false;}
  return true;
 });
}
// Keep the published array order. Estimates never become confirmed film timestamps.
function filmTimings(e){
 let cursor=e.festival==='Áčko'&&e.start?+new Date(e.start):NaN;
 return (e.films||[]).map(f=>{
  const exactStart=f.start?+new Date(f.start):NaN,exactEnd=f.end?+new Date(f.end):NaN;
  const start=Number.isFinite(exactStart)?exactStart:cursor;
  const minutes=Number(f.duration),hasDuration=f.duration!==null&&f.duration!==''&&Number.isFinite(minutes)&&minutes>0;
  const end=Number.isFinite(exactEnd)?exactEnd:Number.isFinite(start)&&hasDuration?start+minutes*60000:NaN;
  cursor=end;
  return {start,end,confirmed:Number.isFinite(exactStart)&&Number.isFinite(exactEnd)};
 });
}
function filmsHTML(e){
 if(!e.films?.length)return '';
 const timings=filmTimings(e),estimated=e.festival==='Áčko';
 const lastEnd=timings[timings.length-1].end,overrun=e.end&&Number.isFinite(lastEnd)&&lastEnd>+new Date(e.end);
 const note=estimated?'<p class="film-timing-note">Približné časy podľa poradia v programe a stopáží filmov, počítané od začiatku pásma. Bez prestávok, úvodov a diskusií; skutočné premietanie sa môže posunúť. Poradie filmov zostáva zachované.</p>':'';
 return note+`<ol class="film-list">${e.films.map((f,i)=>{
  const t=timings[i],hasStart=Number.isFinite(t.start),hasEnd=Number.isFinite(t.end);
  const timing=hasStart?(t.confirmed?'Podľa programu: ':'Približne ')+time(t.start)+(hasEnd?' – '+time(t.end):' · koniec neznámy'):estimated?'Čas nemožno odhadnúť — chýba stopáž predchádzajúceho filmu.':'';
  return `<li>${timing?`<span class="film-timing">${esc(timing)}</span>`:''}<a href="${esc(f.url||e.url)}" target="_blank" rel="noopener noreferrer">${esc(f.title)}</a><br><span>${esc([f.director, f.year, f.duration?f.duration+' min':null,f.type].filter(Boolean).join(' · '))}</span>${f.summary?`<p>${esc(f.summary)}</p>`:''}</li>`;
 }).join('')}</ol>`+(overrun?'<p class="film-timing-note">Súčet stopáží presahuje publikovaný koniec pásma. Uvedené časy filmov sú iba výpočet; koniec pásma si over v oficiálnom programe.</p>':'');
}
function card(e){
 const v=venue(e),walking=walkMinutes(v),end=e.end?`do ${time(e.end)}`:e.estimatedEnd?`≈ ${time(e.estimatedEnd)} (odhad)`:'koniec nepotvrdený';
 const state=running(e)?'PREBIEHA':recentlyStarted(e)?'NEDÁVNO ZAČALO':'';
 return `<article class="event ${running(e)?'is-live':past(e)?'is-past':''}" data-id="${esc(e.id)}"><div class="event-time"><time datetime="${esc(e.start)}">${time(e.start)}</time><small>${esc(end)}</small>${state?`<small><strong>${state}</strong></small>`:''}</div><div class="event-main"><h4><button class="event-title" data-open="${esc(e.id)}">${esc(e.title)}</button></h4><div class="event-meta"><span class="tag">${esc(e.festival)}</span><span>${e.types.map(t=>typeNames[t]).join(' / ')}</span></div>${e.director?`<p class="event-snippet">${esc(e.director)}${e.duration?' · '+e.duration+' min film':''}</p>`:e.summary?`<p class="event-snippet">${esc(e.summary)}</p>`:''}${e.notice?`<p class="warning">${esc(e.notice)}</p>`:''}${liveHTML(e)}${e.films?.length?`<details class="block-films"><summary>${e.films.length} filmov v pásme — zobraziť</summary>${filmsHTML(e)}</details>`:''}</div><div class="event-place"><strong>${esc(v?.name||e.location||'Miesto nepotvrdené')}</strong><span>${esc(e.room||v?.address||'')}</span>${walking!==null?`<span>≈ ${walking} min pešo (odhad)</span>`:''}<span class="entry">${esc(price(e))}</span></div><button class="select-event" data-select="${esc(e.id)}" aria-pressed="${selection.has(e.id)}" aria-label="Vybrať: ${esc(e.title)}">${selection.has(e.id)?'✓︎':'+'}</button></article>`;
}
function festivalDayMessage(){
 const festival=$('festival').value;
 if(!festival||!activeDay)return null;
 const items=events.filter(e=>e.festival===festival||e.programmes?.includes(festival)).sort((a,b)=>+new Date(a.start)-+new Date(b.start));
 if(!items.length||items.some(e=>day(e.start)===activeDay))return null;
 const first=items[0],last=items[items.length-1],firstDay=day(first.start),lastFestivalDay=day(last.start);
 const subject=festival==='Jeden svet'?'Festival Jeden svet':festival==='Áčko'?'Festival Áčko':festival==='FTF Industry Days'?'Program FTF Industry Days':festival==='Deň dokumentu'?'Deň slovenského dokumentárneho filmu':'Program ďalších projekcií';
 const shortDate=value=>new Intl.DateTimeFormat('sk-SK',{timeZone:TZ,day:'numeric',month:'long'}).format(new Date(value));
 const oneDay=Date.parse(firstDay+'T12:00:00Z')-Date.parse(activeDay+'T12:00:00Z')===86400000;
 if(activeDay<firstDay)return {title:subject+' sa začína až '+(oneDay?'nasledujúci deň.':shortDate(first.start)+'.'),description:'Prvé podujatie: '+date(first.start)+' o '+time(first.start)+'.',target:firstDay,button:'Zobraziť program '+shortDate(first.start)};
 if(activeDay>lastFestivalDay)return {title:subject+' sa skončil '+shortDate(last.start)+'.',description:'Na vybraný deň už nemá zverejnené podujatia. Môžeš si pozrieť jeho posledný deň.',target:lastFestivalDay,button:'Zobraziť posledný deň programu'};
 const next=items.find(e=>day(e.start)>activeDay);
 return {title:subject+': v tento deň nie je zverejnený program.',description:next?'Najbližšie podujatie: '+date(next.start)+' o '+time(next.start)+'.':'Vyber iný deň programu.',target:next?day(next.start):firstDay,button:next?'Zobraziť najbližší deň programu':'Zobraziť prvý deň programu'};
}
function render(){
 const list=filtered(),groups=new Map();
 const pastCount=filtered(true).filter(e=>past(e)).length;
 $('toggle-past').textContent=showPast?'Skryť skončené':`Zobraziť skončené${pastCount?' ('+pastCount+')':''}`;
 $('toggle-past').setAttribute('aria-pressed',String(showPast));
 $('toggle-past').hidden=!showPast&&!pastCount;
 document.querySelector('.live-toolbar p').textContent=showPast?'Program vrátane skončených podujatí':'Prebiehajúce a nadchádzajúce podujatia';
 document.querySelectorAll('[data-festival]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.festival===$('festival').value)));
 const activeFilters=['type','part','from','to'].filter(id=>$(id).value).length+['upcoming','selected-only','free-only'].filter(id=>$(id).checked).length;
 $('filter-count').textContent=activeFilters?'('+activeFilters+')':'';
 $('quick-reset').hidden=false;list.forEach(e=>{const d=day(e.start);if(!groups.has(d))groups.set(d,[]);groups.get(d).push(e);});
 const opened=[...document.querySelectorAll('.event details[open]')].map(el=>el.closest('.event').dataset.id);
 $('event-list').innerHTML=[...groups].map(([d,items])=>`<section class="event-day" aria-label="${esc(date(items[0].start))}"><div class="day-heading"><h3>${esc(date(items[0].start))}</h3><span>${items.length} PODUJATÍ</span></div>${items.sort((a,b)=>Number(past(a))-Number(past(b))||+new Date(a.start)-+new Date(b.start)).map(card).join('')}</section>`).join('');
 $('results-count').textContent=`${list.length} z ${events.length} podujatí`+($('from').value&&$('to').value&&$('from').value>=$('to').value?' · Čas „do“ musí byť neskôr než „od“.':'');
 opened.forEach(id=>{const el=document.querySelector('.event[data-id="'+id+'"] details');if(el)el.open=true;});
 $('empty').hidden=!!list.length;
 const festivalMessage=!list.length?festivalDayMessage():null;
 $('empty').querySelector('.label').textContent=festivalMessage?'FESTIVAL / TERMÍN':'TENTO ZÁBER JE PRÁZDNY';
 $('empty').querySelector('h3').textContent=festivalMessage?.title||(!showPast&&pastCount?'Tento program už uplynul.':'Nič sa nenašlo.');
 $('empty').querySelector('p:not(.label)').textContent=festivalMessage?.description||(!showPast&&pastCount?'Skončené podujatia sú skryté. Zobrazíš ich tlačidlom „Zobraziť skončené“.':'Skús iný deň, širší čas alebo menej filtrov.');
 $('empty-reset').textContent=festivalMessage?.button||'Zobraziť celý týždeň';
 $('empty-reset').dataset.festivalDay=festivalMessage?.target||'';
 renderDays();updateSelection();if(map)renderMap(list);if(!$('schedule-panel').hidden)renderSchedule(list);
}
function reset(){followDay=false;activeDay='';HTMLFormElement.prototype.reset.call($('filters'));$('origin').value='';$('walk').value='';origin=null;place='';render();}
function navigate(e){const v=venue(e);return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(v?.lat&&v?.lon?`${v.lat},${v.lon}`:[v?.name,v?.address,'Bratislava'].filter(Boolean).join(', '))+'&travelmode=walking';}
function openEvent(id){
 const e=events.find(e=>e.id===id);if(!e){toast('Tento odkaz nepatrí k udalosti v programe.');return;}
 const v=venue(e),others=events.filter(x=>x.id!==e.id&&x.group===e.group),metadata=[e.director,e.country,e.year,e.duration?e.duration+' min film':null].filter(Boolean);
 $('event-detail').innerHTML=`<div class="detail-meta"><span class="tag">${esc(e.festival)}</span><span>${e.types.map(t=>typeNames[t]).join(' / ')}</span></div><h2 id="event-title">${esc(e.title)}</h2>${e.notice?`<p class="warning">${esc(e.notice)}</p>`:''}<div id="detail-live">${liveHTML(e)}</div><div class="detail-facts"><div><p class="label">KEDY</p><p>${esc(date(e.start))}<br><strong>${time(e.start)}${e.end?' — '+time(e.end):''}</strong>${!e.end?`<br><span class="muted">${e.estimatedEnd?'Orientačný koniec ≈ '+time(e.estimatedEnd):'Koniec zatiaľ nepotvrdený'}</span>`:''}</p></div><div><p class="label">KDE</p><p>${esc(v?.name||e.location||'Miesto nepotvrdené')}${e.room?' / '+esc(e.room):''}<br>${esc(v?.address||'Adresa čaká na overenie')}</p></div></div>${metadata.length?`<p>${esc(metadata.join(' · '))}</p>`:''}<p class="detail-description">${esc(e.summary||'Anotácia nebola zverejnená. Podrobnosti nájdeš v oficiálnom programe.')}</p>${e.films?.length?`<h3>Filmy v pásme</h3>${filmsHTML(e)}`:''}${e.guests?`<h3>Hostia & diskusia</h3><p>${esc(e.guests)}</p>`:''}<h3>Vstupné & registrácia</h3><p>${esc(price(e))}${e.registrationNote?'<br>'+esc(e.registrationNote):''}</p>${e.registrationUrl?`<a href="${esc(e.registrationUrl)}" target="_blank" rel="noopener noreferrer">Registrácia / vstupenky ↗︎</a>`:''}${e.endSource?`<p class="muted">Koniec: ${esc(e.endSource)}</p>`:''}<div class="dialog-actions"><button class="solid" data-export="${esc(e.id)}">PRIDAŤ DO MÔJHO KALENDÁRA ↓</button><button data-map="${esc(e.id)}">OTVORIŤ MAPU ↗︎</button><a class="button" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">OFICIÁLNY PROGRAM ↗︎</a><button data-share="${esc(e.id)}">ZDIEĽAŤ UDALOSŤ ↗︎</button><button data-select="${esc(e.id)}" aria-pressed="${selection.has(e.id)}" aria-label="Vybrať: ${esc(e.title)}">${selection.has(e.id)?'✓︎':'+'}</button></div><a href="${esc(navigate(e))}" target="_blank" rel="noopener noreferrer">Navigácia do miesta konania ↗︎</a>${others.length?`<h3>Ďalšie termíny</h3><div class="repeat-list">${others.map(x=>`<a href="#event=${encodeURIComponent(x.id)}">${esc(date(x.start))} · ${time(x.start)}</a>`).join('')}</div>`:''}<p class="detail-source">Organizátor: ${esc(e.organizer||e.festival)}<br>Overené: ${esc(e.checkedAt||model.updatedAt)}<br><a href="${esc(e.evidence||e.url)}" target="_blank" rel="noopener noreferrer">Zdroj termínu ↗︎</a></p>`;
 if(!$('event-dialog').open)$('event-dialog').showModal();
 $('event-dialog').scrollTop=0;
}
function route(){const m=location.hash.match(/^#event=(.+)$/);if(m){try{openEvent(decodeURIComponent(m[1]));}catch{toast('Neplatný odkaz na udalosť.');}}else if($('event-dialog').open)$('event-dialog').close();}
function escapeICS(value){return String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function fold(line){let out='',part='',bytes=0;for(const c of line){const len=new TextEncoder().encode(c).length;if(bytes+len>75){out+=part+'\r\n';part=' ';bytes=1;}part+=c;bytes+=len;}return out+part;}
const utc = value => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function makeICS(list){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DOKU & FILM BA//Program 2026//SK','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:DOKU & FILM / Bratislava 2026','X-WR-TIMEZONE:Europe/Bratislava'];
 list.forEach(e=>{const v=venue(e),desc=[e.summary,e.notice,`Vstupné: ${price(e)}`,e.guests,e.registrationNote,e.films?.map(f=>`${f.title} — ${f.director||'réžia nezverejnená'}${f.duration?' ('+f.duration+' min)':''}`).join('\n'),!e.end?'Koniec nie je potvrdený. '+(e.estimatedEnd?'Čas konca v kalendári je iba orientačný odhad.':''):null,e.endSource?'Koniec podľa: '+e.endSource:null,`Zdroj: ${e.url}`,eventURL(e)].filter(Boolean).join('\n\n');
 lines.push('BEGIN:VEVENT','UID:'+e.uid,'DTSTAMP:'+utc(e.updatedAt||model.updatedAt),'LAST-MODIFIED:'+utc(e.updatedAt||model.updatedAt),'SEQUENCE:'+(e.sequence||0),'DTSTART:'+utc(e.start));if(finish(e))lines.push('DTEND:'+utc(finish(e)));
 lines.push('SUMMARY:'+escapeICS(e.title),'LOCATION:'+escapeICS([v?.name,e.room,v?.address].filter(Boolean).join(', ')||e.location),'DESCRIPTION:'+escapeICS(desc),'URL:'+eventURL(e),'TRANSP:TRANSPARENT','STATUS:'+(e.status==='tentative'?'TENTATIVE':'CONFIRMED'),'END:VEVENT');});
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
function download(list){if(!list.length){toast('Najprv vyber aspoň jedno podujatie pomocou +.');return;}const blob=new Blob([makeICS(list)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=list.length===1?`doku-film-${list[0].id}.ics`:'doku-film-moj-vyber.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast(list.length===1?'Stiahnutá jedna udalosť.':'Stiahnutý tvoj výber: '+list.length+' podujatí.');}
async function copy(text,message){try{await navigator.clipboard.writeText(text);toast(message);}catch{const input=document.createElement('input');input.value=text;document.body.append(input);input.select();try{document.execCommand('copy');toast(message);}catch{toast('Kopírovanie nie je dostupné. Označ a skopíruj adresu ručne.');}input.remove();}}
function subscribe(){$('feed-url').value=FEED;$('apple-feed').href=FEED.replace(/^https?:/,'webcal:');$('calendar-dialog').showModal();}
function showSchedule(){
 $('map-panel').hidden=true;$('schedule-panel').hidden=false;document.body.classList.remove('map-mode');document.body.classList.add('schedule-mode');
 $('view-program').setAttribute('aria-pressed','false');$('view-map').setAttribute('aria-pressed','false');$('view-schedule').setAttribute('aria-pressed','true');renderSchedule(filtered());
}
function renderSchedule(list){
 const positions=new Map([...document.querySelectorAll('[data-schedule-day]')].map(el=>[el.dataset.scheduleDay,{left:el.scrollLeft,top:el.scrollTop}]));
 const days=new Map(),gutter=64,trackWidth=260;
 const labelFor=e=>!finish(e)?time(e.start)+' · koniec neznámy':time(e.start)+' – '+(e.end?'':'≈ ')+time(finish(e));
 const contentFor=e=>`<span class="schedule-time">${esc(labelFor(e))}</span><strong>${esc(e.title)}</strong><span class="schedule-festival">${esc(e.festival)}${running(e)?' · prebieha':''}</span>`;
 // Measure the complete labels at their actual column width before sizing time.
 // One shared scale per day preserves all starts, durations and overlaps.
 const measure=document.createElement('div');measure.setAttribute('aria-hidden','true');measure.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
 measure.innerHTML=list.map(e=>`<button class="schedule-event" data-measure="${esc(e.id)}" style="position:relative;width:${trackWidth-10}px;height:auto">${contentFor(e)}</button>`).join('');document.body.append(measure);
 const labelHeights=new Map([...measure.children].map(el=>[el.dataset.measure,Math.ceil(el.getBoundingClientRect().height)+8]));measure.remove();
 list.forEach(e=>{const d=day(e.start);if(!days.has(d))days.set(d,[]);days.get(d).push(e);});
 $('schedule-content').innerHTML=[...days].map(([d,items])=>{
  const rooms=new Map();let min=1440,max=0;
  const scale=Math.max(1.6,...items.filter(e=>finish(e)).map(e=>(labelHeights.get(e.id)+4)/((+new Date(finish(e))-+new Date(e.start))/60000)));
  const specs=items.map(e=>{
   const start=clockMinutes(time(e.start));
   const end=finish(e)?start+(+new Date(finish(e))-+new Date(e.start))/60000:null;
   // Unknown ends are fixed-height markers, never an invented event duration.
   const markerMinutes=(labelHeights.get(e.id)+4)/scale;
   min=Math.min(min,start);max=Math.max(max,end??start+markerMinutes);
   const key=e.venueId+'|'+(e.room||'');if(!rooms.has(key))rooms.set(key,{key,v:venue(e),room:e.room,items:[],tracks:[]});
   const spec={e,start,end,layoutEnd:end??start+markerMinutes};rooms.get(key).items.push(spec);return spec;
  });
  min=Math.floor(min/60)*60;max=Math.ceil(max/60)*60;const height=(max-min)*scale;
  let left=gutter;const columns=[...rooms.values()].map(room=>{
   room.items.sort((a,b)=>a.start-b.start||a.layoutEnd-b.layoutEnd).forEach(item=>{
    let track=room.tracks.findIndex(end=>end<=item.start);if(track<0)track=room.tracks.length;room.tracks[track]=item.layoutEnd;item.track=track;
   });
   room.trackWidth=trackWidth;room.width=Math.max(1,room.tracks.length)*room.trackWidth;room.left=left;left+=room.width;return room;
  });
  const fmt=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(Math.floor(m%60)).padStart(2,'0')}`;
  const ticks=[],axis=[];for(let m=min;m<=max;m+=30){ticks.push(`<div class="schedule-gridline ${m%60===0?'hour-line':''}" style="top:${(m-min)*scale}px"></div>`);axis.push(`<span class="${m%60===0?'hour-label':''}" style="top:${(m-min)*scale}px">${fmt(m)}</span>`);}
  const nowMin=clockMinutes(time(now())),nowLine=day(now())===d&&nowMin>=min&&nowMin<=max?`<div class="schedule-now" style="top:${(nowMin-min)*scale}px"><span>Teraz ${time(now())}</span></div>`:'';
  return `<section class="schedule-day"><h3>${esc(date(items[0].start))}</h3><div class="schedule-scroll" data-schedule-day="${d}" role="region" tabindex="0" aria-label="Časová os: ${esc(date(items[0].start))}"><div class="schedule-canvas" style="width:${left}px"><div class="schedule-head" style="grid-template-columns:${gutter}px ${columns.map(r=>r.width+'px').join(' ')}"><div class="schedule-corner">Čas</div>${columns.map(r=>`<div><strong>${esc(r.v?.name||'Miesto nepotvrdené')}</strong>${r.room?`<span>${esc(r.room)}</span>`:''}</div>`).join('')}</div><div class="schedule-body" style="height:${height+20}px">${ticks.join('')}${columns.map(r=>`<div class="schedule-lane" style="left:${r.left}px;width:${r.width}px;height:100%"></div>${r.items.map(({e,start,end,track})=>{
   const duration=end===null?null:end-start,label=duration===null?'Koniec neznámy':e.end?time(e.start)+' – '+time(e.end):time(e.start)+' – ≈ '+time(e.estimatedEnd);
   return `<button class="schedule-event ${!e.end?'uncertain':''} ${end===null?'unknown-end':''} ${running(e)?'schedule-live':''} ${past(e)?'schedule-past':''}" data-open="${esc(e.id)}" style="left:${r.left+track*r.trackWidth+5}px;top:${(start-min)*scale}px;width:${r.trackWidth-10}px;height:${end===null?labelHeights.get(e.id):Math.max(24,duration*scale-4)}px" aria-label="${esc(e.title)}, ${time(e.start)}, ${esc(label)}, ${esc(loc(e))}" title="${esc(e.title)} · ${esc(label)}">${contentFor(e)}</button>`;
  }).join('')}`).join('')}${nowLine}<div class="schedule-axis" aria-label="Časy">${axis.join('')}</div></div></div></div></section>`;
 }).join('');
 document.querySelectorAll('[data-schedule-day]').forEach(el=>{const position=positions.get(el.dataset.scheduleDay);if(position){el.scrollLeft=position.left;el.scrollTop=position.top;}});
}
async function showMap(){
 $('schedule-panel').hidden=true;document.body.classList.remove('schedule-mode');$('view-schedule').setAttribute('aria-pressed','false');
 $('map-panel').hidden=false;document.body.classList.add('map-mode');$('view-program').setAttribute('aria-pressed','false');$('view-map').setAttribute('aria-pressed','true');
 if(!map){
 try{
 if(!mapLoading)mapLoading=new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href='assets/leaflet.css';document.head.append(css);const s=document.createElement('script');s.src='assets/leaflet.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 await mapLoading;
 map=L.map('map',{scrollWheelZoom:false}).setView([48.15,17.115],13);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 markers=L.layerGroup().addTo(map);
 map.on('click',e=>{if(picking){origin={lat:e.latlng.lat,lon:e.latlng.lng};$('origin').value='';picking=false;$('pick-origin').setAttribute('aria-pressed','false');$('map-help').textContent='Východiskový bod nastavený. Peší čas je len odhad zo vzdušnej vzdialenosti, nie skutočná trasa.';render();}});
 map.eachLayer(layer=>{if(layer instanceof L.TileLayer)layer.on('tileerror',()=>toast('Mapové podklady sa nenačítali. Miesta a program nájdeš aj v zozname.'));});
 }catch{$('map').textContent='Mapu sa nepodarilo načítať. Program a navigácia sú stále dostupné v zozname.';toast('Mapa je momentálne nedostupná.');return;}
 }
 map.invalidateSize();renderMap(filtered());
}
function showProgram(){$('schedule-panel').hidden=true;document.body.classList.remove('schedule-mode');$('view-schedule').setAttribute('aria-pressed','false');$('map-panel').hidden=true;document.body.classList.remove('map-mode');$('view-program').setAttribute('aria-pressed','true');$('view-map').setAttribute('aria-pressed','false');}
function renderMap(list){
 markers.clearLayers();const groups=venues.map(v=>({v,items:list.filter(e=>e.venueId===v.id)})).filter(g=>g.items.length),points=[];
 groups.forEach(({v,items})=>{if(!v.lat||!v.lon)return;points.push([v.lat,v.lon]);const m=L.marker([v.lat,v.lon],{title:v.name,keyboard:true,icon:L.divIcon({className:'map-marker',html:String(items.length),iconSize:[32,32],iconAnchor:[16,16]})}).addTo(markers);m.on('click',()=>showPlace(v.id,list));m.bindTooltip(v.name,{direction:'top'});});
 if($('venue-list'))$('venue-list').innerHTML=groups.map(({v,items})=>`<button class="venue-item" data-place="${esc(v.id)}">${esc(v.name)}<span>${items.length} podujatí${walkMinutes(v)!==null?' · ≈ '+walkMinutes(v)+' min pešo':''}</span></button>`).join('');
 if(originMarker)originMarker.remove();if(origin)originMarker=L.marker([origin.lat,origin.lon],{icon:L.divIcon({className:'origin-marker',iconSize:[18,18]}),title:'Tvoj východiskový bod'}).addTo(map);
 if(place)showPlace(place,list);else if(points.length&&!map.hasFitted){map.fitBounds(points,{padding:[35,35],maxZoom:14});map.hasFitted=true;}
}
function showPlace(id,list=filtered()){
 place=id;const v=venues.find(x=>x.id===id);if(!v)return;const items=list.filter(e=>e.venueId===id),n=now(),future=items.filter(e=>running(e,n)||+new Date(e.start)>+n);
 $('place-events').innerHTML=`<p class="label">VYBRANÉ MIESTO</p><h3>${esc(v.name)}</h3><p>${esc(v.address)}${walkMinutes(v)!==null?`<br>≈ ${walkMinutes(v)} min pešo (odhad)`:''}</p><p>${items.length} podujatí podľa filtrov${future.length?' · '+future.length+' ešte prebieha alebo začne':''}</p><button class="venue-item" data-all-places>Všetky miesta ←</button>${items.map(e=>`<div class="map-event"><p class="label">${esc(date(e.start))} · ${time(e.start)}${running(e)?' / PREBIEHA':''}</p><button data-open="${esc(e.id)}">${esc(e.title)}</button><p>${esc([e.room,price(e)].filter(Boolean).join(' · '))}</p>${liveHTML(e)}</div>`).join('')||'<p>Pre toto miesto a filtre nemáme žiadne podujatie.</p>'}`;
 if(map&&v.lat&&v.lon)map.setView([v.lat,v.lon],Math.max(14,map.getZoom()));
}
function allPlaces(){place='';$('place-events').innerHTML='<p class="label">MIESTA NA MAPE</p><h3>Čo sa hrá za rohom?</h3><p>Vyber miesto. Filtre nad mapou platia aj pre tento program.</p><div id="venue-list"></div>';renderMap(filtered());}
async function init(){
 try{const response=await fetch('data/program.json');if(!response.ok)throw new Error('HTTP '+response.status);model=await response.json();events=model.events.sort((a,b)=>+new Date(a.start)-+new Date(b.start));venues=model.venues;
 selection=new Set([...selection].filter(id=>events.some(e=>e.id===id)));
 events.forEach(e=>{e.searchText=norm([e.title,e.director,e.summary,loc(e),venue(e)?.address,...(e.films||[]).flatMap(f=>[f.title,f.director,f.summary])].join(' '));});
 const today=day(now());if(today<'2026-10-19')activeDay='';else if(today<='2026-10-25')activeDay=today;
 $('festival').innerHTML+=[...new Set(events.flatMap(e=>[e.festival,...(e.programmes||[])]))].map(f=>`<option>${esc(f)}</option>`).join('');
 $('origin').innerHTML+=venues.filter(v=>v.lat&&v.lon).map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
 $('venue-options').innerHTML=venues.map(v=>`<option value="${esc(v.name)}">${esc(v.address)}</option>`).join('');
 $('updated').textContent='Posledná aktualizácia: '+longDate(model.updatedAt);
 lastDay=day(now());render();updatePulse();route();setInterval(tickLive,30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)tickLive();});window.addEventListener('focus',tickLive);
 }catch(error){$('results-count').textContent='Program sa nepodarilo načítať. Skús obnoviť stránku.';$('event-list').innerHTML='<p><a href="program.ics">Stiahnuť program ako kalendár</a> · <a href="audit.md">Textový audit</a></p>';$('phase').textContent='Program je dočasne nedostupný.';console.error('Program loading failed',error);}
}
async function tickLive(){
 if(!model)return;
 const today=day(now());if(followDay&&today!==lastDay){activeDay=today>='2026-10-19'&&today<='2026-10-25'?today:'';lastDay=today;}
 updatePulse();
 // Do not replace a focused control while somebody is reading or choosing a day.
 const focused=document.activeElement,editing=focused&&['INPUT','SELECT'].includes(focused.tagName);
 if(!editing)render();
 const match=location.hash.match(/^#event=(.+)$/);if(match&&$('event-dialog').open){const e=events.find(e=>e.id===decodeURIComponent(match[1]));if(e&&$('detail-live'))$('detail-live').innerHTML=liveHTML(e);}
 if(Date.now()-lastRefresh<300000)return;lastRefresh=Date.now();
 try{const response=await fetch('data/program.json',{cache:'no-cache'});if(!response.ok)return;const fresh=await response.json();if(fresh.updatedAt!==model.updatedAt){model=fresh;venues=fresh.venues;events=fresh.events.sort((a,b)=>+new Date(a.start)-+new Date(b.start));events.forEach(e=>{e.searchText=norm([e.title,e.director,e.summary,loc(e),venue(e)?.address,...(e.films||[]).flatMap(f=>[f.title,f.director,f.summary])].join(' '));});$('updated').textContent='Posledná aktualizácia: '+longDate(model.updatedAt);if(!editing)render();updatePulse();toast('Program bol aktualizovaný.');}}
 catch{/* Keep the last successfully loaded programme when offline. */}
}
$('filters').addEventListener('submit',e=>e.preventDefault());$('filters').addEventListener('input',render);$('filters').addEventListener('change',render);
$('days').addEventListener('change',e=>{if(e.target.id==='day-select'){followDay=false;activeDay=e.target.value;render();}});
$('days').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){followDay=false;activeDay=b.dataset.day;render();}});
document.querySelector('.festival-picker').addEventListener('click',e=>{const button=e.target.closest('[data-festival]');if(button){$('festival').value=button.dataset.festival;render();}});
$('toggle-past').onclick=()=>{showPast=!showPast;render();};
$('quick-reset').onclick=()=>{showPast=true;reset();};$('reset').onclick=reset;$('empty-reset').onclick=()=>{
 const target=$('empty-reset').dataset.festivalDay;if(!target){reset();return;}
 const festival=$('festival').value;HTMLFormElement.prototype.reset.call($('filters'));$('festival').value=festival;followDay=false;activeDay=target;showPast=target<day(now());origin=null;place='';$('origin').value='';$('walk').value='';render();
};
$('view-schedule').onclick=showSchedule;$('view-map').onclick=showMap;$('view-program').onclick=showProgram;

$('subscribe-main').onclick=subscribe;$('copy-feed').onclick=()=>copy(FEED,'Odkaz na odber je skopírovaný.');
$('feed-url').onclick=e=>e.target.select();
$('next-event').addEventListener('click',()=>{if(day(now())>'2026-10-25'){showPast=true;activeDay='';followDay=false;render();}});
$('master-notice').onclick=()=>{location.hash='event=acko332026';};
$('export-selection').onclick=$('export-main').onclick=()=>download(events.filter(e=>selection.has(e.id)));
$('clear-selection').onclick=()=>{selection.clear();persist();render();};
$('show-selection').onclick=()=>{$('selected-only').checked=true;activeDay='';showProgram();render();$('program').scrollIntoView();};
$('origin').onchange=()=>{const v=venues.find(v=>v.id===$('origin').value);origin=v?{lat:v.lat,lon:v.lon}:null;render();};$('walk').onchange=render;
$('pick-origin').onclick=()=>{picking=!picking;$('pick-origin').setAttribute('aria-pressed',String(picking));$('map-help').textContent=picking?'Klikni alebo ťukni na mapu a nastav svoj východiskový bod.':'Poloha zostáva v prehliadači. Peší čas je orientačný odhad.';};
$('place-search').oninput=()=>{const q=norm($('place-search').value),v=venues.find(v=>norm(v.name)===q||q.length>2&&norm(v.name+' '+v.address).includes(q));if(v)showPlace(v.id);};
$('locate').onclick=()=>{if(!navigator.geolocation){toast('Tento prehliadač polohu nepodporuje. Vyber miesto alebo bod na mape.');return;}$('locate').disabled=true;navigator.geolocation.getCurrentPosition(p=>{origin={lat:p.coords.latitude,lon:p.coords.longitude};$('origin').value='';$('locate').disabled=false;render();if(map)map.setView([origin.lat,origin.lon],14);toast('Poloha použitá iba v tomto prehliadači.');},()=>{$('locate').disabled=false;toast('Poloha nie je dostupná. Vyber východiskové miesto alebo bod na mape.');},{enableHighAccuracy:false,timeout:15000,maximumAge:120000});};
for(const dialog of document.querySelectorAll('dialog')){dialog.querySelector('.close-dialog').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});}
$('event-dialog').addEventListener('close',()=>{if(location.hash.startsWith('#event='))history.replaceState(null,'',location.href.split('#')[0]+'#program');});
window.addEventListener('hashchange',route);
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-open],[data-select],[data-export],[data-map],[data-share],[data-place],[data-all-places]');if(!b)return;
 if(b.dataset.open){const hash='#event='+encodeURIComponent(b.dataset.open);if(location.hash===hash)openEvent(b.dataset.open);else location.hash=hash;}
 else if(b.dataset.select)toggleSelection(b.dataset.select);
 else if(b.dataset.export)download(events.filter(e=>e.id===b.dataset.export));
 else if(b.dataset.map){const e=events.find(e=>e.id===b.dataset.map);$('event-dialog').close();await showMap();showPlace(e.venueId);$('program').scrollIntoView();}
 else if(b.dataset.share){const e=events.find(e=>e.id===b.dataset.share);try{if(navigator.share)await navigator.share({title:e.title,url:eventURL(e)});else await copy(eventURL(e),'Priamy odkaz je skopírovaný.');}catch(error){if(error.name!=='AbortError')await copy(eventURL(e),'Priamy odkaz je skopírovaný.');}}
 else if(b.dataset.place)showPlace(b.dataset.place);
 else if(b.hasAttribute('data-all-places'))allPlaces();
});
init();
})();
