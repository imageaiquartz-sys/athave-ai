/* Offline checks only: no credentials, payments, or live APIs. Run: node tests/v27-static-and-entitlement.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const api=fs.readFileSync(path.join(root,'functions/api/[[path]].js'),'utf8');
const client=fs.readFileSync(path.join(root,'public/manual-app.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'sql/V27-Unlimited-699-Pro-Access.sql'),'utf8');
assert.match(sql,/manual_has_paid_access/);
assert.match(sql,/batch_count>=10/);
assert.doesNotMatch(sql,/m\.used\s*>=\s*m\.upload_cap/);
assert.match(client,/MAX_UPLOADS_PER_BATCH=10/);
assert.doesNotMatch(client,/uploadFiles\.length>entitlement\.remaining/);
assert.match(client,/m-pro-content-locked/);
for(const pathName of ['gallery/version','gallery/changes','gallery/results','file','ai/file','upload']) {
 const tail=api.slice(api.indexOf(`if(route==='${pathName}'`));
 assert.match(tail.slice(0,165),/requirePro\(env,user\)/,`API ${pathName} must deny unpaid requests`);
}
const context=vm.createContext({TextEncoder,Response,Headers,URL,crypto:require('node:crypto').webcrypto,fetch:()=>{throw Error('Unexpected network fetch')}});
vm.runInContext(api.replace('export async function onRequest','async function onRequest').replace("const tbl=(env,method,table,query='',data=null,opts={})=>supa(env,method,'/rest/v1/'+table+query,data,opts);",'/* mock table helper */')+'\n globalThis._test={guestEntitlement,requirePro}',context);
const cases=[
 {name:'unpaid',membership:null,charge:false,grant:false,expect:false},
 {name:'legacy membership without a charge',membership:30,charge:false,grant:false,expect:false},
 {name:'paid month with verified charge',membership:30,charge:true,grant:false,expect:true},
 {name:'ended month',membership:-1,charge:true,grant:false,expect:false},
 {name:'cancelled but still inside paid period',membership:8,charge:true,grant:false,expect:true},
 {name:'admin complimentary',membership:null,charge:false,grant:true,expect:true},
];
(async()=>{
 for(const c of cases){
  const end=days=>new Date(Date.now()+days*86400000).toISOString();
  context.tbl=async (_env,_verb,table)=>{
   if(table==='manual_access_grants')return c.grant?[{customer_id:'u'}]:[];
   if(table==='manual_memberships')return c.membership===null?[]:[{period_start:end(-29),period_end:end(c.membership),used:63,upload_cap:50}];
   if(table==='manual_subscription_charges')return c.charge?[{period_end:end(c.membership??30)}]:[];
   throw Error('Unexpected table '+table);
  };
  const e=await context._test.guestEntitlement({},'u');
  assert.equal(e.active,c.expect,c.name);
  const denied=await context._test.requirePro({}, {id:'u'});
  assert.equal(denied===null,c.expect,c.name+' API protected');
  if(e.active){assert.equal(e.remaining,null,c.name);assert.equal(e.uploadCap,null,c.name)}
 }
 // Test the real upload selection logic without browser / network dependencies.
 const fakeDoc={body:{dataset:{page:'create'}},getElementById(){return null},querySelectorAll(){return []},addEventListener(){},querySelector(){return null}};
 const frontendContext=vm.createContext({document:fakeDoc,window:{},location:{},localStorage:{},setTimeout(){},URL,Date,console});
 const init=client.replace(/\nboot\(\);\s*\n/,'\n');
 vm.runInContext(init+'\n globalThis._check={pickFiles,files:()=>uploadFiles,reset:()=>{uploadFiles=[]}};',frontendContext);
 const sample=()=>({name:'pic.webp',size:1234,type:'image/webp'});
 frontendContext._check.pickFiles(Array.from({length:15},sample));
 assert.equal(frontendContext._check.files().length,10,'only 10 photos can be selected');
 frontendContext._check.reset();
 frontendContext._check.pickFiles(Array.from({length:10},sample));
 assert.equal(frontendContext._check.files().length,10,'another batch accepts 10 uploads');
 console.log('V27 tests passed: 6 billing states, Pro API guards, unlimited quota, 10-photo batches.');
})().catch(e=>{console.error(e);process.exit(1)});
