import type { Report } from '../domain/report.ts';
import { AppError } from '../errors.ts';
export const CATEGORIES = ['mobilita','strade_marciapiedi','verde_pubblico','servizi_pubblici','sicurezza','altro'] as const;
export const DEPARTMENTS = ['comune_di_milano','atm','trenord_rfi','green_space_operator','local_police','unknown'] as const;
export type Department = typeof DEPARTMENTS[number];
export interface Assessment {
  title: string; summary: string; category: typeof CATEGORIES[number]; priority: number;
  reason: string; department: Department; confidence: number; location_text: string;
  affected_people: string[]; missing_info: string[];
}
export interface ManagedReport extends Report {
  assessment: Assessment | null; ai_state: 'pending'|'processing'|'evaluated'|'failed';
  ai_error: string|null; assessment_model: string|null; assessed_at: string|null;
  priority_override: number|null; department_override: Department|null; operations_updated_at: string|null;
}
export interface OperationsPatch { priority_override?: number|null; department_override?: Department|null }
export const priorityOf = (r: ManagedReport): number|null => r.priority_override ?? r.assessment?.priority ?? null;
export const departmentOf = (r: ManagedReport): Department => r.department_override ?? r.assessment?.department ?? 'unknown';
export function sortReports(rows: ManagedReport[]): ManagedReport[] {
  return rows.sort((a,b)=>(priorityOf(b)??0)-(priorityOf(a)??0)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
export function parseAssessment(input: unknown): Assessment {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid assessment');
  const r=input as Record<string,unknown>;
  for(const [key,max] of [['title',160],['summary',1200],['reason',1200],['location_text',300]] as const)
    if(typeof r[key]!=='string'||r[key].length>max||(key!=='location_text'&&!r[key].trim()))throw new Error(`Invalid ${key}`);
  if(!CATEGORIES.includes(r.category as Assessment['category'])||!DEPARTMENTS.includes(r.department as Department))throw new Error('Invalid classification');
  if(!Number.isInteger(r.priority)||Number(r.priority)<1||Number(r.priority)>5)throw new Error('Invalid priority');
  if(typeof r.confidence!=='number'||!Number.isFinite(r.confidence)||r.confidence<0||r.confidence>1)throw new Error('Invalid confidence');
  for(const key of ['affected_people','missing_info'])if(!Array.isArray(r[key])||r[key].length>8||!r[key].every((s:unknown)=>typeof s==='string'&&s.length<=300))throw new Error(`Invalid ${key}`);
  return Object.fromEntries(['title','summary','category','priority','reason','department','confidence','location_text','affected_people','missing_info'].map(k=>[k,r[k]])) as unknown as Assessment;
}
export function parseOperationsPatch(input:unknown):OperationsPatch {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError(400,'INVALID_INPUT','Modifiche non valide.');
  const r=input as Record<string,unknown>,keys=Object.keys(r);
  if(!keys.length||keys.some(k=>!['priority_override','department_override'].includes(k)))throw new AppError(400,'INVALID_INPUT','Campi non validi.');
  if('priority_override' in r&&r.priority_override!==null&&(!Number.isInteger(r.priority_override)||Number(r.priority_override)<1||Number(r.priority_override)>5))throw new AppError(400,'INVALID_INPUT','La priorità deve essere tra 1 e 5.');
  if('department_override' in r&&r.department_override!==null&&!DEPARTMENTS.includes(r.department_override as Department))throw new AppError(400,'INVALID_INPUT','Destinatario non valido.');
  return r as OperationsPatch;
}
export function operationsFromRow(row:Record<string,unknown>):Omit<ManagedReport,keyof Report> {
  return {assessment:row.assessment==null?null:parseAssessment(JSON.parse(String(row.assessment))),ai_state:row.ai_state as ManagedReport['ai_state'],ai_error:row.ai_error==null?null:String(row.ai_error),assessment_model:row.assessment_model==null?null:String(row.assessment_model),assessed_at:row.assessed_at==null?null:String(row.assessed_at),priority_override:row.priority_override==null?null:Number(row.priority_override),department_override:row.department_override==null?null:row.department_override as Department,operations_updated_at:row.operations_updated_at==null?null:String(row.operations_updated_at)};
}
