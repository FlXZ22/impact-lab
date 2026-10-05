import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createStorage } from '../src/storage/index.ts';
import { createApp } from '../src/app.ts';
import { createAssistant } from '../src/assistant.ts';
import { createRouter } from '../src/routing.ts';
import { createAssessmentWorker } from '../src/operations/worker.ts';
import { parseAssessment,parseOperationsPatch,priorityOf,departmentOf,sortReports,type Assessment } from '../src/operations/domain.ts';
import { filterReports } from '../public/officer/model.js';

// Synthetic test fixture only; the production assessor has no fake-response path.
const assessment:Assessment={title:'Ascensore ferroviario guasto',summary:'Accesso al binario impedito.',category:'mobilita',priority:4,reason:'Non è indicato un percorso accessibile alternativo.',department:'trenord_rfi',confidence:.95,location_text:'Milano Centrale',affected_people:['Persone in sedia a rotelle'],missing_info:[]};

test('operations queue, filters, human overrides, status history and failure recovery',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'segnalami-operations-'));
 const storage=await createStorage({driver:'local',sqlitePath:path.join(dir,'test.db'),uploadsDir:path.join(dir,'uploads')});
 const assessor={enabled:true,model:'test-fixture-only',assess:async()=>assessment};
 const worker=createAssessmentWorker(storage.reports,assessor);
 const app=createApp({storage,assistant:createAssistant({apiKey:null,model:'unused'}),transcriber:{enabled:false,transcribe:async()=>''},router:createRouter({baseUrl:null}),assessor});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const send=(url:string,body:unknown,method='POST')=>fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 t.after(async()=>{await worker.stop();await new Promise<void>(resolve=>server.close(()=>resolve()));await storage.reports.close();await rm(dir,{recursive:true,force:true});});
 const created=await(await send('/api/reports',{text:'Ascensore ferroviario guasto a Milano Centrale',latitude:45.4864,longitude:9.2045})).json();
 const id=created.report.id;
 await t.test('citizen save appears in the portal immediately as unassessed',async()=>{
  const data=await(await fetch(base+'/api/operations/reports')).json();assert.equal(data.reports.length,1);assert.equal(data.reports[0].id,id);assert.equal(data.reports[0].ai_state,'pending');assert.equal(data.reports[0].assessment,null);assert.equal('assessment' in created.report,false);
 });
 await t.test('worker persists assessment without changing citizen content',async()=>{
  await worker.tick();const [row]=await storage.reports.listManaged();assert.equal(row?.ai_state,'evaluated');assert.equal(row?.assessment?.department,'trenord_rfi');assert.equal(row?.assessment_model,'test-fixture-only');assert.equal((await storage.reports.findById(id))?.content_text,created.report.content_text);
 });
 await t.test('officer overrides preserve AI recommendation and are resettable',async()=>{
  let response=await send(`/api/operations/reports/${id}`,{priority_override:2,department_override:'comune_di_milano'},'PATCH');assert.equal(response.status,200);let row=await response.json();assert.equal(priorityOf(row),2);assert.equal(departmentOf(row),'comune_di_milano');assert.equal(row.assessment.priority,4);
  response=await send(`/api/operations/reports/${id}`,{priority_override:null,department_override:null},'PATCH');row=await response.json();assert.equal(priorityOf(row),4);assert.equal(departmentOf(row),'trenord_rfi');
 });
 await t.test('status updates share the citizen timeline',async()=>{
  await send(`/api/reports/${id}`,{status:'in_progress'},'PATCH');const timeline=await storage.reports.timelines([id]);assert.equal(timeline.get(id)?.at(-1)?.status,'in_progress');assert.equal((await storage.reports.listManaged())[0]?.status,'in_progress');
 });
 const unlocated=await storage.reports.create({content_text:'Problema non localizzato',latitude:null,longitude:null,image_url:null});
 await t.test('unlocated/unassessed reports are retained and can be filtered',async()=>{
  const rows=sortReports(await storage.reports.listManaged());assert.equal(rows[0]?.id,id);
  const filtered=filterReports(rows,{search:'',category:'',department:'',status:'',priority:'pending',unlocated:true,sort:'priority'});assert.equal(filtered.length,1);assert.equal(filtered[0]?.id,unlocated.id);
 });
 await t.test('atomic claim prevents duplicate work, and failures can be retried',async()=>{
  const claim=await storage.reports.claimAssessment();assert.equal(claim?.id,unlocated.id);assert.equal(await storage.reports.claimAssessment(),null);
  await storage.reports.finishAssessment(unlocated.id,null,'test','Unavailable');assert.equal((await send(`/api/operations/reports/${unlocated.id}/retry`,{})).status,202);await worker.tick();assert.equal((await storage.reports.listManaged()).find(r=>r.id===unlocated.id)?.ai_state,'evaluated');
 });
 await t.test('invalid edits and invalid structured output are rejected',async()=>{
  assert.equal((await send(`/api/operations/reports/${id}`,{priority_override:6},'PATCH')).status,400);
  assert.equal((await send(`/api/operations/reports/${id}`,{department_override:'invented'},'PATCH')).status,400);
  assert.equal((await send(`/api/operations/reports/${id}`,{assessment:{}},'PATCH')).status,400);
  assert.throws(()=>parseOperationsPatch({"priority_override = 5; --":1}));assert.throws(()=>parseAssessment({...assessment,confidence:1.5}));
 });
 await t.test('portal routes and assets work with citizen CSP unchanged',async()=>{
  for(const url of ['/officer','/comune','/officer/portal.js','/officer/model.js','/officer/portal.css','/officer/vendor/leaflet.js','/officer/icons/notes.svg'])assert.equal((await fetch(base+url)).status,200,url);
  const citizen=await fetch(base+'/');assert.doesNotMatch(citizen.headers.get('content-security-policy')||'',/tile.openstreetmap/);
  assert.equal(citizen.headers.get('referrer-policy'),'no-referrer');
  const portal=await fetch(base+'/officer');assert.match(portal.headers.get('content-security-policy')||'',/tile.openstreetmap/);
  assert.equal(portal.headers.get('referrer-policy'),'strict-origin-when-cross-origin');
  assert.equal((await fetch(base+'/comune')).headers.get('referrer-policy'),'strict-origin-when-cross-origin');
 });
 await t.test('portal includes every stored report beyond the citizen list default limit',async()=>{
  for(let i=0;i<55;i++)await storage.reports.create({content_text:`Synthetic issue ${i}`,image_url:null,latitude:null,longitude:null});
  const data=await(await fetch(base+'/api/operations/reports')).json();assert.equal(data.reports.length,57);assert.ok(data.reports.some((r:{id:string})=>r.id===id));
 });
 await t.test('confirmed deletion removes report, photo and timeline without affecting other reports',async()=>{
  const photo=await storage.images.save(Buffer.from('synthetic attachment'));
  const target=await storage.reports.create({content_text:'Disposable deletion test',image_url:photo.url,latitude:45.46,longitude:9.19});
  assert.equal((await send(`/api/operations/reports/${target.id}`,{},'DELETE')).status,400);
  assert.ok(await storage.reports.findById(target.id));
  const response=await send(`/api/operations/reports/${target.id}`,{confirm:true},'DELETE');assert.equal(response.status,200);assert.equal((await response.json()).photo_removed,true);
  assert.equal((await fetch(base+photo.url)).status,404);
  assert.equal((await fetch(base+`/api/reports/${target.id}`)).status,404);
  assert.deepEqual(await(await fetch(base+`/api/reports/progress?ids=${target.id}`)).json(),[]);
  await storage.reports.finishAssessment(target.id,assessment,'late-worker',null);
  assert.equal((await storage.reports.listManaged()).some(r=>r.id===target.id),false);
  assert.ok(await storage.reports.findById(id));
  assert.equal((await send(`/api/operations/reports/${target.id}`,{confirm:true},'DELETE')).status,404);
 });
});
