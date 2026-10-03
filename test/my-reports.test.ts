import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProgress, loadTracked, track } from '../public/js/my-reports.js';

test('citizen tracking removes deleted reports without losing a report submitted during refresh', t => {
  const values = new Map<string,string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)} });
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');});
  const report = { id:'old',content_text:'Synthetic report',image_url:null,latitude:null,longitude:null,status:'open' as const,created_at:new Date().toISOString() };
  track(report);
  track({...report,id:'kept'});
  const requestedIds=loadTracked().map(item=>item.id);
  track({...report,id:'new'});
  const kept=loadTracked().find(item=>item.id==='kept')!;
  applyProgress([kept.progress!],requestedIds);
  assert.deepEqual(loadTracked().map(item=>item.id),['new','kept']);
  applyProgress([],['kept']);
  assert.deepEqual(loadTracked().map(item=>item.id),['new']);
});
