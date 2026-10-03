import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createApp } from '../server.js';

const dir = await mkdtemp(path.join(tmpdir(), 'segnalami-live-'));
const app = await createApp({ file: path.join(dir, 'reports.json') });
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
async function request(route, body, method='POST') {
 const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw new Error(`${result.code}: ${result.message||response.status}`);return result;
}
let passed=0,blocked=0;
try {
 for (const flow of ['text', 'photo']) {
  if(!process.env.ANTHROPIC_API_KEY?.trim()){console.log(`BLOCKED ${flow}: ANTHROPIC_API_KEY is missing; no fabricated response.`);blocked++;continue;}
  const body=flow==='text'?{text:'L’ascensore della stazione ferroviaria Milano Centrale verso i binari è guasto. Non c’è un’alternativa senza scale e una persona in sedia a rotelle non può raggiungere il treno.',address:'Stazione ferroviaria Milano Centrale',language:'it'}:{text:'A deep pothole blocks the public pavement near 20 Via Torino, Milan. It prevents wheelchair passage. The attached image is a synthetic illustration of the surface.',address:'Via Torino 20, Milano',language:'en'};
  if(flow==='photo'){const image=await sharp(Buffer.from('<svg width="500" height="300"><rect width="500" height="300" fill="#bbb"/><ellipse cx="250" cy="150" rx="120" ry="70" fill="#444"/><path d="M80 150L150 155M370 150L450 190" stroke="#333" stroke-width="6"/></svg>')).png().toBuffer();body.image={media_type:'image/png',data:image.toString('base64')};}
  const draft=await request('/api/prepare',{...body,privacy_confirmed:true});assert.equal(draft.report.competence,flow==='text'?'trenord_rfi':'comune_di_milano');assert.equal(draft.needs_clarification,false);
  const saved=await request('/api/reports',{token:draft.token,report:draft.report,confirmed:true});assert.ok(saved.id);const reports=await request('/api/reports',undefined,'GET');assert.ok(reports.some(r=>r.id===saved.id));console.log(`PASS ${flow}: real Claude → structured review → privacy check → local officer queue`);passed++;
 }
 const updated=await request('/api/reports/seed-02/urgency',{score:5},'PATCH');assert.equal(updated.officer_override.score,5);const filtered=await request('/api/reports?competence=comune_di_milano',undefined,'GET');assert.equal(filtered[0].id,'seed-02');console.log('PASS officer: filter → override → urgency sorting → JSON persistence');passed++;
 if(process.env.ANTHROPIC_API_KEY?.trim()){const incomplete=await request('/api/prepare',{text:'The lift does not work. I do not know where or who owns it.',language:'en',privacy_confirmed:true});assert.equal(incomplete.needs_clarification,true);console.log('PASS additional clarification flow: ambiguous input asks follow-up questions');}
 console.log(`Three flows: ${passed} passed, ${blocked} blocked. Speech recognition requires a real browser microphone and is not claimed by this script.`);
 if(blocked)process.exitCode=1;
} catch(error){console.error(`FAIL: ${error.message}`);process.exitCode=1;}
finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
