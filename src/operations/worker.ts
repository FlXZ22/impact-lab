import Anthropic from '@anthropic-ai/sdk';
import type { ReportRepository } from '../repository/types.ts';
import type { Assessor } from './assessor.ts';
/** Durable queue; citizen saves never wait for triage. Failed work requires explicit retry. */
export function createAssessmentWorker(repo:ReportRepository,assessor:Assessor){
  let running:Promise<void>|null=null,stopped=false,timer:ReturnType<typeof setInterval>|null=null;
  async function processOne(){
    const report=await repo.claimAssessment();if(!report)return;
    try{const result=await assessor.assess(report);await repo.finishAssessment(report.id,result,assessor.model,null);}
    catch(error){
      const reason=error instanceof Anthropic.APIError?`Claude indisponibile (HTTP ${error.status??'errore'}). Verifica configurazione o credito e riprova.`:'Valutazione non riuscita. Verifica il servizio AI e la foto, poi riprova.';
      await repo.finishAssessment(report.id,null,assessor.model,reason);
    }
  }
  function tick():Promise<void>{
    if(stopped||!assessor.enabled)return Promise.resolve();if(running)return running;
    running=processOne().catch(()=>console.warn('[operations] Queue unavailable; retrying next tick.')).finally(()=>{running=null;});return running;
  }
  return {tick,start(){if(timer)return;void tick();timer=setInterval(()=>void tick(),2000);timer.unref();},async stop(){stopped=true;if(timer)clearInterval(timer);await running;}};
}
