/* Athave AI — separate, server-verified ID-only admin console. No customer OTP. */
const $=id=>document.getElementById(id);
const show=(el,value)=>{if(el)el.hidden=!value};
function notice(message,error=false){const el=$('adminStatus');el.textContent=message;el.classList.toggle('error',error)}
async function api(route, init={}){
 const r=await fetch('/api/admin/'+route,{credentials:'same-origin',cache:'no-store',...init});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error||'Server error ('+r.status+')');return d;
}
const post=(route,body)=>api(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const date=v=>v?new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
const money=v=>'₹'+(Number(v||0)/100).toLocaleString('en-IN',{maximumFractionDigits:0});
function cell(tr,value){const td=document.createElement('td');td.textContent=String(value??'—');tr.append(td);return td}
function renderRows(id,rows,fields){const body=$(id);body.replaceChildren();if(!rows?.length){const tr=document.createElement('tr'),td=cell(tr,'Nothing to show yet.');td.colSpan=fields.length;td.className='admin-empty';body.append(tr);return}
 for(const item of rows){const tr=document.createElement('tr');for(const fn of fields)cell(tr,fn(item));body.append(tr)}
}
let usersOffset=0,paymentsOffset=0;
async function loadTable(which,more=false){const users=which==='users';const offset=more?(users?usersOffset:paymentsOffset):0;
 const data=await api(which+'?offset='+offset);const rows=data.items||[];
 const body=$(users?'adminUsersBody':'adminPaymentsBody');if(!more)body.replaceChildren();
 for(const row of rows){const tr=document.createElement('tr');const values=users?[row.name,'+'+row.phone,row.balance??0,row.used??0,date(row.created_at)]:[money(row.amount_paise),row.plan,row.credits,row.status,date(row.created_at),row.gateway_order_id];for(const v of values)cell(tr,v);body.append(tr)}
 if(!body.children.length)renderRows(body.id,[],Array(users?5:6).fill(()=>''));
 if(users)usersOffset=offset+rows.length;else paymentsOffset=offset+rows.length;
 show($(users?'adminMoreUsers':'adminMorePayments'),rows.length===50);
}
async function loadAdmin(){
 notice('Loading dashboard…');
 try{
  const [stats,codes]=await Promise.all([api('overview'),api('codes')]);
  $('adminTotalUsers').textContent=stats.users??0;$('adminRevenue').textContent=money(stats.revenue_paise);$('adminTopups').textContent=stats.paid_orders??0;$('adminRedemptions').textContent=stats.redemptions??0;
  const body=$('adminCodesBody');body.replaceChildren();
  for(const r of codes.items||[]){const tr=document.createElement('tr');for(const v of [r.label,r.credits+' images',r.uses+'/'+r.max_uses,r.active?'Active':'Disabled',date(r.expires_at),date(r.created_at)])cell(tr,v);
   const action=cell(tr,'');if(r.active){const btn=document.createElement('button');btn.className='admin-disable';btn.textContent='Disable';btn.type='button';btn.onclick=async()=>{if(!confirm('Disable this code?'))return;btn.disabled=true;try{await post('codes/disable',{id:r.id});await loadAdmin()}catch(e){notice(e.message,true)}finally{btn.disabled=false}};action.append(btn)}body.append(tr)}
  if(!(codes.items||[]).length)renderRows('adminCodesBody',[],Array(7).fill(()=>''));
  await Promise.all([loadTable('users'),loadTable('payments')]);notice('');
 }catch(e){if(/Unlock the admin/.test(e.message)){lockView();return}notice(e.message,true)}
}
function lockView(){show($('adminUnlockPanel'),true);show($('adminDashboard'),false);show($('adminSignOut'),false)}
function dashboardView(){show($('adminUnlockPanel'),false);show($('adminDashboard'),true);show($('adminSignOut'),true);loadAdmin()}
$('adminUnlockForm').onsubmit=async e=>{e.preventDefault();const id=$('adminAccessId').value.trim(),button=e.currentTarget.querySelector('button');button.disabled=true;$('adminUnlockMessage').textContent='Checking ID…';
 try{await post('login',{id});$('adminAccessId').value='';$('adminUnlockMessage').textContent='';dashboardView()}catch(e){$('adminUnlockMessage').textContent=e.message}finally{button.disabled=false}
};
$('adminSignOut').onclick=async()=>{try{await post('logout',{})}finally{lockView();notice('Admin session locked.')}};
$('adminMoreUsers').onclick=()=>loadTable('users',true).catch(e=>notice(e.message,true));
$('adminMorePayments').onclick=()=>loadTable('payments',true).catch(e=>notice(e.message,true));
$('adminCreateCode').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
 try{const body={label:$('codeLabel').value.trim(),credits:Number($('codeCredits').value),maxUses:Number($('codeMaxUses').value),expiresDays:Number($('codeDays').value)};
  const reply=await post('codes',body);$('newCodeValue').textContent=reply.code;show($('adminNewCode'),true);e.currentTarget.reset();await loadAdmin();notice('New redeem code created. Copy it now.');
 }catch(e){notice(e.message,true)}finally{btn.disabled=false}
};
$('copyAdminCode').onclick=()=>navigator.clipboard?.writeText($('newCodeValue').textContent).catch(()=>notice('Select and copy the code manually.',true));
(async()=>{try{const status=await api('status');if(!status.configured){lockView();notice('Configure ADMIN_ACCESS_ID and SESSION_SECRET in Cloudflare Production Secrets.',true)}else if(status.unlocked)dashboardView();else{lockView();notice('')}}catch(e){lockView();notice(e.message,true)}})();
