import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { validReport, needsClarification } from '../lib/schema.js';

test('real local HTTP flows, storage and validation (no simulated AI)', async t => {
 const dir=await mkdtemp(path.join(tmpdir(),'segnalami-test-'));const file=path.join(dir,'reports.json');
 const app=await createApp({file});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const req=(url,body,method='POST',headers={})=>fetch(base+url,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
 await t.test('both pages and static assets are served without secrets',async()=>{for(const url of ['/','/officer','/citizen.js','/styles.css','/vendor/leaflet/leaflet.js'])assert.equal((await fetch(base+url)).status,200);assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/data/reports.json')).status,404);});
 let seeds;
 await t.test('12 schema-valid fictional reports, correct routing, descending urgency',async()=>{seeds=await(await fetch(base+'/api/reports')).json();assert.equal(seeds.length,12);for(const r of seeds){const clean=Object.fromEntries(Object.keys((await import('../lib/schema.js')).reportSchema.properties).map(k=>[k,r[k]]));assert.ok(validReport(clean),JSON.stringify(validReport.errors));assert.equal(r.source,'seed');}assert.equal(seeds.find(r=>r.id==='seed-01').competence,'trenord_rfi');assert.equal(seeds.find(r=>r.id==='seed-02').competence,'comune_di_milano');assert.ok(seeds.every((r,i)=>i===0||seeds[i-1].urgency_score>=r.urgency_score));});
 await t.test('override persists and moves a report to the top of a filtered list',async()=>{assert.equal((await req('/api/reports/seed-02/urgency',{score:5},'PATCH')).status,200);const rows=await(await fetch(base+'/api/reports?competence=comune_di_milano')).json();assert.equal(rows[0].id,'seed-02');assert.ok(rows.every(r=>r.competence==='comune_di_milano'));const stored=JSON.parse(await readFile(file,'utf8')).find(r=>r.id==='seed-02');assert.equal(stored.officer_override.score,5);assert.equal(stored.urgency_score,3);});
 await t.test('concurrent writes preserve both overrides',async()=>{const responses=await Promise.all([req('/api/reports/seed-03/urgency',{score:2},'PATCH'),req('/api/reports/seed-04/urgency',{score:4},'PATCH')]);assert.ok(responses.every(r=>r.status===200));const rows=JSON.parse(await readFile(file,'utf8'));assert.equal(rows.find(r=>r.id==='seed-03').officer_override.score,2);assert.equal(rows.find(r=>r.id==='seed-04').officer_override.score,4);});
 await t.test('invalid scores, missing IDs and untrusted origins are rejected',async()=>{for(const score of [0,6,2.5,'5'])assert.equal((await req('/api/reports/seed-02/urgency',{score},'PATCH')).status,400);assert.equal((await req('/api/reports/missing/urgency',{score:3},'PATCH')).status,404);assert.equal((await req('/api/reports/seed-02/urgency',{score:3},'PATCH',{Origin:'https://example.invalid'})).status,403);});
 await t.test('input privacy and malformed photos fail before any AI call',async()=>{assert.equal((await req('/api/prepare',{text:'A problem',privacy_confirmed:false})).status,400);assert.equal((await req('/api/prepare',{text:'Contact person@example.com',privacy_confirmed:true})).status,422);assert.equal((await req('/api/prepare',{text:'Broken lift',privacy_confirmed:true,image:{media_type:'image/png',data:'YWJj'}})).status,400);});
 await t.test('unprepared packages cannot enter storage',async()=>{assert.equal((await req('/api/reports',{token:'invented',confirmed:true,report:seeds[0]})).status,410);});
 await t.test('uncertainty gates block premature packaging',()=>{const r={confidence:.9,competence:'atm',location_text:'Duomo',missing_info:[]};assert.equal(needsClarification(r),false);for(const patch of [{confidence:.69},{competence:'unknown'},{location_text:''},{missing_info:['Which stop?']}])assert.equal(needsClarification({...r,...patch}),true);});
 await t.test('missing key returns a clear error with no mock fallback',async()=>{const key=process.env.ANTHROPIC_API_KEY;delete process.env.ANTHROPIC_API_KEY;try{const response=await req('/api/prepare',{text:'Broken railway lift in Milano Centrale',privacy_confirmed:true});assert.equal(response.status,503);assert.equal((await response.json()).code,'AI_NOT_CONFIGURED');}finally{if(key!==undefined)process.env.ANTHROPIC_API_KEY=key;}});
});
