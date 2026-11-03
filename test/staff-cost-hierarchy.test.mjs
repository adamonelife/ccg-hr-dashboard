import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateCostHierarchy} from '../lib/staff-cost-hierarchy.mjs';
const departments=[{id:'landscape',name:'Renamed Department',production_classification:'production'},{id:'sales',name:'Sales',production_classification:'non_production'}];
const row=(id,extras={})=>({employee_id:id,company:'Company A',department_id:'landscape',team:'Team A',employment_status:'Active',current_salary:'100.50',salary_currency:'IDR',...extras});
test('Hierarchy uses independent Department IDs and explicit classification, retaining every unassigned cost',()=>{
 const result=aggregateCostHierarchy([row('1'),row('2',{team:null}),row('3',{department_id:'sales'}),row('4',{department_id:null}),row('5',{company:'Company B',current_salary:null}),row('6',{employment_status:'Resigned'})],departments,[{unit_name:'Team A'}]);
 assert.equal(result.version,2);assert.equal(result.cells.reduce((n,c)=>n+c.headcount,0),5);
 assert.equal(result.cells.reduce((n,c)=>n+c.currencies.reduce((t,a)=>t+a.knownMonthlyGrossSalary,0),0),402);
 assert.equal(result.cells.find(c=>c.department_id==='landscape').production_classification,'production');
 assert.equal(result.cells.find(c=>c.department_id===null).production_classification,null);
 assert.equal(result.cells.find(c=>c.team_id===null).headcount,1);
 assert.equal(result.cells.find(c=>c.company_name==='Company B').missingSalaryCount,1);
 assert.doesNotMatch(JSON.stringify(result),/employee_id|current_salary|full_name|bank|contact/);
});
test('Feed preserves currency, zero salary and rejects duplicate employees',()=>{
 const result=aggregateCostHierarchy([row('1',{current_salary:0}),row('2',{salary_currency:'USD'}),row('3',{salary_currency:null})],departments,[]);
 assert.equal(result.cells[0].salariesRecorded,2);assert.equal(result.cells[0].missingCurrencyCount,1);assert.equal(result.cells[0].currencies.length,2);
 assert.throws(()=>aggregateCostHierarchy([row('1'),row('1')],departments,[]),/Duplicate/);
});
