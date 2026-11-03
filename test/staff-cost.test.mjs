import {test,mock,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database,sql,queries} from './database.mjs';
mock.module('postgres',{defaultExport:()=>sql});
process.env.DATABASE_URL='postgres://isolated-test/never-connected';
const {aggregateStaffCost,handleStaffCost}=await import('../lib/staff-cost.mjs');
const row=(id,team,salary,currency='IDR',status='Active')=>({employee_id:id,team,current_salary:salary,salary_currency:currency,employment_status:status,full_name:'Never exposed',bni_account_number:'Never exposed'});
const units=[{unit_name:'Landscape',unit_type:'Team'},{unit_name:'Pelago',unit_type:'Team'}];
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(data){this.data=data;return this}});
before(async()=>{await database.exec(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));await database.exec("INSERT INTO org_units(unit_name,unit_type) VALUES ('Landscape','Team'); INSERT INTO employees(employee_id,full_name,team,current_salary,salary_currency) VALUES ('one','Secret name','Landscape',1000000,'IDR')");});
after(async()=>database.close());
test('Only active current gross salaries are summed, with currency and organisation reconciliation',()=>{
 const result=aggregateStaffCost([row('a','Landscape','1000000.00'),row('b','Landscape',2000000),row('c','Landscape',null),row('d','Pelago',100,'USD'),row('e',null,500000),row('f','Landscape',900000,'IDR','Resigned'),row('g','Landscape',900000,'IDR','Terminated')],units);
 assert.equal(result.headcount,5);assert.equal(result.salariesRecorded,4);assert.equal(result.missingSalaryCount,1);
 const landscape=result.organisationUnits.find(g=>g.unit==='Landscape');assert.equal(landscape.headcount,3);assert.equal(landscape.complete,false);assert.equal(landscape.currencies[0].knownMonthlyGrossSalary,3000000);assert.equal(landscape.currencies[0].averageRecordedGrossSalary,1500000);
 assert.equal(result.organisationUnits.find(g=>g.unit===null).currencies[0].knownMonthlyGrossSalary,500000);
 assert.equal(result.currencies.find(c=>c.currency==='IDR').knownMonthlyGrossSalary,3500000);
 assert.equal(result.currencies.find(c=>c.currency==='USD').knownMonthlyGrossSalary,100);
 assert.equal(result.headcount,result.organisationUnits.reduce((n,g)=>n+g.headcount,0));
 assert.doesNotMatch(JSON.stringify(result),/employee_id|full_name|Never exposed|current_salary|bni_account_number/);
});
test('Missing salary is unknown; explicit zero stays recorded; invalid currency never becomes IDR',()=>{
 const r=aggregateStaffCost([row('a','Landscape',''),row('b','Landscape',0),row('c','Landscape',100,''),row('d','Not a real unit',-5)],units);
 assert.equal(r.salariesRecorded,1);assert.equal(r.missingSalaryCount,2);assert.equal(r.missingCurrencyCount,1);assert.equal(r.currencies[0].knownMonthlyGrossSalary,0);
 assert.throws(()=>aggregateStaffCost([row('x',null,10),row('x',null,10)],units),/duplicate/);
});
test('Service feed rejects visitors, dashboard sessions, wrong credentials and cross-environment requests before DB reads',async()=>{
 process.env.OPERATIONS_STAFF_COST_TOKEN='synthetic-test-token-not-production-123456';process.env.VERCEL_ENV='production';
 for(const headers of [{},{cookie:'people_session=not-a-service-token'},{authorization:'Bearer wrong'},{authorization:'Bearer '+process.env.OPERATIONS_STAFF_COST_TOKEN,'x-nallin-environment':'preview'}]){
   const n=queries.length,res=response();await handleStaffCost({method:'GET',headers},res);assert.equal(res.code,401);assert.equal(queries.length,n);
 }
 const res=response(),n=queries.length;await handleStaffCost({method:'GET',headers:{authorization:'Bearer '+process.env.OPERATIONS_STAFF_COST_TOKEN,'x-nallin-environment':'production'}},res);
 assert.equal(res.code,200);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.data.headcount,1);assert(queries.slice(n).every(q=>/^SELECT/.test(q)));assert.doesNotMatch(JSON.stringify(res.data),/Secret name|employee_id|current_salary/);
 const mutation=response();await handleStaffCost({method:'POST',headers:{}},mutation);assert.equal(mutation.code,405);
 const hierarchy=response();await handleStaffCost({method:'GET',query:{version:'2'},headers:{authorization:'Bearer '+process.env.OPERATIONS_STAFF_COST_TOKEN,'x-nallin-environment':'production'}},hierarchy);
 assert.equal(hierarchy.code,200);assert.equal(hierarchy.data.version,2);assert.equal(hierarchy.data.cells[0].department_id,null);assert.equal(hierarchy.data.cells[0].currencies[0].knownMonthlyGrossSalary,1000000);
 assert.doesNotMatch(JSON.stringify(hierarchy.data),/Secret name|employee_id|current_salary/);
 delete process.env.OPERATIONS_STAFF_COST_TOKEN;
 const disabled=response();await handleStaffCost({method:'GET',headers:{}},disabled);assert.equal(disabled.code,503);
});
