const $=id=>document.getElementById(id);
const STATUS=$('adminNote');
let people=[],selectedCustomerId=null,working=false;
const status=(message,error=false,target=STATUS)=>{target.textContent=message;target.classList.toggle('error',error)};
async function req(path,config={}){
 const response=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',...config});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Request failed');return data;
}
const post=(path,body)=>req(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const adminImage=(kind,id)=>'/api/manual/admin/file?kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id);
const fmtTime=x=>new Date(x).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
function view(unlocked){$('unlockPanel').hidden=unlocked;$('adminWorkspace').hidden=!unlocked;$('adminLock').hidden=!unlocked}
function renderCustomers(){const root=$('customerCards');root.replaceChildren();const q=$('searchCustomers').value.toLowerCase().trim();const list=people.filter(p=>p.total>0&&(!q||p.display_name.toLowerCase().includes(q)||p.contact.toLowerCase().includes(q)||p.id.toLowerCase().includes(q)));
 $('totalCustomerCount').textContent='('+list.length+')';if(!list.length){root.innerHTML='<div class="m-empty">No customer uploads found.</div>';return}
 list.sort((a,b)=>b.processing-a.processing||b.total-a.total);
 for(const customer of list){const button=document.createElement('button');button.type='button';button.className='admin-customer-card';button.setAttribute('aria-label','Open '+customer.display_name);
 const head=document.createElement('div');head.className='admin-customer-top';const avatar=document.createElement('span');avatar.className='m-avatar';avatar.textContent=(customer.display_name||'A')[0].toUpperCase();
 const d=document.createElement('div');const name=document.createElement('strong');name.textContent=customer.display_name;const contact=document.createElement('small');contact.textContent=customer.contact||'Private customer workspace';d.append(name,contact);head.append(avatar,d);
 const foot=document.createElement('div');foot.className='admin-card-counts';const total=document.createElement('span');total.textContent=customer.total+' uploaded photo'+(customer.total===1?'':'s');const pending=document.createElement('strong');pending.textContent=customer.processing+' processing';foot.append(total,pending);button.append(head,foot);
 button.onclick=()=>openCustomer(customer.id);root.append(button)}
}
async function loadCustomers(){const response=await req('manual/admin/customers');people=response.customers;renderCustomers();status('');}
function resultLink(id,name){const link=document.createElement('a');link.href=adminImage('result',id);link.target='_blank';link.rel='noopener noreferrer';link.textContent=name;return link}
async function openCustomer(id){selectedCustomerId=id;$('customerDetail').hidden=false;$('detailName').textContent='Loading…';$('detailUploads').replaceChildren();try{
 const data=await req('manual/admin/customer?id='+encodeURIComponent(id));if(id!==selectedCustomerId)return;
 $('detailName').textContent=data.customer.display_name;$('detailContact').textContent=data.customer.contact||'No contact provided';
 const total=data.uploads.length,processing=data.uploads.filter(x=>x.status==='processing').length;
 const stats=$('detailSummary');stats.replaceChildren();for(const v of [total+' photos',processing+' processing',data.entitlement.active?data.entitlement.remaining+' uploads remaining':'Plan inactive']){const span=document.createElement('span');span.textContent=v;stats.append(span)}
 const root=$('detailUploads');root.replaceChildren();if(!total)root.innerHTML='<div class="m-empty">No photos.</div>';
 for(const upload of data.uploads){const row=document.createElement('article');row.className='admin-upload-card';const pic=document.createElement('img');pic.src=adminImage('source',upload.id);pic.alt='Original '+upload.filename;pic.loading='lazy';
 const right=document.createElement('div'),title=document.createElement('strong');title.textContent=upload.filename;const when=document.createElement('small');when.textContent=fmtTime(upload.created_at);const badge=document.createElement('span');badge.className='m-badge'+(upload.status==='completed'?' done':'');badge.textContent=upload.status==='completed'?'Completed':'Processing';right.append(title,when,badge);
 const links=document.createElement('div');links.className='admin-file-list';for(const [i,result] of upload.deliveries.entries())links.append(resultLink(result.id,'Result '+(i+1)+' ↗'));
 const sourceLink=document.createElement('a');sourceLink.href=adminImage('source',upload.id);sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';sourceLink.textContent='View original ↗';links.prepend(sourceLink);right.append(links);
 const form=document.createElement('form');form.className='admin-deliver-form';const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='image/jpeg,image/png,image/webp';input.required=true;input.setAttribute('aria-label','Finished images for '+upload.filename);
 const send=document.createElement('button');send.type='submit';send.className='m-btn m-primary m-small';send.textContent='Upload results';
 const message=document.createElement('div');message.className='admin-deliver-status';form.append(input,send);
 form.onsubmit=async e=>{e.preventDefault();if(working||!input.files.length)return;working=true;send.disabled=true;let done=0;try{
   for(const file of [...input.files]){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1048576)throw Error('Use JPG/PNG/WebP up to 12 MB');
    const formData=new FormData();formData.set('uploadId',upload.id);formData.set('file',file);status('Delivering '+file.name+' ('+(done+1)+'/'+input.files.length+')…',false,message);
    await req('manual/admin/deliver',{method:'POST',body:formData});done++;
   }
   status(done+' result'+(done===1?'':'s')+' delivered.',false,message);await openCustomer(id);await loadCustomers();
  }catch(err){status(done+' delivered. '+err.message,true,message)}finally{working=false;send.disabled=false}};
 right.append(form,message);row.append(pic,right);root.append(row)}
 $('customerDetail').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){status(e.message,true)}}
