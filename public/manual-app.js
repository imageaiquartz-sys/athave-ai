/* Athave AI: verified OTP account, manual uploads, member plan and optional AI studio. */
const $=id=>document.getElementById(id);
const API='/api/manual/';
const page=document.body.dataset.page;
let customer=null, entitlement=null, uploadFiles=[], uploadBusy=false, aiFiles=[], aiMessages=[];
let authUser=null, authAfter=null, authOpen=false, authPendingPhone='', checkoutBusy=false;
const msg=(message,error=false,id='uploadMessage')=>{const node=$(id)||$('appToast');if(!node)return;node.textContent=message;node.classList.toggle('error',error);node.hidden=false};
let loadingRequests=0;
function loadingVisual(active){
 let loader=$('customerLoader');if(!loader){loader=document.createElement('div');loader.id='customerLoader';loader.className='customer-loader';loader.setAttribute('role','status');loader.setAttribute('aria-label','Loading');loader.innerHTML='<span class="m-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Processing…</span>';loader.hidden=true;document.body.append(loader)}
 loadingRequests=Math.max(0,loadingRequests+(active?1:-1));loader.hidden=loadingRequests===0;
}
async function request(route, init={}){
 loadingVisual(true);
 try{const res=await fetch(API+route,{credentials:'same-origin',cache:'no-store',...init});
 const val=await res.json().catch(()=>({}));if(!res.ok)throw Error(val.error||'Request failed: '+res.status);return val;}
 finally{loadingVisual(false)}
}
const post=(route,body)=>request(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
// Secure OTP login; the server stores the session in a signed HttpOnly cookie.
function authOverlay(){
 if($('athaveOtpOverlay'))return;
 const aside=document.createElement('div');aside.id='athaveOtpOverlay';aside.className='m-auth-overlay';aside.hidden=true;
 aside.innerHTML=`<div class="m-auth-shade" data-close></div><section class="m-auth-dialog" role="dialog" aria-modal="true" aria-label="Sign in to Athave AI"><button type="button" class="m-auth-close" data-close aria-label="Close sign in">×</button><img src="/assets/athave-logo-official.webp" alt="Athave AI"/><h2>Sign in</h2><p>Continue with your mobile number</p><form id="mPhoneForm"><label>Mobile number</label><div class="m-auth-phone"><b>+91</b><input id="mPhone" inputmode="numeric" autocomplete="tel-national" type="tel" maxlength="10" pattern="[0-9]{10}" placeholder="10-digit mobile" required></div><button class="m-btn m-primary m-block" type="submit">Send OTP →</button></form><form hidden id="mOtpForm"><label>Verification code</label><input id="mOtp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]{4,8}" placeholder="Enter OTP" required><button class="m-btn m-primary m-block" type="submit">Verify & continue →</button><button type="button" class="m-link-button" id="mSendAgain">Resend OTP</button><button type="button" class="m-link-button" id="mPhoneBack">Change phone</button></form><form hidden id="mNameForm"><label>Your name</label><input id="mName" maxlength="80" autocomplete="name" required placeholder="Enter your name"><button type="submit" class="m-btn m-primary m-block">Create account →</button></form><p id="mAuthStatus" role="status" class="m-notice"></p><small>By signing in you agree to our <a href="/terms/">Terms</a> and <a href="/privacy/">Privacy Policy</a>.</small></section>`;
 document.body.append(aside);
 for(const close of aside.querySelectorAll('[data-close]'))close.onclick=closeAuth;
 $('mPhoneForm').onsubmit=async e=>{
  e.preventDefault();const val=$('mPhone').value.replace(/\D/g,'');if(!/^[6-9][0-9]{9}$/.test(val))return authMessage('Enter a valid Indian mobile number.',true);
  authPendingPhone='91'+val;await authAction('auth/send-otp',{phone:authPendingPhone},'mPhoneForm',data=>{showAuthStep('mOtpForm');authMessage('OTP sent. Check your SMS.')});
 };
 $('mOtpForm').onsubmit=async e=>{
  e.preventDefault();await authAction('auth/verify-otp',{otp:$('mOtp').value.trim()},'mOtpForm',async data=>{
   if(data.needsName){showAuthStep('mNameForm');authMessage('Phone verified. Enter your name.');return}
   await authSuccess();
  });
 };
 $('mNameForm').onsubmit=async e=>{e.preventDefault();await authAction('auth/complete',{name:$('mName').value.trim()},'mNameForm',authSuccess)};
 $('mPhoneBack').onclick=()=>{showAuthStep('mPhoneForm');authMessage('')};
 $('mSendAgain').onclick=async()=>{await authAction('auth/send-otp',{phone:authPendingPhone},'mOtpForm',()=>authMessage('New OTP sent.'))};
}
function showAuthStep(id){for(const name of ['mPhoneForm','mOtpForm','mNameForm'])$(name).hidden=name!==id}
function authMessage(text,error=false){const box=$('mAuthStatus');if(box){box.textContent=text;box.classList.toggle('error',error)}}
async function authAction(path,body,formId,done){
 const form=$(formId),button=form?.querySelector('button[type=submit]');if(button)button.disabled=true;loadingVisual(true);authMessage('Verifying…');
 try{const result=await fetch('/api/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await result.json().catch(()=>({}));if(!result.ok)throw Error(data.error||'Verification failed');await done(data)}catch(e){authMessage(e.message,true)}finally{if(button)button.disabled=false;loadingVisual(false)}
}
function openAuth(after){authOverlay();if(typeof after==='function')authAfter=after;authOpen=true;$('athaveOtpOverlay').hidden=false;showAuthStep('mPhoneForm');authMessage('');setTimeout(()=>$('mPhone')?.focus(),30)}
function closeAuth(){if(!authOpen)return;authOpen=false;$('athaveOtpOverlay').hidden=true;authAfter=null}
async function getAuth(){
 try{const r=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});if(!r.ok){authUser=null;return null}authUser=await r.json();return authUser}catch{authUser=null;return null}
}
async function authSuccess(){
 const old=authAfter;authAfter=null;authOpen=false;$('athaveOtpOverlay').hidden=true;
 await getAuth();await boot();if(old)await old();
}
async function signOut(){
 try{await postPublic('auth/logout',{});authUser=null;customer=null;entitlement=null;uploadFiles=[];if($('allUploads'))$('allUploads').replaceChildren();updateProfileAuth();location.href='/profile/'}catch(e){msg(e.message,true,'profileStatus')}
}
async function postPublic(path,data){const r=await fetch('/api/'+path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Request failed');return j}
async function signedInOrPrompt(action){if(authUser||await getAuth())return true;openAuth(action);return false}
function updateProfileAuth(){
 const signed=!!authUser;
 if($('profilePhone'))$('profilePhone').textContent=signed?'Verified phone · +91 •••• '+authUser.phoneLast4:'Sign in to view your account';
 if($('verifiedBadge')){$('verifiedBadge').textContent=signed?'Verified':'Sign in';$('verifiedBadge').disabled=signed;}
 if($('profileAuthAction')){$('profileAuthAction').classList.toggle('m-login-action',!signed);$('profileAuthAction').classList.toggle('m-logout-action',signed)}
 if($('profileAuthLabel'))$('profileAuthLabel').textContent=signed?'Log out':'Log in';
 const glyph=$('profileAuthAction')?.querySelector('svg');if(glyph)glyph.innerHTML=signed?'<path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5M10 8l-4 4 4 4M6 12h11"></path>':'<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"></path><path d="m14 8 4 4-4 4M10 12h8"></path>'; 
 for(const link of document.querySelectorAll('.m-account span'))link.textContent=signed?'Profile':'Sign in';
}
async function showHero(){
 const root=$('homepageArt');if(!root)return;
 try{const setting=await request('hero');const pic=$('homepageImage');root.classList.toggle('m-with-background',setting.mode==='background');root.classList.toggle('m-transparent-image',setting.mode==='transparent');
  const isDefault=setting.mode==='default';root.classList.toggle('m-with-background',isDefault||setting.mode==='background');
  pic.src=setting.imageUrl||'/assets/athave-marble-showcase.webp';pic.alt='Athave AI luxury product catalogue image';
 }catch{} // Default image remains available if custom settings could not be read.
}
async function loadGallery(){
 const sources={1:'/assets/athave-marble-showcase.webp',2:'/assets/athave-shirt.webp',3:'/assets/athave-earbuds-cutout.webp'};
 try{const gallery=await request('gallery');for(const item of gallery.images||[]){const pic=$('showcaseImg'+item.slot);if(pic)pic.src=item.imageUrl||sources[item.slot]}}catch{} // static images are the safe fallback
}
function date(d){return d?new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
async function initSession(){
 const fresh=await post('start',{});
 customer=fresh.customer;entitlement=fresh.entitlement;
 renderPlan();updateProfileAuth();
 return fresh;
}
function renderPlan(){
 const e=entitlement||{};
 if($('planRemaining'))$('planRemaining').textContent=e.active?e.remaining:0;
 if($('planUsage'))$('planUsage').textContent=e.active?e.used+' / '+e.uploadCap:'No active plan';
 if($('planUntil'))$('planUntil').textContent=e.active?date(e.periodEnd):'—';
 if($('planAction')){$('planAction').textContent=!e.active?'Start ₹499 plan →':e.remaining===0?'Add 50 uploads for ₹99 →':'Manage plan →';}
 if($('profilePlan'))$('profilePlan').textContent=e.active?'Active monthly plan':'No active plan';
 if($('profileGuestName'))$('profileGuestName').textContent=customer?.display_name||authUser?.name||'Your account';
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
async function loadPayments(){
 const root=$('membershipPayments');if(!root)return;
 const data=await request('payments');root.replaceChildren();
 if(!data.payments?.length){root.innerHTML='<p class="m-muted">No transactions yet.</p>';return}
 for(const pay of data.payments){
  const item=document.createElement('div');item.className='m-payment-row';
  const left=document.createElement('div');const title=document.createElement('strong');title.textContent=pay.kind==='month'?'Monthly plan':'50 extra uploads';
  const time=document.createElement('small');time.textContent=date(pay.paid_at||pay.created_at);left.append(title,time);
  const right=document.createElement('div');right.className='m-payment-right';const amount=document.createElement('strong');amount.textContent='₹'+(pay.amount_paise/100).toFixed(0);
  const state=document.createElement('small');state.textContent=pay.status==='paid'?'Paid':'Pending';right.append(amount,state);item.append(left,right);root.append(item)
 }
}
function drawSelected(){const root=$('selectedImages');if(!root)return;root.replaceChildren();for(const f of uploadFiles){
 const box=document.createElement('div');box.className='m-preview';const img=document.createElement('img');const u=URL.createObjectURL(f);img.src=u;img.onload=()=>URL.revokeObjectURL(u);img.alt=f.name;
 const label=document.createElement('small');label.textContent=f.name;const button=document.createElement('button');button.type='button';button.textContent='×';button.setAttribute('aria-label','Remove '+f.name);button.onclick=()=>{uploadFiles=uploadFiles.filter(x=>x!==f);drawSelected()};
 box.append(img,label,button);root.append(box);
 }if($('fileCounter'))$('fileCounter').textContent=uploadFiles.length?uploadFiles.length+' photo'+(uploadFiles.length>1?'s':'')+' selected':'No photos selected';}
function pickFiles(files){let rejected=0;for(const file of files){if(!mimeOk(file)){rejected++;continue}uploadFiles.push(file)}drawSelected();if(rejected)msg('Some files were skipped. Use JPG, PNG or WebP under 8 MB.',true)}
async function uploadAll(){if(uploadBusy)return;
 if(!uploadFiles.length)return msg('Choose at least one image.',true);
 if(!await signedInOrPrompt(uploadAll))return;
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
 if(!await signedInOrPrompt(()=>payment(kind)))return;
 if(checkoutBusy)return;
 if(!window.Razorpay)return msg('Payment checkout is unavailable. Please refresh.',true,'paymentMessage');
 checkoutBusy=true;const buttons=[...document.querySelectorAll('[data-buy]')];buttons.forEach(x=>x.disabled=true);
 try{
  const order=await post('plan/order',{kind});
  const checkout=new Razorpay({key:order.keyId,amount:order.amount,currency:'INR',name:'Athave AI',description:kind==='month'?'30-day upload plan · 50 photos':'50 extra photo uploads',order_id:order.orderId,theme:{color:'#18191f'},
   modal:{ondismiss:async()=>{await checkOrder(order.orderId);renderPlan()}},
   handler:async proof=>{try{await post('plan/verify',proof);const state=await request('status');entitlement=state.entitlement;renderPlan();msg('Payment verified. Your uploads are available!',false,'paymentMessage')}catch(e){msg('Payment pending verification: '+e.message,true,'paymentMessage');await checkOrder(order.orderId)}}});
  checkout.on('payment.failed',()=>msg('Payment was not completed.',true,'paymentMessage'));
  checkout.open();
 }catch(e){msg(e.message,true,'paymentMessage')}finally{checkoutBusy=false;renderPlan()}
}
async function checkOrder(id){for(let attempt=0;attempt<5;attempt++){try{const s=await request('plan/status?orderId='+encodeURIComponent(id));if(s.paid){entitlement=s.entitlement;renderPlan();msg('Payment confirmed!',false,'paymentMessage');return true}}catch(e){if(attempt===4)msg(e.message,true,'paymentMessage')}if(attempt<4)await new Promise(r=>setTimeout(r,2500))}return false}
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
 if(!await signedInOrPrompt(aiSend))return;
 if(!entitlement?.active)return msg('Start the monthly plan to use AI Studio.',true,'aiMessage');
 const mode=$('aiMakeImage').checked?'image':'chat';button.disabled=true;aiLine('user',message);input.value='';aiLine('assistant','');const waiting=$('aiThread').lastChild;waiting.querySelector('div').innerHTML='<span class="m-dots" aria-label="AI is working"><i></i><i></i><i></i></span>';
 try{const images=await Promise.all(aiFiles.map(fileToJpeg));const history=aiMessages.slice(-8);const ans=await post('ai',{message,mode,images,history});waiting.remove();aiLine('assistant',ans.reply,ans.imageId);
 aiMessages.push({role:'user',text:message},{role:'assistant',text:ans.reply});aiFiles=[];showAiAttachments();msg('',false,'aiMessage');
 }catch(e){waiting.remove();aiLine('assistant','Request failed: '+e.message);msg(e.message,true,'aiMessage')}finally{button.disabled=false;input.focus()}
}
async function boot(){
 if(page==='home'){await Promise.allSettled([showHero(),loadGallery()]);return}
 await getAuth();updateProfileAuth();
 if(!authUser){
  customer=null;entitlement=null;renderPlan();
  if(page==='profile')openAuth();
  return;
 }
 try{
  await initSession();
  if(page==='create'){if(customer&&$('customerName')){$('customerName').value=customer.display_name.startsWith('Customer ')?'':customer.display_name;$('customerContact').value=customer.contact||''}await loadUploads()}
  if(page==='profile')await loadUploads();
  if(page==='payments')await loadPayments();
 }catch(e){msg(e.message,true,page==='topup'?'paymentMessage':page==='profile'?'profileStatus':'uploadMessage')}
}
if($('manualImages'))$('manualImages').addEventListener('change',ev=>{pickFiles([...ev.target.files]);ev.target.value=''});
if($('photoDrop')){const label=$('photoDrop');label.addEventListener('dragover',e=>{e.preventDefault();label.classList.add('is-dragging')});label.addEventListener('dragleave',()=>label.classList.remove('is-dragging'));label.addEventListener('drop',e=>{e.preventDefault();label.classList.remove('is-dragging');pickFiles([...e.dataTransfer.files])})}
if($('sendUploads'))$('sendUploads').onclick=uploadAll;
for(const button of document.querySelectorAll('[data-buy]'))button.onclick=()=>payment(button.dataset.buy);
if($('profileAuthAction'))$('profileAuthAction').onclick=()=>authUser?signOut():openAuth();
if($('verifiedBadge'))$('verifiedBadge').onclick=()=>{if(!authUser)openAuth()};
if($('aiFiles'))$('aiFiles').onchange=e=>{const files=[...e.target.files].filter(mimeOk);aiFiles=[...aiFiles,...files].slice(0,3);showAiAttachments();e.target.value=''};
if($('aiSend'))$('aiSend').onclick=aiSend;
if($('aiPrompt'))$('aiPrompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend()}};
boot();
