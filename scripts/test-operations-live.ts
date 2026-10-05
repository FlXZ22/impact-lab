import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadConfig } from '../src/config.ts';
import { createStorage } from '../src/storage/index.ts';
import { createAssessor } from '../src/operations/assessor.ts';
import { createAssessmentWorker } from '../src/operations/worker.ts';
import { priorityOf,sortReports } from '../src/operations/domain.ts';
const config=loadConfig();if(!config.assistant.apiKey){console.error('BLOCKED: ANTHROPIC_API_KEY missing');process.exit(1);}
const dir=await mkdtemp(path.join(tmpdir(),'segnalami-live-operations-'));
const storage=await createStorage({driver:'local',sqlitePath:path.join(dir,'reports.db'),uploadsDir:path.join(dir,'uploads')});
const assessor=createAssessor(config.assistant,storage),worker=createAssessmentWorker(storage.reports,assessor);
try{
 const photo=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#bbb"/><ellipse cx="200" cy="160" rx="90" ry="55" fill="#444"/></svg>')).jpeg().toBuffer();
 const image=await storage.images.save(photo);
 const cases=[
 {text:'L’ascensore della stazione ferroviaria Milano Centrale verso i binari dei treni regionali è guasto. Una persona in sedia a rotelle non può raggiungere il treno; nessun percorso alternativo senza scale è segnalato.',department:'trenord_rfi',image:null},
 {text:'Una buca profonda sul marciapiede pubblico di via Torino 20, Milano, impedisce il passaggio in sedia a rotelle. La foto è un disegno sintetico della buca.',department:'comune_di_milano',image:image.url},
 {text:'Non si riesce a entrare. Non so dove né in quale edificio o servizio.',department:'unknown',image:null}
 ];
 for(const [i,c] of cases.entries()){
  const row=await storage.reports.create({content_text:c.text,image_url:c.image,latitude:i<2?45.4642:null,longitude:i<2?9.19:null});
  await worker.tick();const report=(await storage.reports.listManaged()).find(r=>r.id===row.id);assert.ok(report);assert.equal(report.ai_state,'evaluated',report.ai_error||'no assessment');assert.equal(report.assessment?.department,c.department);
  if(i===2)assert.ok((report.assessment?.missing_info.length??0)>0||Number(report.assessment?.confidence)<.7);
  console.log(`PASS real Claude ${i+1}: ${c.department}, priority ${report.assessment?.priority}, confidence ${report.assessment?.confidence}`);
 }
 const rows=sortReports(await storage.reports.listManaged());assert.ok(rows.every((r,i)=>i===0||(priorityOf(rows[i-1]!)??0)>=(priorityOf(r)??0)));
 const row=rows[0]!;await storage.reports.updateOperations(row.id,{priority_override:1,department_override:'local_police'});await storage.reports.updateStatus(row.id,'resolved');const updated=(await storage.reports.listManaged()).find(r=>r.id===row.id)!;assert.equal(priorityOf(updated),1);assert.equal(updated.status,'resolved');assert.ok(updated.assessment);console.log('PASS persistence, ranking, officer assignment/priority/status; AI assessment preserved');
}catch(error){console.error(error instanceof Error?error.message:'Live verification failed');process.exitCode=1;}
finally{await worker.stop();await storage.reports.close();await rm(dir,{recursive:true,force:true});}