$('unlockForm').onsubmit=async e=>{e.preventDefault();const id=$('adminId').value.trim(),button=e.currentTarget.querySelector('button');button.disabled=true;try{await post('admin/login',{id});$('adminId').value='';view(true);await loadCustomers();await loadHeroAdmin()}catch(e){status(e.message,true,$('unlockError'))}finally{button.disabled=false}};
$('adminLock').onclick=async()=>{await post('admin/logout',{}).catch(()=>{});view(false);status('Admin locked.')};
$('closeDetail').onclick=()=>{$('customerDetail').hidden=true;selectedCustomerId=null};
$('refreshAdmin').onclick=async()=>{try{await loadCustomers();if(selectedCustomerId)await openCustomer(selectedCustomerId)}catch(e){status(e.message,true)}};
$('searchCustomers').oninput=renderCustomers;
(async()=>{try{const state=await req('admin/status');view(state.unlocked);if(state.unlocked){await loadCustomers();await loadHeroAdmin()}else if(!state.configured)status('Configure ADMIN_ACCESS_ID and SESSION_SECRET in Cloudflare first.',true)}catch(e){view(false);status(e.message,true)}})();

async function loadHeroAdmin(){try{const state=await req('manual/admin/hero');$('heroMode').value=state.mode==='default'?'default':state.mode;$('heroPreview').src=state.imageUrl||'/assets/athave-shirt.webp'}catch(e){status(e.message,true,$('heroAdminStatus'))}}
$('heroForm').onsubmit=async e=>{e.preventDefault();const mode=$('heroMode').value,file=$('heroInput').files[0],button=e.currentTarget.querySelector('button[type=submit]');if(mode!=='default'&&!file)return status('Choose an image before saving.',true,$('heroAdminStatus'));button.disabled=true;try{const f=new FormData();f.set('mode',mode);if(file)f.set('file',file);await req('manual/admin/hero',{method:'POST',body:f});$('heroInput').value='';await loadHeroAdmin();status('Homepage image saved. New visitors will see it.',false,$('heroAdminStatus'))}catch(err){status(err.message,true,$('heroAdminStatus'))}finally{button.disabled=false}};
