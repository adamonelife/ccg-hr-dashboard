import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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
const {EmployeeForm,EmployeeCard,Directory,Leave,LanguageProvider,Button,Input,Select,Badge,Table,Loading,Feedback,PresentationProvider,useFeedback}=await import(pathToFileURL(path.join(temp,'ui.mjs')));
let calls=[];
function apiFixture(session,target='employee'){
 calls=[];
 globalThis.fetch=async(url,opts={})=>{
  calls.push({url,opts});
  let data={};
  if(url.startsWith('/api/employees?id='))data={employee:{employee_id:target,full_name:'Fixture',permission_role:'Employee',current_salary:100},permissions:{editable_fields:editableEmployeeFields(session,target),can_view_compensation:['Administrator','Director','HR','Finance'].includes(session.role)||session.employee_id===target}};
  else if(url.startsWith('/api/employees?nextId'))data={next_id:'CCG-999'};
  else if(url==='/api/employees')data={employees:[{employee_id:'employee',full_name:'Fixture',can_view_detail:true}]};
  else if(url==='/api/org-units')data={departments:[],teams:[]};
  else if(url.startsWith('/api/leave-balances'))data={balances:[]};
  else if(url.startsWith('/api/leave-requests'))data={requests:[]};
  else if(url.startsWith('/api/change-requests'))data={requests:[]};
  else if(url.startsWith('/api/admin/accounts'))data={account:null};
  else if(url.startsWith('/api/skills'))data={skills:[]};
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
 const rows=tree.root.findAllByType('tr').slice(1);assert.equal(rows[0].props.onClick,undefined);assert.equal(rows[1].props.onClick,undefined);assert.equal(rows[0].findAllByType('button').length,0);assert.equal(rows[1].findAllByType('button').length,1);
 await act(async()=>tree.unmount());
});
test('Read profile loads primary data before secondary sections and respects compensation capability',async()=>{
 const session={role:'Team Lead',employee_id:'lead'};apiFixture(session);
 const tree=await render(React.createElement(EmployeeCard,{employeeId:'employee',session,onBack(){},onEdit(){}}));
 assert.equal(calls.length,1);assert(!text(tree.toJSON()).includes('Compensation & history'));
 assert(!tree.root.findAllByType('button').some(b=>text(b)==='Edit employee'));
 assert(!text(tree.toJSON()).includes('100'));
 const skills=tree.root.findAllByProps({role:'tab'}).find(b=>text(b)==='Skills & development');
 await act(async()=>skills.props.onClick());assert(calls.some(c=>c.url.startsWith('/api/skills')));
 await act(async()=>tree.unmount());
});
test('Management compensation is separate from overview and history loads only on request',async()=>{
 const session={role:'HR',employee_id:'hr'};apiFixture(session);
 const tree=await render(React.createElement(EmployeeCard,{employeeId:'employee',session,onBack(){},onEdit(){}}));
 assert(!calls.some(c=>c.url.includes('history')));assert(!text(tree.toJSON()).includes('Current salary'));
 const tab=tree.root.findAllByProps({role:'tab'}).find(b=>text(b)==='Compensation & history');
 await act(async()=>tab.props.onClick());assert(calls.some(c=>c.url.startsWith('/api/salary-history')));
 assert(text(tree.toJSON()).includes('Current salary'));await act(async()=>tree.unmount());
});
test('Edit reports dirty changes and returns saved employee identity',async()=>{
 const session={role:'Administrator',employee_id:null};apiFixture(session);let dirty=false,saved;
 const tree=await render(React.createElement(EmployeeForm,{employeeId:'employee',session,onDirtyChange:v=>dirty=v,onSaved:id=>saved=id,onCancel(){}}));
 const label=tree.root.findAllByType('label').find(l=>text(l)==='Phone');
 await act(async()=>label.findByType('input').props.onChange({target:{value:'fixture'}}));assert.equal(dirty,true);
 await act(async()=>tree.root.findAllByType('form')[0].props.onSubmit({preventDefault(){}}));
 assert.equal(saved,'employee');assert.equal(dirty,false);await act(async()=>tree.unmount());
});
test('Canonical controls retain labels, semantics and semantic status colours',async()=>{
 const tree=await render(React.createElement('div',null,React.createElement(Button,null,'Save'),React.createElement(Input,{label:'Name'}),React.createElement(Select,{label:'Department'}),React.createElement(Badge,{value:'Active'}),React.createElement(Badge,{value:'Pending'}),React.createElement(Table,null),React.createElement(Loading),React.createElement(Feedback,{tone:'error'},'Try again')));
 assert.equal(tree.root.findByType('button').props.type,'button');assert.equal(tree.root.findAllByType('label').length,2);
 assert(tree.root.findAllByType('span').some(n=>n.props.className==='np-badge np-badge-success'));
 assert(tree.root.findAllByType('span').some(n=>n.props.className==='np-badge np-badge-warning'));
 assert.equal(tree.root.findAllByProps({role:'alert'}).length,1);assert.equal(tree.root.findAllByType('table').length,1);
 await act(async()=>tree.unmount());
});
test('Confirmation requires the exact employee ID and uses an accessible modal',async()=>{
 let result;
 function Example(){const {confirm}=useFeedback();return React.createElement(Button,{onClick:async()=>{result=await confirm({title:'Delete fixture',requiredText:'CCG-999'});}},'Open');}
 const tree=await render(React.createElement(PresentationProvider,null,React.createElement(Example)));
 await act(async()=>{tree.root.findByType('button').props.onClick();});
 assert.equal(tree.root.findByProps({role:'dialog'}).props['aria-modal'],'true');
 const remove=()=>tree.root.findAllByType('button').find(b=>text(b)==='Delete');assert.equal(remove().props.disabled,true);
 await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'CCG-999'}}));assert.equal(remove().props.disabled,false);
 await act(async()=>remove().props.onClick());assert.equal(result,true);await act(async()=>tree.unmount());
});
test('Logo geometry and central People tokens remain canonical',async()=>{
 const svg=await readFile('public/brand/nallin-people.svg','utf8'),source=JSON.parse(await readFile('public/brand/SOURCE.json','utf8'));
 const {createHash}=await import('node:crypto');const d=svg.match(/<path[^>]* d="([^"]+)"/)[1];
 assert.equal(createHash('sha256').update(d).digest('hex'),source.pathSha256);assert(svg.includes('translate(414,266)'));assert(svg.includes('#8B5CF6'));
 const css=await readFile('src/index.css','utf8');for(const token of ['--people-primary:','#8B5CF6','--people-tint:','--people-border:','.np-modal','.np-shell','.np-profile-panel','prefers-reduced-motion'])assert(css.toLowerCase().includes(token.toLowerCase()),token);
});
test('Create form uses the existing Active default and returns the new employee ID',async()=>{
 const session={role:'Administrator',employee_id:null};apiFixture(session);let saved;
 const tree=await render(React.createElement(EmployeeForm,{session,onSaved:id=>saved=id,onCancel(){}}));
 const labels=tree.root.findAllByType('label');const name=labels.find(l=>text(l).startsWith('Full name'));
 await act(async()=>name.findByType('input').props.onChange({target:{value:'Isolated fixture'}}));
 await act(async()=>tree.root.findAllByType('form')[0].props.onSubmit({preventDefault(){}}));
 const sent=JSON.parse(calls.find(c=>c.opts.method==='POST').opts.body);assert.equal(sent.employment_status,'Active');assert.equal(sent.permission_role,'Employee');assert.equal(saved,'CCG-999');
 await act(async()=>tree.unmount());
});
test('Technical errors become useful bilingual messages without provider details',async()=>{
 const {safeError}=await import('../src/lib/errors.js');for(const lang of ['en','id']){
  const msg=safeError('Postgres SQL error on Vercel: Google API stack trace',lang);assert(!/SQL|Postgres|Vercel|Google API|stack trace/.test(msg));assert(msg.length>20);
 }
});
after(async()=>{await rm(temp,{recursive:true,force:true});});
