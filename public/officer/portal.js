import { categories,departments,statuses,aiStates,priority,department,title,located,location,filterReports } from './model.js';
/** @typedef {import('../../src/operations/domain.ts').ManagedReport} Report */
/** @typedef {import('./model.js').Filters} Filters */
/** @param {string} id */
const el=id=>{const node=document.getElementById(id);if(!node)throw new Error(`Missing element ${id}`);return node;};
/** @param {string} id */
const input=id=>/** @type {HTMLInputElement} */(el(id));
/** @param {string} id */
const select=id=>/** @type {HTMLSelectElement} */(el(id));
/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [text] @param {string} [className] */
function node(tag,text='',className=''){const n=document.createElement(tag);n.textContent=text;n.className=className;return n;}
/** @param {string} text @param {boolean} [error] */
function feedback(text,error=false){el('feedback').textContent=text;el('feedback').classList.toggle('error',error);}
/** @param {string} url @param {RequestInit} [options] @returns {Promise<any>} */
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(20000)});
 const body=await response.json();if(!response.ok)throw new Error(body.message||'Operazione non riuscita. Riprova.');return body;
}
/** @param {unknown} error */
const errorText=error=>error instanceof Error?error.message:'Connessione non disponibile. Riprova.';
/** @type {Report[]} */let reports=[];
/** @type {Report[]} */let visible=[];
/** @type {string|null} */let selectedId=null;
let loaded=false,refreshing=false,dirty=false,saving=false,detailFingerprint='',listFingerprint='',mapFingerprint='',aiEnabled=false;
let confirmingDelete=false,refreshAgain=false,revision=0;
/** @type {import('leaflet').Map|null} */let map=null;
/** @type {Map<string,import('leaflet').Marker>} */const markers=new Map();
const L=/** @type {typeof import('leaflet')|undefined} */(Reflect.get(window,'L'));
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fullDate=new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short'});
const shortDate=new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
for(const [id,values] of /** @type {Array<[string,Record<string,string>]>} */([['filter-category',categories],['filter-department',departments]]))for(const [key,value] of Object.entries(values)){const option=node('option',value);option.value=key;select(id).append(option);}
/** @returns {Filters} */
function filters(){return {search:input('search').value,category:select('filter-category').value,department:select('filter-department').value,status:select('filter-status').value,priority:select('filter-priority').value,unlocated:input('unlocated').checked,sort:select('sort').value};}
/** @param {number|null} p @param {boolean} [long] */
function priorityText(p,long=false){return p===null?'Da valutare':`${long?'Priorità ': 'P'}${p}${p>=4?' · Alta':''}`;}
function updateSummary(){
 el('count-all').textContent=String(reports.length);el('count-urgent').textContent=String(reports.filter(r=>r.status!=='resolved'&&(priority(r)??0)>=4).length);el('count-active').textContent=String(reports.filter(r=>r.status==='in_progress').length);el('count-pending').textContent=String(reports.filter(r=>r.ai_state!=='evaluated').length);
 el('visible-count').textContent=String(visible.length);el('unlocated-count').textContent=`${visible.filter(r=>!located(r)).length} senza posizione`;
 el('map-count').textContent=`${visible.filter(located).length} posizioni · ${visible.length} segnalazioni`;
}
function renderList(){
 const fingerprint=JSON.stringify(visible)+selectedId;
 if(fingerprint===listFingerprint)return;listFingerprint=fingerprint;
 const queue=el('queue'),scroll=queue.scrollTop;
 const focusedId=/** @type {HTMLElement|null} */(document.activeElement)?.closest('[data-report-id]')?.getAttribute('data-report-id');
 queue.replaceChildren();
 if(!visible.length){const empty=node('div','','empty-queue');empty.append(node('h3',reports.length?'Nessun risultato con questi filtri.':'In attesa della prima segnalazione.'),node('p',reports.length?'Modifica i filtri o cerca un altro luogo.':'Le segnalazioni inviate dai cittadini compariranno qui. Claude le valuterà automaticamente.'));queue.append(empty);return;}
 for(const r of visible){
  const p=priority(r),button=node('button','','report-item');button.type='button';button.dataset.reportId=r.id;button.setAttribute('aria-pressed',String(selectedId===r.id));button.setAttribute('aria-controls','inspector');
  const meta=node('span','','report-meta');meta.append(node('span',priorityText(p),`priority-tag p${p??0}`));
  const date=node('time',shortDate.format(new Date(r.created_at)));date.dateTime=r.created_at;meta.append(date);
  const bottom=node('span','','report-bottom');bottom.append(node('span',departments[department(r)],'body-label'),node('span',statuses[r.status]));
  button.append(meta,node('span',title(r),'report-title'),node('span',location(r),'report-excerpt'),bottom);
  if(r.ai_state!=='evaluated')button.append(node('span',`Claude · ${aiStates[r.ai_state]}`,'report-ai'));
  button.addEventListener('click',()=>choose(r.id));queue.append(button);
 }
 queue.scrollTop=scroll;
 if(focusedId)(/** @type {HTMLElement|null} */(queue.querySelector(`[data-report-id="${focusedId}"]`)))?.focus({preventScroll:true});
}
function clearDetail(){selectedId=null;dirty=false;confirmingDelete=false;detailFingerprint='';el('inspector').replaceChildren(node('div','Seleziona una segnalazione per vedere i dettagli.','inspector-empty'));}
function render(){
 if(selectedId&&!reports.some(r=>r.id===selectedId)){clearDetail();feedback('La segnalazione è stata eliminata.');el('queue-heading').focus();}
 visible=filterReports(reports,filters());updateSummary();renderList();renderMap();
 if(selectedId){const r=reports.find(r=>r.id===selectedId);if(r&&!dirty&&!saving&&!confirmingDelete&&JSON.stringify(r)!==detailFingerprint)renderDetail(r);}
}
/** @param {string} id */
function choose(id){
 if(saving)return;
 if(dirty){if(id!==selectedId)feedback('Salva o annulla le modifiche in corso prima di scegliere un’altra segnalazione.',true);return;}
 const r=reports.find(r=>r.id===id);if(!r)return;
 selectedId=id;renderList();renderMap();renderDetail(r);
 if(map&&located(r))map.setView([/** @type {number} */(r.latitude),/** @type {number} */(r.longitude)],Math.max(map.getZoom(),15),{animate:!reducedMotion});
 if(matchMedia('(max-width:700px)').matches)el('inspector').scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'start'});
 /** @type {HTMLElement|null} */(el('inspector').querySelector('.detail-title'))?.focus({preventScroll:true});
}
/** @param {Report} r */
function renderDetail(r){
 detailFingerprint=JSON.stringify(r);dirty=false;confirmingDelete=false;
 const template=/** @type {HTMLTemplateElement} */(el('detail-template'));
 const detail=el('inspector');const focused=document.activeElement;const restoreFocus=detail.contains(focused)?(focused?.id?`#${focused.id}`:['detail-title','close-detail','retry-ai','save-assignment','save-status','discard-edits'].filter(name=>focused?.classList.contains(name)).map(name=>`.${name}`)[0]):null;detail.replaceChildren(template.content.cloneNode(true));
 /** @param {string} selector */const q=selector=>{const n=detail.querySelector(selector);if(!n)throw new Error(`Missing ${selector}`);return /** @type {HTMLElement} */(n);};
 const a=r.assessment,p=priority(r);
 q('.report-reference').textContent=`SEGNALAZIONE ${r.id.slice(0,8).toUpperCase()}`;
 q('.priority-tag').textContent=priorityText(p,true);q('.priority-tag').classList.add(`p${p??0}`);
 q('.status-tag').textContent=statuses[r.status];q('.detail-title').textContent=title(r);q('.detail-location').textContent=location(r);q('.detail-date').textContent=`Ricevuta il ${fullDate.format(new Date(r.created_at))}`;
 const photo=/** @type {HTMLImageElement} */(q('.evidence-photo'));
 if(r.image_url){photo.src=r.image_url;photo.hidden=false;photo.addEventListener('error',()=>{photo.hidden=true;q('.detail-date').append(node('span',' · Foto non disponibile'));});}
 q('.original-text').textContent=r.content_text||'Segnalazione tramite foto, senza testo.';
 q('.ai-state').textContent=aiStates[r.ai_state];
 if(a){
  q('.ai-summary').textContent=a.summary;q('.ai-reason').textContent=`Priorità AI ${a.priority}/5. ${a.reason}`;
  const facts=[['Categoria',categories[a.category]],['Destinatario',departments[a.department]],['Confidenza',`${Math.round(a.confidence*100)}%${a.confidence<.7?' · da verificare':''}`],['Impatto',a.affected_people.join(', ')||'Non specificato']];
  for(const [label,value] of facts){const row=node('div');row.append(node('dt',label),node('dd',value));q('.assessment-facts').append(row);}
  const gaps=[...a.missing_info];if(a.confidence<.7&&!gaps.length)gaps.push('Confidenza bassa: verifica categoria e destinatario.');if(!located(r))gaps.push('Coordinate assenti: la segnalazione non appare sulla mappa.');
  if(gaps.length){q('.missing-info').hidden=false;for(const text of gaps)q('.missing-info ul').append(node('li',text));}
 }else{
  q('.ai-summary').textContent=r.ai_state==='failed'?'La valutazione non è disponibile.':r.ai_state==='processing'?'Claude sta analizzando questa segnalazione.':'In coda per la valutazione di Claude.';
  q('.ai-reason').textContent=r.ai_error||(!aiEnabled?'La chiave API deve essere configurata sul server. Nessuna priorità AI è stata assegnata.':'La segnalazione è già salvata. La valutazione apparirà automaticamente.');
 }
 const retry=/** @type {HTMLButtonElement} */(q('.retry-ai'));retry.hidden=r.ai_state!=='failed';retry.disabled=!aiEnabled;retry.addEventListener('click',async()=>{retry.disabled=true;try{await api(`/api/operations/reports/${r.id}/retry`,{method:'POST',body:'{}'});feedback('Segnalazione rimessa in coda per Claude.');await refresh();}catch(error){feedback(errorText(error),true);retry.disabled=false;}});
 const departmentSelect=/** @type {HTMLSelectElement} */(q('#assigned-department'));
 for(const [value,label] of Object.entries(departments)){const option=node('option',label);option.value=value;departmentSelect.append(option);}
 const prioritySelect=/** @type {HTMLSelectElement} */(q('#assigned-priority')),statusSelect=/** @type {HTMLSelectElement} */(q('#assigned-status'));
 prioritySelect.value=r.priority_override===null?'':String(r.priority_override);departmentSelect.value=r.department_override??'';statusSelect.value=r.status;
 const assignedAt=r.operations_updated_at; q('.assignment-date').textContent=assignedAt?`Ultima assegnazione: ${fullDate.format(new Date(assignedAt))}`:'Nessuna modifica dell’operatore.';
 for(const field of [prioritySelect,departmentSelect,statusSelect])field.addEventListener('change',()=>{dirty=true;q('.edit-notice').hidden=false;});
 q('.discard-edits').addEventListener('click',()=>{dirty=false;const current=reports.find(item=>item.id===r.id);if(current)renderDetail(current);feedback('Modifiche non salvate annullate.');});
 q('.close-detail').addEventListener('click',()=>{if(saving)return;if(dirty){feedback('Salva o annulla le modifiche prima di chiudere il dettaglio.',true);return;}clearDetail();renderList();renderMap();el('queue-heading').focus();});
 const deleteButton=q('.delete-report'),confirmation=q('#delete-confirmation');
 deleteButton.addEventListener('click',()=>{if(saving)return;confirmingDelete=true;confirmation.hidden=false;deleteButton.setAttribute('aria-expanded','true');q('.cancel-delete').focus();});
 q('.cancel-delete').addEventListener('click',()=>{if(saving)return;confirmingDelete=false;confirmation.hidden=true;deleteButton.setAttribute('aria-expanded','false');deleteButton.focus();});
 q('.confirm-delete').addEventListener('click',async()=>{
  if(saving)return;saving=true;
  const controls=Array.from(detail.querySelectorAll('button,input,select'));for(const control of controls)/** @type {HTMLButtonElement} */(control).disabled=true;
  try{
   const result=await api(`/api/operations/reports/${r.id}`,{method:'DELETE',body:JSON.stringify({confirm:true})});
   revision++;reports=reports.filter(item=>item.id!==r.id);clearDetail();render();el('queue-heading').focus();
   feedback(result.photo_removed?'Segnalazione eliminata.':'Segnalazione eliminata. La foto non è stata rimossa dall’archivio: contatta il gestore del server.',!result.photo_removed);
  }catch(error){feedback(errorText(error),true);for(const control of controls)/** @type {HTMLButtonElement} */(control).disabled=false;q('.confirm-delete').focus();}
  finally{saving=false;void refresh();}
 });
 q('.assignment-form').addEventListener('submit',async event=>{
  event.preventDefault();if(saving)return;saving=true;const button=/** @type {HTMLButtonElement} */(q('.save-assignment'));button.disabled=true;
  try{await api(`/api/operations/reports/${r.id}`,{method:'PATCH',body:JSON.stringify({priority_override:prioritySelect.value?Number(prioritySelect.value):null,department_override:departmentSelect.value||null})});
   // Keep a separately edited status intact until its own explicit save.
   revision++;dirty=statusSelect.value!==(reports.find(item=>item.id===r.id)?.status??r.status);feedback('Priorità e destinatario salvati. La lista è stata riordinata.');detailFingerprint='';
  }catch(error){feedback(errorText(error),true);}finally{saving=false;button.disabled=false;await refresh();}
 });
 q('.status-form').addEventListener('submit',async event=>{
  event.preventDefault();if(saving)return;saving=true;const button=/** @type {HTMLButtonElement} */(q('.save-status'));button.disabled=true;
  try{await api(`/api/reports/${r.id}`,{method:'PATCH',body:JSON.stringify({status:statusSelect.value})});revision++;const current=reports.find(item=>item.id===r.id)??r;dirty=prioritySelect.value!==(current.priority_override===null?'':String(current.priority_override))||departmentSelect.value!==(current.department_override??'');feedback('Stato aggiornato.');detailFingerprint='';}
  catch(error){feedback(errorText(error),true);}finally{saving=false;button.disabled=false;await refresh();}
 });
 if(restoreFocus)(/** @type {HTMLElement|null} */(detail.querySelector(restoreFocus)))?.focus({preventScroll:true});
}
function initMap(){
 if(!L){el('map-message').hidden=false;el('map-message').textContent='Mappa non disponibile. Usa l’elenco per gestire le segnalazioni.';return;}
 map=L.map('map',{zoomControl:false}).setView([45.4642,9.19],12);
 L.control.zoom({position:'bottomright'}).addTo(map);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
 });
 let tileFailures=0;
 tiles.on('loading',()=>{tileFailures=0;});
 tiles.on('tileerror',()=>{tileFailures++;el('map-message').hidden=false;el('map-message').textContent='La mappa non si è caricata. Controlla la connessione e ricarica la pagina. Elenco e dettagli restano disponibili.';});
 tiles.on('load',()=>{if(tileFailures===0)el('map-message').hidden=true;});
 tiles.addTo(map);
}
function renderMap(){
 if(!map||!L)return;
 const mapped=visible.filter(located);const fingerprint=JSON.stringify(mapped.map(r=>[r.id,r.latitude,r.longitude,priority(r),r.status,r.id===selectedId]));if(fingerprint===mapFingerprint)return;mapFingerprint=fingerprint;const ids=new Set(mapped.map(r=>r.id));
 for(const [id,marker] of markers)if(!ids.has(id)){marker.remove();markers.delete(id);}
 for(const r of mapped){
  const p=priority(r),selected=r.id===selectedId;
  // The marker markup contains only validated numeric priority and fixed CSS classes.
  const icon=L.divIcon({className:`map-report-icon${selected?' selected':''}${r.status==='resolved'?' resolved':''}`,html:`<span class="map-pin level-${p??0}"><b>${p??'?'}</b></span>`,iconSize:[29,29],iconAnchor:[14,30]});
  let marker=markers.get(r.id);
  if(!marker){marker=L.marker([/** @type {number} */(r.latitude),/** @type {number} */(r.longitude)],{icon,keyboard:true,title:title(r),alt:`${title(r)}; ${priorityText(p,true)}`}).addTo(map);marker.on('click',()=>choose(r.id));markers.set(r.id,marker);}else marker.setIcon(icon);
  marker.setZIndexOffset(selected?1000:(p??0)*10);
 }
}
function fitMap(){if(!map||!L)return;const points=visible.filter(located).map(r=>L.latLng(/** @type {number} */(r.latitude),/** @type {number} */(r.longitude)));if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[50,65],maxZoom:15,animate:!reducedMotion});else map.setView([45.4642,9.19],12);}
async function refresh(){
 if(refreshing){refreshAgain=true;return;}refreshing=true;const startedRevision=revision;
 try{const data=await api('/api/operations/reports');if(startedRevision!==revision){refreshAgain=true;return;}reports=data.reports;render();el('connection-text').textContent='Connesso';el('connection-dot').className='connection-dot online';el('sync-time').textContent=`Aggiornato alle ${new Date(data.updated_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}`;if(!loaded){loaded=true;fitMap();}}
 catch(error){el('connection-text').textContent='Non connesso';el('connection-dot').className='connection-dot error';feedback(`${errorText(error)} I dati già caricati restano visibili.`,true);if(!loaded){el('queue').replaceChildren(node('div','Impossibile caricare le segnalazioni. Premi Aggiorna per riprovare.','empty-queue'));}}
 finally{refreshing=false;if(refreshAgain){refreshAgain=false;void refresh();}}
}
for(const id of ['search','filter-category','filter-department','filter-status','filter-priority','sort','unlocated'])el(id).addEventListener(id==='search'?'input':'change',()=>{render();});
/** @param {boolean} show */
function mapView(show){document.querySelector('.workspace')?.classList.toggle('show-map',show);el('view-list').setAttribute('aria-pressed',String(!show));el('view-map').setAttribute('aria-pressed',String(show));if(show)requestAnimationFrame(()=>map?.invalidateSize());}
el('view-list').addEventListener('click',()=>mapView(false));el('view-map').addEventListener('click',()=>mapView(true));
el('rail-list').addEventListener('click',()=>{mapView(false);el('queue-heading').focus();});
el('refresh').addEventListener('click',()=>{feedback('');void refresh();});el('fit-map').addEventListener('click',fitMap);
el('clear-filters').addEventListener('click',()=>{input('search').value='';for(const id of ['filter-category','filter-department','filter-status','filter-priority'])select(id).value='';input('unlocated').checked=false;select('sort').value='priority';render();});
el('help-button').addEventListener('click',()=>{const help=el('portal-help');help.hidden=!help.hidden;el('help-button').setAttribute('aria-expanded',String(!help.hidden));requestAnimationFrame(()=>map?.invalidateSize());});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
initMap();
try{const config=await api('/api/operations/config');aiEnabled=config.ai_enabled;if(!aiEnabled){el('configuration-notice').hidden=false;el('configuration-notice').textContent='Claude non è configurato. Le segnalazioni vengono raccolte; la valutazione AI resta in attesa. Gli operatori possono assegnare una priorità manuale.';}}catch(error){feedback(errorText(error),true);}
await refresh();
setInterval(()=>{if(!document.hidden)void refresh();},8000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
