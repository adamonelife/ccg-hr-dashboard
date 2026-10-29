import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { editableEmployeeFields } from '../shared/employee-policy.mjs';
const temp=await mkdtemp(path.join(tmpdir(),'people0-ui-'));
// Keep react external and resolve it from the repository rather than the temp folder.
const reactPath=import.meta.resolve('react'),runtimePath=import.meta.resolve('react/jsx-runtime');
await build({entryPoints:['test/ui-entry.jsx'],outfile:path.join(temp,'ui.mjs'),bundle:true,platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'react-instance',setup(b){b.onResolve({filter:/^react$/},()=>({path:new URL(reactPath).pathname,external:true}));b.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:new URL(runtimePath).pathname,external:true}));}}]});
globalThis.window={localStorage:{getItem:()=> 'en',setItem:()=>{}},location:{origin:'https://test.invalid'}};
globalThis.localStorage=window.localStorage;
globalThis.document={documentElement:{lang:"en"}};
const {EmployeeForm,Directory,Leave,LanguageProvider}=await import(pathToFileURL(path.join(temp,'ui.mjs')));
let calls=[];
function apiFixture(session,target='employee'){
 calls=[];
 globalThis.fetch=async(url,opts={})=>{
  calls.push({url,opts});
  let data={};
  if(url.startsWith('/api/employees?id='))data={employee:{employee_id:target,full_name:'Fixture',permission_role:'Employee',current_salary:100},permissions:{editable_fields:editableEmployeeFields(session,target)}};
  else if(url.startsWith('/api/employees?nextId'))data={next_id:'CCG-999'};
  else if(url==='/api/employees')data={employees:[{employee_id:'employee',full_name:'Fixture',can_view_detail:true}]};
  else if(url==='/api/org-units')data={departments:[],teams:[]};
  else if(url.startsWith('/api/leave-balances'))data={balances:[]};
  else if(url.startsWith('/api/leave-requests'))data={requests:[]};
  else if(url.startsWith('/api/change-requests'))data={requests:[]};
  else if(url.startsWith('/api/admin/accounts'))data={account:null};
  else if(url.includes('history'))data={history:[]};
  return {ok:true,json:async()=>data};
 };
}
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
async function render(element){let tree;await act(async()=>{tree=Renderer.create(React.createElement(LanguageProvider,null,element));});return tree;}
for(const role of ['Administrator','Director','HR','Finance','Team Lead','Employee']){
 test(role+' form shows only authorised account/history/delete controls',async()=>{
  const session={role,employee_id:role==='Employee'?'employee':'actor'};apiFixture(session);
  const tree=await render(React.createElement(EmployeeForm,{employeeId:'employee',session,onSaved(){},onCancel(){}}));
  const historyRequests=calls.filter(x=>x.url.includes('history')).map(x=>x.url.split('?')[0]);
  assert.equal(historyRequests.includes('/api/salary-history'),['Administrator','HR','Finance'].includes(role));
  assert.equal(historyRequests.includes('/api/promotion-history'),['Administrator','HR'].includes(role));
  assert.equal(calls.some(x=>x.url.startsWith('/api/admin/accounts')),role==='Administrator');
  assert.equal(tree.root.findAllByType('button').some(b=>text(b).includes('Delete employee')),role==='Administrator');
  const labels=tree.root.findAllByType('label');
  const permissionLabel=labels.find(l=>text(l).includes('Permission role'));
  if(permissionLabel)assert.equal(permissionLabel.findByType('select').props.disabled,role!=='Administrator');
  if(role==='Team Lead')assert.equal(tree.root.findAllByType('button').some(b=>b.props.type==='submit'),false);
  await act(async()=>tree.unmount());
 });
}
test('Employee edit submits only allowed personal fields',async()=>{
 const session={role:'Employee',employee_id:'employee'};apiFixture(session);let saved=false;
 const tree=await render(React.createElement(EmployeeForm,{employeeId:'employee',session,onSaved(){saved=true;},onCancel(){}}));
 await act(async()=>{await tree.root.findAllByType('form')[0].props.onSubmit({preventDefault(){}});});
 const sent=JSON.parse(calls.find(c=>c.opts.method==='PATCH').opts.body);
 assert(!('permission_role'in sent));assert(!('current_salary'in sent));assert(!('full_name'in sent));assert.equal(sent.employee_id,'employee');
 await act(async()=>tree.unmount());
});
test('Fresh half-day form sends startDate as endDate; full-day still needs endDate',async()=>{
 const session={role:'Employee',employee_id:'employee'};apiFixture(session);
 const tree=await render(React.createElement(Leave,{session}));
 let form=tree.root.findAllByType('form')[0];
 let dates=form.findAllByType('input').filter(x=>x.props.type==='date');
 await act(async()=>{dates[0].props.onChange({target:{value:'2026-10-29'}});form.findAllByType('input').find(x=>x.props.required).props.onChange({target:{value:'Fixture leave'}});});
 await act(async()=>{await form.props.onSubmit({preventDefault(){}});});
 assert(!calls.some(c=>c.opts.method==='POST'));
 await act(async()=>{form.findAllByType('input').find(x=>x.props.type==='checkbox').props.onChange({target:{checked:true}});});
 form=tree.root.findAllByType('form')[0];assert.equal(form.findAllByType('input').filter(x=>x.props.type==='date').length,1);
 await act(async()=>{await form.props.onSubmit({preventDefault(){}});});
 const sent=JSON.parse(calls.find(c=>c.opts.method==='POST').opts.body);
 assert.equal(sent.start_date,'2026-10-29');assert.equal(sent.end_date,sent.start_date);assert.equal(sent.half_day,true);
 await act(async()=>tree.unmount());
});
test('Directory drill-down follows server permission, without employee permission_role',async()=>{
 const session={role:'HR',employee_id:'hr'};apiFixture(session);
 globalThis.fetch=async()=>({ok:true,json:async()=>({employees:[{employee_id:'director',full_name:'Restricted',can_view_detail:false},{employee_id:'employee',full_name:'Allowed',can_view_detail:true}]})});
 const tree=await render(React.createElement(Directory,{role:'HR',onOpen(){},onOpenCard(){},onAdd(){}}));
 const rows=tree.root.findAllByType('tr').slice(1);assert.equal(rows[0].props.onClick,undefined);assert.equal(typeof rows[1].props.onClick,'function');
 await act(async()=>tree.unmount());
});
after(async()=>{await rm(temp,{recursive:true,force:true});});
