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
let selection = new Set();
try { selection = new Set(JSON.parse(localStorage.getItem('df26-selection') || '[]')); } catch {}
const now = () => new Date();
const finish = e => e.end || e.estimatedEnd || null;
const running = (e,n=now()) => e.end && +new Date(e.start)<=+n && +new Date(e.end)>+n;
const recentlyStarted = (e,n=now()) => !e.end && +new Date(e.start)<=+n && +new Date(e.start)>+n-3600000;
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
 document.querySelectorAll('[data-select]').forEach(b=>{const selected=selection.has(b.dataset.select);b.setAttribute('aria-pressed',selected);b.textContent=selected?'✓':'+';b.setAttribute('aria-label',(selected?'Odobrať z výberu: ':'Vybrať: ')+(events.find(e=>e.id===b.dataset.select)?.title||''));});
}
function toggleSelection(id){selection.has(id)?selection.delete(id):selection.add(id);persist();if($('selected-only').checked)render();}
function renderDays(){
 const labels=['PO','UT','ST','ŠT','PI','SO','NE'], today=day(now());
 $('days').innerHTML=`<button type="button" data-day="" class="${!activeDay?'active':''}" aria-pressed="${!activeDay}"><strong>Týždeň</strong><span>19. — 25. 10.</span></button>`+labels.map((label,i)=>{const d=`2026-10-${19+i}`;return `<button type="button" data-day="${d}" class="${activeDay===d?'active ':''}${today===d?'today':''}" aria-pressed="${activeDay===d}"><strong>${19+i}</strong><span>${label} / 10</span></button>`;}).join('');
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
function filtered(){
 const q=norm($('search').value.trim()), f=$('festival').value,t=$('type').value,p=$('part').value,from=$('from').value,to=$('to').value,n=now();
 return events.filter(e=>{
  if(activeDay && day(e.start)!==activeDay)return false;
  if(f && e.festival!==f)return false;
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
function filmsHTML(e){
 if(!e.films?.length)return '';
 return `<ol>${e.films.map(f=>`<li><a href="${esc(f.url||e.url)}" target="_blank" rel="noopener noreferrer">${esc(f.title)}</a><br><span>${esc([f.director, f.year, f.duration?f.duration+' min':null,f.type].filter(Boolean).join(' · '))}</span>${f.summary?`<p>${esc(f.summary)}</p>`:''}</li>`).join('')}</ol>`;
}
function card(e){
 const v=venue(e),walking=walkMinutes(v),end=e.end?`do ${time(e.end)}`:e.estimatedEnd?`≈ ${time(e.estimatedEnd)} (odhad)`:'koniec nepotvrdený';
 const state=running(e)?'PREBIEHA':recentlyStarted(e)?'NEDÁVNO ZAČALO':'';
 return `<article class="event" data-id="${esc(e.id)}"><div class="event-time"><time datetime="${esc(e.start)}">${time(e.start)}</time><small>${esc(end)}</small>${state?`<small><strong>${state}</strong></small>`:''}</div><div class="event-main"><h4><button class="event-title" data-open="${esc(e.id)}">${esc(e.title)}</button></h4><div class="event-meta"><span class="tag">${esc(e.festival)}</span><span>${e.types.map(t=>typeNames[t]).join(' / ')}</span></div>${e.director?`<p class="event-snippet">${esc(e.director)}${e.duration?' · '+e.duration+' min film':''}</p>`:e.summary?`<p class="event-snippet">${esc(e.summary)}</p>`:''}${e.notice?`<p class="warning">${esc(e.notice)}</p>`:''}${e.films?.length?`<details class="block-films"><summary>${e.films.length} filmov v pásme — zobraziť</summary>${filmsHTML(e)}</details>`:''}</div><div class="event-place"><strong>${esc(v?.name||e.location||'Miesto nepotvrdené')}</strong><span>${esc(e.room||v?.address||'')}</span>${walking!==null?`<span>≈ ${walking} min pešo (odhad)</span>`:''}<span class="entry">${esc(price(e))}</span></div><button class="select-event" data-select="${esc(e.id)}" aria-pressed="${selection.has(e.id)}" aria-label="Vybrať: ${esc(e.title)}">${selection.has(e.id)?'✓':'+'}</button></article>`;
}
function render(){
 const list=filtered(),groups=new Map();list.forEach(e=>{const d=day(e.start);if(!groups.has(d))groups.set(d,[]);groups.get(d).push(e);});
 $('event-list').innerHTML=[...groups].map(([d,items])=>`<section class="event-day" aria-label="${esc(date(items[0].start))}"><div class="day-heading"><h3>${esc(date(items[0].start))}</h3><span>${items.length} PODUJATÍ</span></div>${items.map(card).join('')}</section>`).join('');
 $('results-count').textContent=`${list.length} z ${events.length} podujatí`+($('from').value&&$('to').value&&$('from').value>=$('to').value?' · Čas „do“ musí byť neskôr než „od“.':'');
 $('empty').hidden=!!list.length;renderDays();updateSelection();if(map)renderMap(list);
}
function reset(){activeDay='';$('filters').reset();$('origin').value='';$('walk').value='';origin=null;place='';render();}
function navigate(e){const v=venue(e);return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(v?.lat&&v?.lon?`${v.lat},${v.lon}`:[v?.name,v?.address,'Bratislava'].filter(Boolean).join(', '))+'&travelmode=walking';}
function openEvent(id){
 const e=events.find(e=>e.id===id);if(!e){toast('Tento odkaz nepatrí k udalosti v programe.');return;}
 const v=venue(e),others=events.filter(x=>x.id!==e.id&&x.group===e.group),metadata=[e.director,e.country,e.year,e.duration?e.duration+' min film':null].filter(Boolean);
 $('event-detail').innerHTML=`<div class="detail-meta"><span class="tag">${esc(e.festival)}</span><span>${e.types.map(t=>typeNames[t]).join(' / ')}</span></div><h2 id="event-title">${esc(e.title)}</h2>${e.notice?`<p class="warning">${esc(e.notice)}</p>`:''}<div class="detail-facts"><div><p class="label">KEDY</p><p>${esc(date(e.start))}<br><strong>${time(e.start)}${e.end?' — '+time(e.end):''}</strong>${!e.end?`<br><span class="muted">${e.estimatedEnd?'Orientačný koniec ≈ '+time(e.estimatedEnd):'Koniec zatiaľ nepotvrdený'}</span>`:''}</p></div><div><p class="label">KDE</p><p>${esc(v?.name||e.location||'Miesto nepotvrdené')}${e.room?' / '+esc(e.room):''}<br>${esc(v?.address||'Adresa čaká na overenie')}</p></div></div>${metadata.length?`<p>${esc(metadata.join(' · '))}</p>`:''}<p class="detail-description">${esc(e.summary||'Anotácia nebola zverejnená. Podrobnosti nájdeš v oficiálnom programe.')}</p>${e.films?.length?`<h3>Filmy v pásme</h3>${filmsHTML(e)}<p class="muted">Čas začiatku patrí celému pásmu. Začiatky jednotlivých filmov nie sú zverejnené.</p>`:''}${e.guests?`<h3>Hostia & diskusia</h3><p>${esc(e.guests)}</p>`:''}<h3>Vstupné & registrácia</h3><p>${esc(price(e))}${e.registrationNote?'<br>'+esc(e.registrationNote):''}</p>${e.registrationUrl?`<a href="${esc(e.registrationUrl)}" target="_blank" rel="noopener noreferrer">Registrácia / vstupenky ↗</a>`:''}${e.endSource?`<p class="muted">Koniec: ${esc(e.endSource)}</p>`:''}<div class="dialog-actions"><button class="solid" data-export="${esc(e.id)}">PRIDAŤ DO MÔJHO KALENDÁRA ↓</button><button data-map="${esc(e.id)}">OTVORIŤ MAPU ↗</button><a class="button" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">OFICIÁLNY PROGRAM ↗</a><button data-share="${esc(e.id)}">ZDIEĽAŤ UDALOSŤ ↗</button><button data-select="${esc(e.id)}" aria-pressed="${selection.has(e.id)}" aria-label="Vybrať: ${esc(e.title)}">${selection.has(e.id)?'✓':'+'}</button></div><a href="${esc(navigate(e))}" target="_blank" rel="noopener noreferrer">Navigácia do miesta konania ↗</a>${others.length?`<h3>Ďalšie termíny</h3><div class="repeat-list">${others.map(x=>`<a href="#event=${encodeURIComponent(x.id)}">${esc(date(x.start))} · ${time(x.start)}</a>`).join('')}</div>`:''}<p class="detail-source">Organizátor: ${esc(e.organizer||e.festival)}<br>Overené: ${esc(e.checkedAt||model.updatedAt)}<br><a href="${esc(e.evidence||e.url)}" target="_blank" rel="noopener noreferrer">Zdroj termínu ↗</a></p>`;
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
async function showMap(){
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
function showProgram(){$('map-panel').hidden=true;document.body.classList.remove('map-mode');$('view-program').setAttribute('aria-pressed','true');$('view-map').setAttribute('aria-pressed','false');}
function renderMap(list){
 markers.clearLayers();const groups=venues.map(v=>({v,items:list.filter(e=>e.venueId===v.id)})).filter(g=>g.items.length),points=[];
 groups.forEach(({v,items})=>{if(!v.lat||!v.lon)return;points.push([v.lat,v.lon]);const m=L.marker([v.lat,v.lon],{title:v.name,keyboard:true,icon:L.divIcon({className:'map-marker',html:String(items.length),iconSize:[32,32],iconAnchor:[16,16]})}).addTo(markers);m.on('click',()=>showPlace(v.id,list));m.bindTooltip(v.name,{direction:'top'});});
 if($('venue-list'))$('venue-list').innerHTML=groups.map(({v,items})=>`<button class="venue-item" data-place="${esc(v.id)}">${esc(v.name)}<span>${items.length} podujatí${walkMinutes(v)!==null?' · ≈ '+walkMinutes(v)+' min pešo':''}</span></button>`).join('');
 if(originMarker)originMarker.remove();if(origin)originMarker=L.marker([origin.lat,origin.lon],{icon:L.divIcon({className:'origin-marker',iconSize:[18,18]}),title:'Tvoj východiskový bod'}).addTo(map);
 if(place)showPlace(place,list);else if(points.length&&!map.hasFitted){map.fitBounds(points,{padding:[35,35],maxZoom:14});map.hasFitted=true;}
}
function showPlace(id,list=filtered()){
 place=id;const v=venues.find(x=>x.id===id);if(!v)return;const items=list.filter(e=>e.venueId===id),n=now(),future=items.filter(e=>running(e,n)||+new Date(e.start)>+n);
 $('place-events').innerHTML=`<p class="label">VYBRANÉ MIESTO</p><h3>${esc(v.name)}</h3><p>${esc(v.address)}${walkMinutes(v)!==null?`<br>≈ ${walkMinutes(v)} min pešo (odhad)`:''}</p><p>${items.length} podujatí podľa filtrov${future.length?' · '+future.length+' ešte prebieha alebo začne':''}</p><button class="venue-item" data-all-places>Všetky miesta ←</button>${items.map(e=>`<div class="map-event"><p class="label">${esc(date(e.start))} · ${time(e.start)}${running(e)?' / PREBIEHA':''}</p><button data-open="${esc(e.id)}">${esc(e.title)}</button><p>${esc([e.room,price(e)].filter(Boolean).join(' · '))}</p></div>`).join('')||'<p>Pre toto miesto a filtre nemáme žiadne podujatie.</p>'}`;
 if(map&&v.lat&&v.lon)map.setView([v.lat,v.lon],Math.max(14,map.getZoom()));
}
function allPlaces(){place='';$('place-events').innerHTML='<p class="label">MIESTA NA MAPE</p><h3>Čo sa hrá za rohom?</h3><p>Vyber miesto. Filtre nad mapou platia aj pre tento program.</p><div id="venue-list"></div>';renderMap(filtered());}
async function init(){
 try{const response=await fetch('data/program.json');if(!response.ok)throw new Error('HTTP '+response.status);model=await response.json();events=model.events.sort((a,b)=>+new Date(a.start)-+new Date(b.start));venues=model.venues;
 selection=new Set([...selection].filter(id=>events.some(e=>e.id===id)));
 events.forEach(e=>{e.searchText=norm([e.title,e.director,e.summary,loc(e),venue(e)?.address,...(e.films||[]).flatMap(f=>[f.title,f.director,f.summary])].join(' '));});
 const today=day(now());if(today>='2026-10-19'&&today<='2026-10-25')activeDay=today;
 $('festival').innerHTML+=[...new Set(events.map(e=>e.festival))].map(f=>`<option>${esc(f)}</option>`).join('');
 $('origin').innerHTML+=venues.filter(v=>v.lat&&v.lon).map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
 $('venue-options').innerHTML=venues.map(v=>`<option value="${esc(v.name)}">${esc(v.address)}</option>`).join('');
 $('updated').textContent='Posledná aktualizácia: '+longDate(model.updatedAt);
 render();updatePulse();route();setInterval(()=>{updatePulse();render();},60000);
 }catch(error){$('results-count').textContent='Program sa nepodarilo načítať. Skús obnoviť stránku.';$('event-list').innerHTML='<p><a href="program.ics">Stiahnuť program ako kalendár</a> · <a href="audit.md">Textový audit</a></p>';$('phase').textContent='Program je dočasne nedostupný.';console.error('Program loading failed',error);}
}
$('filters').addEventListener('submit',e=>e.preventDefault());$('filters').addEventListener('input',render);$('filters').addEventListener('change',render);
$('days').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){activeDay=b.dataset.day;render();}});
$('reset').onclick=reset;$('empty-reset').onclick=reset;
$('view-map').onclick=showMap;$('view-program').onclick=showProgram;
$('nav-map').onclick=()=>{showMap();$('program').scrollIntoView();};
$('nav-calendar').onclick=subscribe;$('subscribe-main').onclick=subscribe;$('copy-feed').onclick=()=>copy(FEED,'Odkaz na odber je skopírovaný.');
$('feed-url').onclick=e=>e.target.select();
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
