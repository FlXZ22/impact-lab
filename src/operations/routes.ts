import { Router } from 'express';
import type { ReportRepository } from '../repository/types.ts';
import type { Assessor } from './assessor.ts';
import { CATEGORIES,DEPARTMENTS,parseOperationsPatch,sortReports } from './domain.ts';
import { AppError } from '../errors.ts';
import { isReportId } from '../domain/validation.ts';
export function operationsRouter(repo:ReportRepository,assessor?:Pick<Assessor,'enabled'|'model'>){
  const router=Router();
  router.get('/config',(_req,res)=>res.json({ai_enabled:assessor?.enabled??false,model:assessor?.model??null,categories:CATEGORIES,departments:DEPARTMENTS}));
  router.get('/reports',async(_req,res)=>res.json({reports:sortReports(await repo.listManaged()),updated_at:new Date().toISOString()}));
  router.patch('/reports/:id',async(req,res)=>{
    if(!isReportId(req.params.id))throw new AppError(404,'NOT_FOUND','Segnalazione non trovata.');
    const report=await repo.updateOperations(req.params.id,parseOperationsPatch(req.body));
    if(!report)throw new AppError(404,'NOT_FOUND','Segnalazione non trovata.');res.json(report);
  });
  router.post('/reports/:id/retry',async(req,res)=>{
    if(!assessor?.enabled)throw new AppError(503,'AI_NOT_CONFIGURED','Configura Claude sul server per avviare la valutazione.');
    if(!isReportId(req.params.id)||!await repo.findById(req.params.id))throw new AppError(404,'NOT_FOUND','Segnalazione non trovata.');
    if(!await repo.retryAssessment(req.params.id))throw new AppError(409,'NOT_RETRYABLE','La segnalazione non è in errore.');res.status(202).json({state:'pending'});
  });return router;
}
