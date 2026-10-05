/** @typedef {import('../../src/operations/domain.ts').ManagedReport} Report */
export const categories={mobilita:'Mobilità e trasporti',strade_marciapiedi:'Strade e marciapiedi',verde_pubblico:'Verde pubblico',servizi_pubblici:'Servizi pubblici',sicurezza:'Sicurezza',altro:'Altro'};
export const departments={comune_di_milano:'Comune di Milano',atm:'ATM',trenord_rfi:'Trenord / RFI',green_space_operator:'Gestore del verde',local_police:'Polizia locale',unknown:'Da individuare'};
export const statuses={open:'Nuova',received:'Ricevuta',in_progress:'In lavorazione',resolved:'Risolta'};
export const aiStates={pending:'In attesa',processing:'In valutazione',evaluated:'Valutata',failed:'Errore AI'};
/** @param {Report} r */
export const priority=r=>r.priority_override??r.assessment?.priority??null;
/** @param {Report} r */
export const department=r=>r.department_override??r.assessment?.department??'unknown';
/** @param {Report} r */
export const title=r=>r.assessment?.title||r.content_text?.split('\n')[0]?.slice(0,120)||'Segnalazione con foto';
/** @param {Report} r */
export const located=r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&r.latitude!==null&&r.longitude!==null;
/** @param {Report} r */
export const location=r=>r.assessment?.location_text||(located(r)?`${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}`:'Posizione non disponibile');
/** @typedef {{search:string,category:string,department:string,status:string,priority:string,unlocated:boolean,sort:string}} Filters */
/** @param {Report[]} reports @param {Filters} filters */
export function filterReports(reports,filters){
 const query=filters.search.trim().toLocaleLowerCase('it');
 return reports.filter(r=>{
  const p=priority(r);
  return (!query||[r.content_text,r.id,r.assessment?.title,r.assessment?.summary,r.assessment?.location_text].join(' ').toLocaleLowerCase('it').includes(query))
   &&(!filters.category||r.assessment?.category===filters.category)
   &&(!filters.department||department(r)===filters.department)
   &&(!filters.status||r.status===filters.status)
   &&(!filters.unlocated||!located(r))
   &&(!filters.priority||(filters.priority==='high'?p!==null&&p>=4:filters.priority==='low'?p!==null&&p<=2:filters.priority==='pending'?p===null:p===Number(filters.priority)));
 }).sort((a,b)=>filters.sort==='newest'?b.created_at.localeCompare(a.created_at):filters.sort==='oldest'?a.created_at.localeCompare(b.created_at):(priority(b)??0)-(priority(a)??0)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
