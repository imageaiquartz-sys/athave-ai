/* Athave AI: sectioned private admin dashboard. API grants are checked server-side. */
const $=id=>document.getElementById(id);
let people=[], selectedCustomerId=null, busyDeliver=false, inflight=0, currentAdminTab='overview';
const note=(text='',error=false,target=$('adminNote'))=>{if(!target)return;target.textContent=text;target.classList.toggle('error',error)};
const time=x=>x?new Date(x).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
function busy(label='Loading…',start=true){inflight=Math.max(0,inflight+(start?1:-1));$('adminLoader').hidden=inflight===0;if(start)$('adminLoadingText').textContent=label;}
async function req(path,options={}){
 busy(options.method==='POST'?'Saving changes…':'Loading dashboard…');
 try{const response=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Request failed (HTTP '+response.status+')');return data}
 finally{busy('',false)}
}
const post=(path,body)=>req(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const imageSrc=(kind,id)=>'/api/manual/admin/file?kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id);
function unlocked(yes){$('unlockPanel').hidden=yes;$('adminWorkspace').hidden=!yes;$('adminLock').hidden=!yes;if(yes)changeTab('overview')}
function changeTab(tab){const good=['overview','uploads','history','customers','settings'];if(!good.includes(tab))return;currentAdminTab=tab;
 for(const item of good){const active=item===tab;$('tab-'+item).hidden=!active;const button=document.querySelector('[data-tab="'+item+'"]');button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active))}
 if(tab==='history'||tab==='uploads'){const details=$('customerDetail');$(tab==='history'?'tab-history':'tab-uploads').insertBefore(details,$(tab==='history'?'searchHistory':'customerCards'));if(!details.hidden&&selectedCustomerId&&details.dataset.view!==tab){details.hidden=true;selectedCustomerId=null}}
 const url=new URL(location.href);url.hash=tab==='overview'?'':tab;history.replaceState(null,'',url);
}
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>changeTab(button.dataset.tab);
for(const button of document.querySelectorAll('[data-go]'))button.onclick=()=>changeTab(button.dataset.go);
function renderStats(){const customers=people.length,uploads=people.reduce((n,p)=>n+(p.total||0),0),processing=people.reduce((n,p)=>n+(p.processing||0),0);
 $('statCustomers').textContent=String(customers);$('statUploads').textContent=String(uploads);$('statProcessing').textContent=String(processing);$('statCompleted').textContent=String(uploads-processing);$('tabProcessingCount').textContent=String(processing);$('tabHistoryCount').textContent=String(Math.max(0,uploads-processing));
}
function renderCard(root,c){const card=document.createElement('button');card.type='button';card.className='admin-customer-card';card.setAttribute('aria-label','Open uploads for '+c.display_name);
 const top=document.createElement('div');top.className='admin-customer-top';const avatar=document.createElement('span');avatar.className='m-avatar';const avatarImg=document.createElement('img');avatarImg.src='/assets/account-avatar.svg';avatarImg.alt='';avatarImg.width=45;avatarImg.height=45;avatarImg.setAttribute('aria-hidden','true');avatar.append(avatarImg);
 const desc=document.createElement('div');const title=document.createElement('strong');title.textContent=c.display_name||'Customer';const contact=document.createElement('small');contact.textContent=(c.phone?('+91 '+c.phone.slice(2,7)+' '+c.phone.slice(-5)):c.contact)||'Athave customer';desc.append(title,contact);top.append(avatar,desc);
 const foot=document.createElement('div');foot.className='admin-card-counts';const total=document.createElement('span');total.textContent=(c.total||0)+' uploaded';const pending=document.createElement('strong');pending.className=c.processing?'admin-pending':'admin-clear';pending.textContent=c.processing?c.processing+' processing':'Up to date';foot.append(total,pending);
 if(c.freeAccess){const badge=document.createElement('span');badge.className='admin-free-pill';badge.textContent='Free access';foot.append(badge)}
 card.append(top,foot);card.onclick=()=>openCustomer(c.id,{view:currentAdminTab==='history'?'history':'uploads'});root.append(card);
}
function renderCustomers(){
 const query=$('searchCustomers').value.toLowerCase().trim(),allQuery=$('searchAllCustomers').value.toLowerCase().trim(),historyQuery=$('searchHistory').value.toLowerCase().trim();
 const match=(p,q)=>!q||[p.display_name,p.contact,p.phone,p.id].some(x=>String(x||'').toLowerCase().includes(q));
 const active=people.filter(c=>c.processing>0&&match(c,query)).sort((a,b)=>b.processing-a.processing||b.total-a.total);
 const uploadsRoot=$('customerCards');uploadsRoot.replaceChildren();$('totalCustomerCount').textContent='('+active.length+')';for(const c of active)renderCard(uploadsRoot,c);
 if(!active.length)uploadsRoot.innerHTML='<div class="m-empty">No pending uploads. Delivered orders are in History.</div>';
 const historical=people.filter(c=>c.total>c.processing&&match(c,historyQuery)).sort((a,b)=>(b.total-b.processing)-(a.total-a.processing));
 const histRoot=$('historyCustomerCards');histRoot.replaceChildren();for(const c of historical)renderCard(histRoot,c);if(!historical.length)histRoot.innerHTML='<div class="m-empty">No delivered orders yet.</div>';
 const all=people.filter(c=>match(c,allQuery));const allRoot=$('allCustomerCards');allRoot.replaceChildren();for(const c of all)renderCard(allRoot,c);
 if(!all.length)allRoot.innerHTML='<div class="m-empty">No matching customers.</div>';
}
async function loadCustomers(){const data=await req('manual/admin/customers');people=data.customers||[];renderStats();renderCustomers();note('')}
function linkFor(id,title){const box=document.createElement('span');box.className='admin-link-pair';const preview=document.createElement('a');preview.href=imageSrc('result',id);preview.target='_blank';preview.rel='noopener noreferrer';preview.textContent=title+' ↗';const download=document.createElement('a');download.href=imageSrc('result',id)+'&download=1';download.textContent='Download ↓';download.setAttribute('download','');box.append(preview,download);return box}
function makeUploadRow(upload,customerId){const row=document.createElement('article');row.className='admin-upload-card';
 const image=document.createElement('img');image.loading='lazy';image.src=imageSrc('source',upload.id);image.alt='Original '+upload.filename;
 const right=document.createElement('div');right.className='admin-upload-info';const title=document.createElement('strong');title.textContent=upload.filename;
 const small=document.createElement('small');small.textContent=time(upload.created_at);const badge=document.createElement('span');badge.className='m-badge'+(upload.status==='completed'?' done':'');badge.textContent=upload.status==='completed'?'Completed':'Processing';right.append(title,small,badge);
 const links=document.createElement('div');links.className='admin-file-list';const source=document.createElement('a');source.href=imageSrc('source',upload.id);source.target='_blank';source.rel='noopener noreferrer';source.textContent='View original ↗';links.append(source);const originalDownload=document.createElement('a');originalDownload.href=imageSrc('source',upload.id)+'&download=1';originalDownload.download=upload.filename;originalDownload.textContent='Download original ↓';links.append(originalDownload);
 for(const [i,result] of (upload.deliveries||[]).entries())links.append(linkFor(result.id,'Result '+(i+1)+' ↗'));right.append(links);
 if(upload.status==='completed'){row.append(image,right);return row}
 const form=document.createElement('form');form.className='admin-deliver-form';const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=true;input.required=true;input.className='visually-hidden';input.id='delivery-'+upload.id;
 const chooser=document.createElement('label');chooser.className='admin-custom-file';chooser.htmlFor=input.id;chooser.innerHTML='<span class="file-icon">↑</span><span><strong>Choose finished files</strong><small>One or multiple JPG, PNG, WebP images</small></span>';
 const save=document.createElement('button');save.type='submit';save.className='m-btn m-primary m-small';save.textContent='Deliver files →';const message=document.createElement('p');message.className='admin-deliver-status';message.setAttribute('role','status');
 input.onchange=()=>{chooser.querySelector('small').textContent=input.files.length?(input.files.length+' selected · '+[...input.files].map(f=>f.name).slice(0,2).join(', ')):'One or multiple finished images'};
 form.append(chooser,input,save);form.onsubmit=async e=>{e.preventDefault();if(busyDeliver||!input.files.length)return;const files=[...input.files];busyDeliver=true;save.disabled=true;
  const data=new FormData();data.set('uploadId',upload.id);for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1048576){note('Use JPG, PNG or WebP under 12 MB per image',true,message);busyDeliver=false;save.disabled=false;return}data.append('file',file)}
  if(files.length>8||files.reduce((sum,f)=>sum+f.size,0)>32*1048576){note('Use up to 8 files with 32 MB total',true,message);busyDeliver=false;save.disabled=false;return}
  note('Uploading '+files.length+' finished image'+(files.length===1?'':'s')+'…',false,message);
  try{await req('manual/admin/deliver',{method:'POST',body:data});$('customerDetail').hidden=true;selectedCustomerId=null;await loadCustomers();note(files.length+' finished image'+(files.length===1?'':'s')+' delivered. Moved to History.');}
  catch(ex){note(ex.message,true,message)}finally{busyDeliver=false;save.disabled=false}
 };
 right.append(form,message);row.append(image,right);return row;
}
async function openCustomer(id,{scroll=true,view='uploads'}={}){changeTab(view);selectedCustomerId=id;$('customerDetail').hidden=false;$('customerDetail').dataset.view=view;$('detailName').textContent='Loading customer…';$('detailUploads').replaceChildren();
 try{const info=await req('manual/admin/customer?id='+encodeURIComponent(id));if(id!==selectedCustomerId)return;
 $('detailName').textContent=info.customer.display_name;$('detailContact').textContent=info.customer.contact||people.find(p=>p.id===id)?.phone||'Verified customer workspace';
 const free=!!info.entitlement.freeAccess;const control=$('adminAccessButton');const accessState=$('adminAccessState');control.disabled=false;control.dataset.enabled=String(free);control.textContent=free?'End free access':'Grant free access';control.className='m-btn '+(free?'m-secondary':'m-primary')+' m-small';accessState.textContent=free?'Active — no payment needed. End access at any time.':'Not granted. Paid plans still work normally.';
 const stats=$('detailSummary');stats.replaceChildren();const n=(info.uploads||[]).length;const pending=info.uploads.filter(x=>x.status==='processing').length;
 for(const text of [n+' uploads',pending+' processing',info.entitlement.freeAccess?'Complimentary access':info.entitlement.active?info.entitlement.remaining+' uploads remaining':'Plan inactive']){const tag=document.createElement('span');tag.textContent=text;stats.append(tag)}
 const root=$('detailUploads');root.replaceChildren();const visible=(info.uploads||[]).filter(x=>view==='history'?x.status==='completed':x.status==='processing');$('detailItemsHeading').textContent=view==='history'?'Delivered images · Download files':'Uploads awaiting delivery';for(const item of visible)root.append(makeUploadRow(item,id));if(!visible.length)root.innerHTML='<div class="m-empty">No '+(view==='history'?'delivered':'pending')+' images for this customer.</div>';
 $('adminAccessBar').hidden=view==='history';
 if(scroll)$('customerDetail').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(ex){note(ex.message,true)}
}
$('adminAccessButton').onclick=async()=>{
 const id=selectedCustomerId;if(!id)return;
 const enabled=$('adminAccessButton').dataset.enabled==='true',action=enabled?'revoke':'grant';
 if(enabled&&!confirm('End this customer’s complimentary access? Their paid plan, if any, will remain intact.'))return;
 const btn=$('adminAccessButton');btn.disabled=true;
 try{await post('manual/admin/access',{customerId:id,action});await loadCustomers();await openCustomer(id,{scroll:false,view:'uploads'});note(action==='grant'?'Free access granted.':'Free access ended.');}
 catch(ex){note(ex.message,true);btn.disabled=false}
};
$('closeDetail').onclick=()=>{$('customerDetail').hidden=true;selectedCustomerId=null};
$('refreshAdmin').onclick=async()=>{try{await loadCustomers();if(selectedCustomerId)await openCustomer(selectedCustomerId,{scroll:false,view:currentAdminTab})}catch(e){note(e.message,true)}};
$('refreshOverview').onclick=()=>loadCustomers().catch(e=>note(e.message,true));$('refreshHistory').onclick=()=>loadCustomers().catch(e=>note(e.message,true));
$('searchCustomers').oninput=renderCustomers;$('searchAllCustomers').oninput=renderCustomers;$('searchHistory').oninput=renderCustomers;$('uploadFilter').onchange=renderCustomers;
async function initialize(){const state=await req('admin/status');unlocked(state.unlocked);if(state.unlocked){await loadCustomers();const wanted=location.hash.slice(1);if(['overview','uploads','history','customers','settings'].includes(wanted))changeTab(wanted)}else if(!state.configured)note('Configure ADMIN_ACCESS_ID and SESSION_SECRET in Cloudflare first.',true)}
$('unlockForm').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]'),id=$('adminId').value.trim();b.disabled=true;try{await post('admin/login',{id});$('adminId').value='';unlocked(true);await loadCustomers();note('Dashboard unlocked.')}catch(ex){note(ex.message,true,$('unlockError'))}finally{b.disabled=false}};
$('adminLock').onclick=async()=>{try{await post('admin/logout',{});}catch{}unlocked(false);people=[];selectedCustomerId=null;note('Admin locked.')};
initialize().catch(e=>{unlocked(false);note(e.message,true)});
