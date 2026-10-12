/* Athave AI: sectioned private admin dashboard. API grants are checked server-side. */
const $=id=>document.getElementById(id);
let people=[], selectedCustomerId=null, busyDeliver=false, inflight=0;
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
function changeTab(tab){const good=['overview','uploads','customers','settings'];if(!good.includes(tab))return;
 for(const item of good){const active=item===tab;$('tab-'+item).hidden=!active;const button=document.querySelector('[data-tab="'+item+'"]');button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active))}
 const url=new URL(location.href);url.hash=tab==='overview'?'':tab;history.replaceState(null,'',url);
}
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>changeTab(button.dataset.tab);
for(const button of document.querySelectorAll('[data-go]'))button.onclick=()=>changeTab(button.dataset.go);
function renderStats(){const customers=people.length,uploads=people.reduce((n,p)=>n+(p.total||0),0),processing=people.reduce((n,p)=>n+(p.processing||0),0);
 $('statCustomers').textContent=String(customers);$('statUploads').textContent=String(uploads);$('statProcessing').textContent=String(processing);$('statCompleted').textContent=String(uploads-processing);$('tabProcessingCount').textContent=String(processing);
}
function renderCard(root,c){const card=document.createElement('button');card.type='button';card.className='admin-customer-card';card.setAttribute('aria-label','Open uploads for '+c.display_name);
 const top=document.createElement('div');top.className='admin-customer-top';const avatar=document.createElement('span');avatar.className='m-avatar';const avatarImg=document.createElement('img');avatarImg.src='/assets/account-avatar.svg';avatarImg.alt='';avatarImg.width=30;avatarImg.height=30;avatarImg.setAttribute('aria-hidden','true');avatar.append(avatarImg);
 const desc=document.createElement('div');const title=document.createElement('strong');title.textContent=c.display_name||'Customer';const contact=document.createElement('small');contact.textContent=c.contact||'Athave customer';desc.append(title,contact);top.append(avatar,desc);
 const foot=document.createElement('div');foot.className='admin-card-counts';const total=document.createElement('span');total.textContent=(c.total||0)+' uploaded';const pending=document.createElement('strong');pending.className=c.processing?'admin-pending':'admin-clear';pending.textContent=c.processing?c.processing+' processing':'Up to date';foot.append(total,pending);
 card.append(top,foot);card.onclick=()=>openCustomer(c.id);root.append(card);
}
function renderCustomers(){
 const query=$('searchCustomers').value.toLowerCase().trim(),allQuery=$('searchAllCustomers').value.toLowerCase().trim(),filter=$('uploadFilter').value;
 const match=(p,q)=>!q||[p.display_name,p.contact,p.id].some(x=>String(x||'').toLowerCase().includes(q));
 const active=people.filter(c=>c.total>0&&match(c,query)&&(filter==='pending'?c.processing>0:filter==='completed'?c.total>c.processing:true)).sort((a,b)=>b.processing-a.processing||b.total-a.total);
 const uploadsRoot=$('customerCards');uploadsRoot.replaceChildren();$('totalCustomerCount').textContent='('+active.length+')';for(const c of active)renderCard(uploadsRoot,c);
 if(!active.length)uploadsRoot.innerHTML='<div class="m-empty">No matching upload orders.</div>';
 const all=people.filter(c=>match(c,allQuery));const allRoot=$('allCustomerCards');allRoot.replaceChildren();for(const c of all)renderCard(allRoot,c);
 if(!all.length)allRoot.innerHTML='<div class="m-empty">No matching customers.</div>';
}
async function loadCustomers(){const data=await req('manual/admin/customers');people=data.customers||[];renderStats();renderCustomers();note('')}
function linkFor(id,title){const link=document.createElement('a');link.href=imageSrc('result',id);link.target='_blank';link.rel='noopener noreferrer';link.textContent=title;return link}
function makeUploadRow(upload,customerId){const row=document.createElement('article');row.className='admin-upload-card';
 const image=document.createElement('img');image.loading='lazy';image.src=imageSrc('source',upload.id);image.alt='Original '+upload.filename;
 const right=document.createElement('div');right.className='admin-upload-info';const title=document.createElement('strong');title.textContent=upload.filename;
 const small=document.createElement('small');small.textContent=time(upload.created_at);const badge=document.createElement('span');badge.className='m-badge'+(upload.status==='completed'?' done':'');badge.textContent=upload.status==='completed'?'Completed':'Processing';right.append(title,small,badge);
 const links=document.createElement('div');links.className='admin-file-list';const source=document.createElement('a');source.href=imageSrc('source',upload.id);source.target='_blank';source.rel='noopener noreferrer';source.textContent='Original photo ↗';links.append(source);
 for(const [i,result] of (upload.deliveries||[]).entries())links.append(linkFor(result.id,'Result '+(i+1)+' ↗'));right.append(links);
 const form=document.createElement('form');form.className='admin-deliver-form';const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=true;input.required=true;input.className='visually-hidden';input.id='delivery-'+upload.id;
 const chooser=document.createElement('label');chooser.className='admin-custom-file';chooser.htmlFor=input.id;chooser.innerHTML='<span class="file-icon">↑</span><span><strong>Choose finished files</strong><small>One or multiple JPG, PNG, WebP images</small></span>';
 const save=document.createElement('button');save.type='submit';save.className='m-btn m-primary m-small';save.textContent='Deliver files →';const message=document.createElement('p');message.className='admin-deliver-status';message.setAttribute('role','status');
 input.onchange=()=>{chooser.querySelector('small').textContent=input.files.length?(input.files.length+' selected · '+[...input.files].map(f=>f.name).slice(0,2).join(', ')):'One or multiple finished images'};
 form.append(chooser,input,save);form.onsubmit=async e=>{e.preventDefault();if(busyDeliver||!input.files.length)return;const files=[...input.files];busyDeliver=true;save.disabled=true;let delivered=0;
  try{for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1048576)throw Error('Use JPG/PNG/WebP under 12 MB each');note('Delivering '+file.name+' ('+(delivered+1)+'/'+files.length+')…',false,message);const data=new FormData();data.set('uploadId',upload.id);data.set('file',file);await req('manual/admin/deliver',{method:'POST',body:data});delivered++}
   await loadCustomers();await openCustomer(customerId,{scroll:false});note(delivered+' file'+(delivered===1?'':'s')+' delivered successfully.');
  }catch(ex){note(delivered+' delivered. '+ex.message,true,message)}finally{busyDeliver=false;save.disabled=false}
 };
 right.append(form,message);row.append(image,right);return row;
}
async function openCustomer(id,{scroll=true}={}){selectedCustomerId=id;changeTab('uploads');$('customerDetail').hidden=false;$('detailName').textContent='Loading customer…';$('detailUploads').replaceChildren();
 try{const info=await req('manual/admin/customer?id='+encodeURIComponent(id));if(id!==selectedCustomerId)return;
 $('detailName').textContent=info.customer.display_name;$('detailContact').textContent=info.customer.contact||'Verified customer workspace';const stats=$('detailSummary');stats.replaceChildren();const n=(info.uploads||[]).length;const pending=info.uploads.filter(x=>x.status==='processing').length;
 for(const text of [n+' uploads',pending+' processing',info.entitlement.active?info.entitlement.remaining+' uploads remaining':'Plan inactive']){const tag=document.createElement('span');tag.textContent=text;stats.append(tag)}
 const root=$('detailUploads');root.replaceChildren();for(const item of info.uploads||[])root.append(makeUploadRow(item,id));if(!n)root.innerHTML='<div class="m-empty">This customer has not uploaded any photos yet.</div>';
 if(scroll)$('customerDetail').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(ex){note(ex.message,true)}
}
$('closeDetail').onclick=()=>{$('customerDetail').hidden=true;selectedCustomerId=null};
$('refreshAdmin').onclick=async()=>{try{await loadCustomers();if(selectedCustomerId)await openCustomer(selectedCustomerId,{scroll:false})}catch(e){note(e.message,true)}};
$('refreshOverview').onclick=()=>loadCustomers().catch(e=>note(e.message,true));
$('searchCustomers').oninput=renderCustomers;$('searchAllCustomers').oninput=renderCustomers;$('uploadFilter').onchange=renderCustomers;
async function initialize(){const state=await req('admin/status');unlocked(state.unlocked);if(state.unlocked){await loadCustomers();const wanted=location.hash.slice(1);if(['overview','uploads','customers','settings'].includes(wanted))changeTab(wanted)}else if(!state.configured)note('Configure ADMIN_ACCESS_ID and SESSION_SECRET in Cloudflare first.',true)}
$('unlockForm').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]'),id=$('adminId').value.trim();b.disabled=true;try{await post('admin/login',{id});$('adminId').value='';unlocked(true);await loadCustomers();note('Dashboard unlocked.')}catch(ex){note(ex.message,true,$('unlockError'))}finally{b.disabled=false}};
$('adminLock').onclick=async()=>{try{await post('admin/logout',{});}catch{}unlocked(false);people=[];selectedCustomerId=null;note('Admin locked.')};
initialize().catch(e=>{unlocked(false);note(e.message,true)});
