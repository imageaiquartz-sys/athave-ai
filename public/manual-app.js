/* Athave V16: customer-facing manual order workflow with anonymous signed sessions. */
const $=id=>document.getElementById(id);
const API='/api/manual/';
const page=document.body.dataset.page;
let customer=null, entitlement=null, uploadFiles=[], uploadBusy=false, aiFiles=[], aiMessages=[];
const msg=(message,error=false,id='uploadMessage')=>{const node=$(id)||$('appToast');if(!node)return;node.textContent=message;node.classList.toggle('error',error);node.hidden=false};
async function request(route, init={}){
 const res=await fetch(API+route,{credentials:'same-origin',cache:'no-store',...init});
 const val=await res.json().catch(()=>({}));if(!res.ok)throw Error(val.error||'Request failed: '+res.status);return val;
}
const post=(route,body)=>request(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function date(d){return d?new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
async function initSession(){
 const fresh=await post('start',{});
 customer=fresh.customer;entitlement=fresh.entitlement;
 if(fresh.recoveryKey){sessionStorage.setItem('athave_manual_recovery_offer',fresh.recoveryKey)}
 renderPlan();renderRecovery();
 return fresh;
}
function renderPlan(){
 const e=entitlement||{};
 if($('planRemaining'))$('planRemaining').textContent=e.active?e.remaining:0;
 if($('planUsage'))$('planUsage').textContent=e.active?e.used+' / '+e.uploadCap:'No active plan';
 if($('planUntil'))$('planUntil').textContent=e.active?date(e.periodEnd):'—';
 if($('planAction')){$('planAction').textContent=!e.active?'Start ₹499 plan →':e.remaining===0?'Add 50 uploads for ₹99 →':'Manage plan →';}
 if($('profilePlan'))$('profilePlan').textContent=e.active?'Active monthly plan':'No active plan';
 if($('profileGuestName'))$('profileGuestName').textContent=customer?.display_name||'Your workspace';
 if($('profileBalance'))$('profileBalance').textContent=e.active?e.remaining+' of '+e.uploadCap:'0';
 if($('profileEnd'))$('profileEnd').textContent=e.active?date(e.periodEnd):'—';
 if($('profilePlanAction'))$('profilePlanAction').textContent=!e.active?'Start plan →':e.remaining===0?'Buy 50 uploads →':'Manage plan →';
 if($('pricingBalance'))$('pricingBalance').textContent=e.active?`${e.remaining} of ${e.uploadCap} uploads available`:'No active plan';
 if($('pricingDeadline'))$('pricingDeadline').textContent=e.active?'Plan ends '+date(e.periodEnd):'Start your 30-day plan to upload photos.';
 for(const button of document.querySelectorAll('[data-buy]')){
  const kind=button.dataset.buy;button.disabled=kind==='month'?!!e.active:!e.active||e.remaining>0;
  button.title=kind==='month'&&e.active?'Already active':kind==='addon'&&(!e.active||e.remaining>0)?'Available after your uploads are used':'';
 }
}
function renderRecovery(){const key=sessionStorage.getItem('athave_manual_recovery_offer');if(key&&$('recoveryOffer')){$('recoveryOffer').hidden=false;$('recoveryCode').textContent=key;}}
function mimeOk(file){return ['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size>0&&file.size<=8*1048576}
function imageUrl(id,type='source'){return API+'file?kind='+encodeURIComponent(type)+'&id='+encodeURIComponent(id)}
function drawUploads(root,list){if(!root)return;root.replaceChildren();if(!list.length){root.innerHTML='<div class="m-empty">No uploads yet. <a href="/create/" style="text-decoration:underline">Start uploading →</a></div>';return}
 for(const x of list){const item=document.createElement('article');item.className='m-order';
  const preview=document.createElement('img');preview.className='m-order-thumb';preview.src=imageUrl(x.id);preview.alt='Uploaded product';preview.loading='lazy';
  const info=document.createElement('div');info.className='m-order-info';
  const title=document.createElement('strong');title.textContent=x.filename;
  const sub=document.createElement('small');sub.textContent=date(x.created_at);
  const status=document.createElement('span');status.className='m-badge'+(x.status==='completed'?' done':'');status.textContent=x.status==='completed'?'Ready to download':'Processing · before 24 hours';
  const files=document.createElement('div');files.className='m-results-links';
  for(const [i,out] of (x.deliveries||[]).entries()){
   const link=document.createElement('a');link.href=imageUrl(out.id,'result');link.className='m-result-link';link.download=out.filename;link.textContent='Download '+(i+1)+' ↓';files.append(link)
  }
  info.append(title,sub,status,files);item.append(preview,info);root.append(item);
 }
}
async function loadUploads(){const response=await request('uploads');drawUploads($('allUploads'),response.uploads);drawUploads($('recentUploads'),response.uploads.slice(0,4));}
function drawSelected(){const root=$('selectedImages');if(!root)return;root.replaceChildren();for(const f of uploadFiles){
 const box=document.createElement('div');box.className='m-preview';const img=document.createElement('img');const u=URL.createObjectURL(f);img.src=u;img.onload=()=>URL.revokeObjectURL(u);img.alt=f.name;
 const label=document.createElement('small');label.textContent=f.name;const button=document.createElement('button');button.type='button';button.textContent='×';button.setAttribute('aria-label','Remove '+f.name);button.onclick=()=>{uploadFiles=uploadFiles.filter(x=>x!==f);drawSelected()};
 box.append(img,label,button);root.append(box);
 }if($('fileCounter'))$('fileCounter').textContent=uploadFiles.length?uploadFiles.length+' photo'+(uploadFiles.length>1?'s':'')+' selected':'No photos selected';}
function pickFiles(files){let rejected=0;for(const file of files){if(!mimeOk(file)){rejected++;continue}uploadFiles.push(file)}drawSelected();if(rejected)msg('Some files were skipped. Use JPG, PNG or WebP under 8 MB.',true)}
async function uploadAll(){if(uploadBusy)return;
 if(!uploadFiles.length)return msg('Choose at least one image.',true);
 if(!entitlement?.active||entitlement.remaining<1)return msg('Start your ₹499 monthly plan first.',true);
 if(uploadFiles.length>entitlement.remaining)return msg(`You have ${entitlement.remaining} uploads remaining. Upload fewer photos or add more after using your current allowance.`,true);
 const name=$('customerName').value.trim(),contact=$('customerContact').value.trim();if(name.length<2)return msg('Enter your name or shop name.',true);
 uploadBusy=true;$('sendUploads').disabled=true;let done=0;const total=uploadFiles.length;const progress=$('uploadProgress');progress.hidden=false;
 try{
  await post('update-customer',{name,contact});customer.display_name=name;customer.contact=contact;
  const batch=crypto.randomUUID();let errors=[];
  for(const file of [...uploadFiles]){
   const f=new FormData();f.set('file',file);f.set('batch',batch);
   $('uploadProgressText').textContent='Uploading '+file.name;$('uploadPercent').textContent=Math.round(done/total*100)+'%';$('uploadBar').style.width=Math.round(done/total*100)+'%';
   try{await request('upload',{method:'POST',body:f});done++;uploadFiles=uploadFiles.filter(x=>x!==file)}catch(e){errors.push(file.name+': '+e.message);break}
  }
  drawSelected();const state=await request('status');entitlement=state.entitlement;renderPlan();await loadUploads();
  $('uploadPercent').textContent=Math.round(done/total*100)+'%';$('uploadBar').style.width=Math.round(done/total*100)+'%';
  msg(errors.length?`${done} submitted. ${errors[0]}`:`${done} photo${done===1?'':'s'} submitted. Processing — expect results within 24 hours.`,!!errors.length);
 }catch(e){msg(e.message,true)}finally{uploadBusy=false;$('sendUploads').disabled=false;setTimeout(()=>{progress.hidden=true;$('uploadBar').style.width='0'},1200)}
}
async function payment(kind){
 if(!window.Razorpay)return msg('Payment checkout is unavailable. Please refresh.',true,'paymentMessage');
 const buttons=[...document.querySelectorAll('[data-buy]')];buttons.forEach(x=>x.disabled=true);
 try{
  const order=await post('plan/order',{kind});
  const checkout=new Razorpay({key:order.keyId,amount:order.amount,currency:'INR',name:'Athave AI',description:kind==='month'?'30-day upload plan · 50 photos':'50 extra photo uploads',order_id:order.orderId,theme:{color:'#18191f'},
   modal:{ondismiss:async()=>{await checkOrder(order.orderId);renderPlan()}},
   handler:async proof=>{try{await post('plan/verify',proof);const state=await request('status');entitlement=state.entitlement;renderPlan();msg('Payment verified. Your uploads are available!',false,'paymentMessage')}catch(e){msg('Payment pending verification: '+e.message,true,'paymentMessage');await checkOrder(order.orderId)}}});
  checkout.on('payment.failed',()=>msg('Payment was not completed.',true,'paymentMessage'));
  checkout.open();
 }catch(e){msg(e.message,true,'paymentMessage')}finally{renderPlan()}
}
async function checkOrder(id){try{const s=await request('plan/status?orderId='+encodeURIComponent(id));if(s.paid){entitlement=s.entitlement;renderPlan();msg('Payment confirmed!',false,'paymentMessage')}}catch{}}
async function fileToJpeg(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1048576)throw Error('Reference photo must be below 8 MB');
 const image=await createImageBitmap(file);const scale=Math.min(1,840/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();return {mime:'image/jpeg',data:canvas.toDataURL('image/jpeg',.7).split(',')[1]};
}
function aiLine(role,content,imageId){const holder=$('aiThread');if(!holder)return;const row=document.createElement('div');row.className='m-ai-msg '+role;
 if(role==='assistant'){const avatar=document.createElement('span');avatar.className='m-ai-avatar';avatar.textContent='✦';row.append(avatar)}
 const div=document.createElement('div');div.textContent=content;if(imageId){const img=document.createElement('img');img.src=API+'ai/file?id='+encodeURIComponent(imageId);img.alt='AI generated image';const a=document.createElement('a');a.href=img.src;a.textContent='Download image ↓';div.append(img,a)}row.append(div);holder.append(row);holder.scrollTop=holder.scrollHeight;
}
function showAiAttachments(){const root=$('aiAttached');root.replaceChildren();for(const file of aiFiles){const img=document.createElement('img');const url=URL.createObjectURL(file);img.src=url;img.alt=file.name;img.onload=()=>URL.revokeObjectURL(url);root.append(img)}}
async function aiSend(){const button=$('aiSend'),input=$('aiPrompt'),message=input.value.trim();if(!message)return msg('Enter a question or image request.',true,'aiMessage');
 if(!entitlement?.active)return msg('Start the monthly plan to use AI Studio.',true,'aiMessage');
 const mode=$('aiMakeImage').checked?'image':'chat';button.disabled=true;aiLine('user',message);input.value='';aiLine('assistant','Working on your request…');const waiting=$('aiThread').lastChild;
 try{const images=await Promise.all(aiFiles.map(fileToJpeg));const history=aiMessages.slice(-8);const ans=await post('ai',{message,mode,images,history});waiting.remove();aiLine('assistant',ans.reply,ans.imageId);
 aiMessages.push({role:'user',text:message},{role:'assistant',text:ans.reply});aiFiles=[];showAiAttachments();msg('',false,'aiMessage');
 }catch(e){waiting.remove();aiLine('assistant','Request failed: '+e.message);msg(e.message,true,'aiMessage')}finally{button.disabled=false;input.focus()}
}
async function boot(){if(page==='home')return;
 try{await initSession();
  if(page==='create'){if(customer&&$('customerName')){$('customerName').value=customer.display_name.startsWith('Customer ')?'':customer.display_name;$('customerContact').value=customer.contact||''}await loadUploads()}
  if(page==='profile'){await loadUploads()}
 }catch(e){msg(e.message,true,'paymentMessage')}
}
if($('manualImages'))$('manualImages').addEventListener('change',ev=>{pickFiles([...ev.target.files]);ev.target.value=''});
if($('photoDrop')){const label=$('photoDrop');label.addEventListener('dragover',e=>{e.preventDefault();label.classList.add('is-dragging')});label.addEventListener('dragleave',()=>label.classList.remove('is-dragging'));label.addEventListener('drop',e=>{e.preventDefault();label.classList.remove('is-dragging');pickFiles([...e.dataTransfer.files])})}
if($('sendUploads'))$('sendUploads').onclick=uploadAll;
for(const button of document.querySelectorAll('[data-buy]'))button.onclick=()=>payment(button.dataset.buy);
if($('copyRecovery'))$('copyRecovery').onclick=async()=>{try{await navigator.clipboard.writeText($('recoveryCode').textContent);msg('Recovery code copied.',false,'recoveryStatus')}catch(e){msg('Please select and copy the code.',true,'recoveryStatus')}};
if($('newRecovery'))$('newRecovery').onclick=async()=>{const button=$('newRecovery');button.disabled=true;try{const response=await post('rotate-recovery',{});sessionStorage.setItem('athave_manual_recovery_offer',response.recoveryKey);renderRecovery();msg('New code created. Copy and save it securely. Previous recovery codes no longer work.',false,'recoveryStatus')}catch(e){msg(e.message,true,'recoveryStatus')}finally{button.disabled=false}};
if($('recoverForm'))$('recoverForm').onsubmit=async e=>{e.preventDefault();try{await post('recover',{code:$('recoverInput').value});sessionStorage.removeItem('athave_manual_recovery_offer');location.reload()}catch(error){msg(error.message,true,'recoveryStatus')}};
if($('aiFiles'))$('aiFiles').onchange=e=>{const files=[...e.target.files].filter(mimeOk);aiFiles=[...aiFiles,...files].slice(0,3);showAiAttachments();e.target.value=''};
if($('aiSend'))$('aiSend').onclick=aiSend;
if($('aiPrompt'))$('aiPrompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend()}};
boot();
