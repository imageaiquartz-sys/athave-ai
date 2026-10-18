/* Offline regression suite; no live credentials or payment calls. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const api=fs.readFileSync(path.join(root,'functions/api/[[path]].js'),'utf8');
const client=fs.readFileSync(path.join(root,'public/manual-app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/luxury-theme.css'),'utf8');
const sql=fs.readFileSync(path.join(root,'sql/V27-Unlimited-699-Pro-Access.sql'),'utf8');
const html=f=>fs.readFileSync(path.join(root,'public',f),'utf8');
assert.match(api,/const SUBSCRIPTION_AMOUNT=69900/);
assert.match(sql,/manual_has_paid_access/);
assert.match(sql,/batch_count>=10/);
assert.doesNotMatch(sql,/m\.used\s*>=\s*m\.upload_cap/);
assert.match(client,/MAX_UPLOADS_PER_BATCH=10/);
assert.doesNotMatch(css,/m-pro-content-locked\s*>/);
assert.doesNotMatch(client,/main\.classList\.toggle\('m-pro-content-locked'/);
assert.match(client,/main\.classList\.remove\('m-pro-content-locked'\)/);
assert.match(client,/hint\.hidden=active/);
assert.match(client,/if\(page==='gallery'\)await loadCustomerGallery\(true\)/);
assert.match(client,/if\(page==='create'\)await loadUploads\(\)/);
assert.match(client,/if\(page==='gallery'\)\{\s*const root=\$\('galleryGrid'\)/);
assert.match(client,/if\(!proActive\(\)\).*subscribe/i);
for(const r of ['create/index.html','ai/index.html','gallery/index.html','topup/index.html']){
 assert.match(html(r),/<main /,r+' original page kept');
}
assert.match(html('topup/index.html'),/₹699 per month/);
const routeBody=route=>{let start=api.indexOf(`if(route==='${route}'&&method==='`); assert.notEqual(start,-1,route);let next=api.indexOf('\n if(route===',start+10);return api.slice(start,next>start?next:start+250)};
for(const route of ['upload','ai'])assert.match(routeBody(route),/requirePro\(env,user\)/,route+' paid operation');
for(const route of ['gallery/version','gallery/changes','gallery/results','file','ai/file']){
 assert.doesNotMatch(routeBody(route),/requirePro\(env,user\)/,route+' historical data should be accessible to owner');
}
assert.match(api,/id=eq\.\$\{id\}&customer_id=eq\.\$\{user\.id\}&select=source_path,mime_type/,'uploaded files must verify owner');
assert.match(api,/upload_id\}&customer_id=eq\.\$\{user\.id\}/,'result file must verify owner');
assert.match(api,/manual_ai_images',/);
const context=vm.createContext({TextEncoder,Response,Headers,URL,crypto:require('node:crypto').webcrypto,fetch:()=>{throw Error('Unexpected network fetch')}});
vm.runInContext(api.replace('export async function onRequest','async function onRequest').replace("const tbl=(env,method,table,query='',data=null,opts={})=>supa(env,method,'/rest/v1/'+table+query,data,opts);",'/* mock table helper */')+'\n globalThis._test={guestEntitlement,requirePro}',context);
const cases=[
 {name:'unpaid',membership:null,charge:false,grant:false,expect:false},
 {name:'legacy 50 limit no captured charge',membership:30,charge:false,grant:false,expect:false},
 {name:'paid with 50+ uses',membership:30,charge:true,grant:false,expect:true},
 {name:'expired',membership:-1,charge:true,grant:false,expect:false},
 {name:'cancelled but still paid',membership:8,charge:true,grant:false,expect:true},
 {name:'free administrator grant',membership:null,charge:false,grant:true,expect:true}
];
(async()=>{
 for(const c of cases){
  const end=days=>new Date(Date.now()+days*86400000).toISOString();
  context.tbl=async (_env,_verb,table)=>{
   if(table==='manual_access_grants')return c.grant?[{customer_id:'u'}]:[];
   if(table==='manual_memberships')return c.membership===null?[]:[{period_start:end(-29),period_end:end(c.membership),used:80,upload_cap:50}];
   if(table==='manual_subscription_charges')return c.charge?[{period_end:end(c.membership??30)}]:[];
   throw Error('Unexpected table '+table);
  };
  const e=await context._test.guestEntitlement({},'u');
  assert.equal(e.active,c.expect,c.name);
  assert.equal((await context._test.requirePro({}, {id:'u'}))===null,c.expect,c.name+' paid action gate');
  if(e.active)assert.equal(e.remaining,null,c.name+' unlimited');
 }
 const fakeDoc={body:{dataset:{page:'create'}},getElementById(){return null},querySelectorAll(){return []},addEventListener(){},querySelector(){return null}};
 const c=vm.createContext({document:fakeDoc,window:{},location:{},localStorage:{},setTimeout(){},URL,Date,console});
 const init=client.replace(/\nboot\(\);\s*\n/,'\n');
 vm.runInContext(init+'\n globalThis._check={pickFiles,files:()=>uploadFiles,reset:()=>{uploadFiles=[]}};',c);
 const sample=()=>({name:'item.webp',size:1234,type:'image/webp'});
 c._check.pickFiles(Array.from({length:15},sample));
 assert.equal(c._check.files().length,10,'max 10 selection');
 c._check.reset();c._check.pickFiles(Array.from({length:10},sample));assert.equal(c._check.files().length,10,'another fresh 10');
 console.log('V28 passed: public pages, private history, server-paid actions, 6 entitlement scenarios, 10-per-batch, unlimited cycles.');
})().catch(e=>{console.error(e);process.exit(1)});
