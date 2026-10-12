/* Athave AI: verified OTP account, manual uploads, member plan and optional AI studio. */
const $=id=>document.getElementById(id);
const API='/api/manual/';
const page=document.body.dataset.page;
let customer=null, entitlement=null, uploadFiles=[], uploadBusy=false, aiFiles=[], aiMessages=[];
let authUser=null, authAfter=null, authOpen=false, authPendingPhone='', checkoutBusy=false;
const CACHE_KEYS={auth:'athave_auth_cache_v1',session:'athave_session_cache_v1',gallery:'athave_customer_gallery_v23_'};
const readCache=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const writeCache=(key,val)=>{try{localStorage.setItem(key,JSON.stringify(val))}catch{}};
const clearCache=key=>{try{localStorage.removeItem(key)}catch{}};
function hydrateCachedState(){const a=readCache(CACHE_KEYS.auth),s=readCache(CACHE_KEYS.session); if(a&&a.user){authUser=a.user;} if(s){customer=s.customer||customer; entitlement=s.entitlement||entitlement;}}
const msg=(message,error=false,id='uploadMessage')=>{const node=$(id)||$('appToast');if(!node)return;node.textContent=message;node.classList.toggle('error',error);node.hidden=false};
let loadingRequests=0;
let uploadOverlayActive=false;
function uploadOverlay(active,text="Uploading your photos…"){
 let box=$("fullUploadLoader");if(!box){box=document.createElement("div");box.id="fullUploadLoader";box.className="athave-upload-overlay";box.hidden=true;box.setAttribute("role","status");box.setAttribute("aria-live","polite");box.innerHTML='<div class="athave-upload-progress"><span class="m-dots" aria-hidden="true"><i></i><i></i><i></i></span><strong id="fullUploadText">Uploading photos…</strong><small>Keep this page open until your photos are submitted.</small></div>';document.body.append(box)}
 uploadOverlayActive=active;box.hidden=!active;if(active)$("fullUploadText").textContent=text;
}

function loadingVisual(active){
 let loader=$('customerLoader');if(!loader){loader=document.createElement('div');loader.id='customerLoader';loader.className='customer-loader';loader.setAttribute('role','status');loader.setAttribute('aria-label','Loading');loader.innerHTML='<span class="m-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Processing…</span>';loader.hidden=true;document.body.append(loader)}
 loadingRequests=Math.max(0,loadingRequests+(active?1:-1));loader.hidden=uploadOverlayActive||loadingRequests===0;
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
 try{const r=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});if(!r.ok){authUser=null;clearCache(CACHE_KEYS.auth);return null}authUser=await r.json();writeCache(CACHE_KEYS.auth,{user:authUser,ts:Date.now()});return authUser}catch{authUser=null;clearCache(CACHE_KEYS.auth);return null}
}
async function authSuccess(){
 const old=authAfter;authAfter=null;authOpen=false;$('athaveOtpOverlay').hidden=true;
 await getAuth();await boot();if(old)await old();
}
async function signOut(){
 try{await postPublic('auth/logout',{});if(customer?.id){clearCache(CACHE_KEYS.gallery+customer.id);if('caches' in window)await caches.delete('athave-gallery-previews-v23-'+customer.id).catch(()=>{});}authUser=null;customer=null;entitlement=null;clearCache(CACHE_KEYS.auth);clearCache(CACHE_KEYS.session);uploadFiles=[];if($('allUploads'))$('allUploads').replaceChildren();updateProfileAuth();location.href='/profile/'}catch(e){msg(e.message,true,'profileStatus')}
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
 const pic=$('homepageImage');
 root.classList.add('m-luxury-hero-image');
 root.classList.remove('m-with-background','m-transparent-image');
 pic.src='/assets/athave-luxury-hero.webp';
 pic.alt='Athave AI luxury perfume and black earbuds product collection on polished marble';
 const cap=$('homepageCaption'); if(cap) cap.remove();
}
async function loadGallery(){
 const refs={1:'/assets/athave-white-sneakers.webp',2:'/assets/athave-shirt.webp',3:'/assets/athave-earbuds-cutout.webp'};
 for(const slot of [1,2,3]){const pic=$('showcaseImg'+slot); if(pic) pic.src=refs[slot];}
 const feature=$('showcaseImg1')?.parentElement; if(feature){feature.classList.add('m-stone-image','m-showcase-fullview'); feature.classList.remove('m-showcase-default-cutout');}
}
function date(d){return d?new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
async function refreshEntitlement(){
 if(!authUser)return;
 const state=await request('status');entitlement=state.entitlement;customer=state.customer||customer;
 writeCache(CACHE_KEYS.session,{customer,entitlement,ts:Date.now()});renderPlan();
}
async function initSession(){
 const fresh=await post('start',{});
 customer=fresh.customer;entitlement=fresh.entitlement;
 writeCache(CACHE_KEYS.session,{customer,entitlement,ts:Date.now()});
 renderPlan();updateProfileAuth();
 return fresh;
}
function renderPlan(){
 const e=entitlement||{},free=e.active&&e.freeAccess;
 if($('planRemaining'))$('planRemaining').textContent=free?'∞':e.active?e.remaining:0;
 if($('planUsage'))$('planUsage').textContent=free?'Admin access':e.active?e.used+' / '+e.uploadCap:'No active plan';
 if($('planUntil'))$('planUntil').textContent=free?'Until revoked':e.active?date(e.periodEnd):'—';
 if($('planAction'))$('planAction').textContent=free?'My gallery →':!e.active?'Start ₹499 plan →':e.remaining===0?'Add 50 uploads →':'View plans →';
 if($('planAction'))$('planAction').href=free?'/gallery/':'/topup/';
 if($('profileRemaining'))$('profileRemaining').textContent=free?'∞':e.active?e.remaining:0;
 if($('profileEnd'))$('profileEnd').textContent=free?'Free access':e.active?date(e.periodEnd):'—';
 if($('profilePlanAction'))$('profilePlanAction').textContent=free?'View my gallery →':!e.active?'Start plan →':e.remaining===0?'Buy 50 uploads →':'Manage plan →';
 if($('profilePlanAction'))$('profilePlanAction').href=free?'/gallery/':'/topup/';
 if($('pricingBalance'))$('pricingBalance').textContent=free?'Complimentary access provided by admin':e.active?`${e.remaining} of ${e.uploadCap} uploads available`:'No active plan';
 if($('pricingDeadline'))$('pricingDeadline').textContent=free?'Access stays active until your admin ends it. Daily AI safety limits apply.':e.active?'Plan ends '+date(e.periodEnd):'Start your 30-day plan to upload photos.';
 for(const button of document.querySelectorAll('[data-buy]')){
  const kind=button.dataset.buy;button.disabled=free||(kind==='month'?!!e.active:!e.active||e.remaining>0);
  button.title=free?'Complimentary access is active':kind==='month'&&e.active?'Already active':kind==='addon'&&(!e.active||e.remaining>0)?'Available after your uploads are used':'';
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
let galleryNextOffset=0,galleryLoading=false,galleryItems=[],galleryRevision='';
let galleryObserver=null;const galleryObjectUrls=[];
async function galleryCachedPreview(img,src){
 const uid=customer?.id;if(!uid){img.src=src;return}
 const cacheName='athave-gallery-previews-v23-'+uid;
 try{
  if(!('caches' in window)){img.src=src;return}
  const cache=await caches.open(cacheName);let response=await cache.match(src);
  if(!response){
   const remote=await fetch(src,{credentials:'same-origin',cache:'no-store'});if(!remote.ok)throw Error('Preview unavailable');
   response=remote.clone();try{await cache.put(src,remote)}catch{}
   // Keep storage bounded to 40 recently loaded photos.
   const keys=await cache.keys();if(keys.length>40)await Promise.all(keys.slice(0,keys.length-40).map(key=>cache.delete(key)));
  }
  if(!img.isConnected)return;const uri=URL.createObjectURL(await response.blob());galleryObjectUrls.push(uri);img.src=uri;
 }catch{if(img.isConnected)img.src=src}
}

function galleryKey(){return customer?.id?CACHE_KEYS.gallery+customer.id:null}
function cachedGallery(){const k=galleryKey();return k?readCache(k):null}
function storeGallery(){const k=galleryKey();if(k)writeCache(k,{revision:galleryRevision,items:galleryItems.slice(0,250),nextOffset:galleryNextOffset,updatedAt:Date.now()})}
function drawCustomerGallery(){
 const root=$('galleryGrid'),more=$('galleryMore');if(!root)return;
 if(galleryObserver)galleryObserver.disconnect();galleryObjectUrls.splice(0).forEach(uri=>URL.revokeObjectURL(uri));
 galleryObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;galleryObserver?.unobserve(entry.target);galleryCachedPreview(entry.target,entry.target.dataset.previewSrc)}},{rootMargin:'180px'}):null;
 root.replaceChildren();if(!galleryItems.length)root.innerHTML='<div class="m-empty">Your finished photos will appear here as soon as our team delivers them. <a class="m-link" href="/create/">Upload photos →</a></div>';
 for(const item of galleryItems){
  const card=document.createElement('article');card.className='m-gallery-item';
  const imageLink=document.createElement('a');imageLink.href=imageUrl(item.id,'result')+'&preview=1';imageLink.target='_blank';imageLink.rel='noopener noreferrer';imageLink.className='m-gallery-image';
  const img=document.createElement('img');img.loading='lazy';img.alt='Finished image: '+item.filename;img.dataset.previewSrc=imageLink.href;imageLink.append(img);if(galleryObserver)galleryObserver.observe(img);else galleryCachedPreview(img,imageLink.href);
  const footer=document.createElement('div');footer.className='m-gallery-caption',info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');
  title.textContent=item.filename;meta.textContent=date(item.created_at);info.append(title,meta);
  const button=document.createElement('a');button.className='m-gallery-download';button.href=imageUrl(item.id,'result');button.download=item.filename;button.setAttribute('aria-label','Download '+item.filename);button.textContent='Download ↓';
  footer.append(info,button);card.append(imageLink,footer);root.append(card);
 }
 if(more)more.hidden=galleryNextOffset===null;
}
async function loadCustomerGallery(reset=false){
 const root=$('galleryGrid'),more=$('galleryMore');if(!root||galleryLoading)return;
 if(reset){
  const cache=cachedGallery();galleryItems=cache?.items||[];galleryNextOffset=cache?.nextOffset??0;galleryRevision=cache?.revision||'';
  if(cache)drawCustomerGallery();
 }
 if(!reset&&galleryNextOffset===null)return;
 galleryLoading=true;if(more){more.disabled=true;more.textContent='Checking photos…'}
 try{
  if(reset){
   // Single tiny metadata check; don't reload gallery rows when admin has not delivered anything.
   const meta=await request('gallery/version');
   if(meta.revision===galleryRevision&&cachedGallery()){msg('',false,'galleryMessage');return}
   galleryItems=[];galleryNextOffset=0;galleryRevision=meta.revision;
  }
  const data=await request('gallery/results?offset='+galleryNextOffset);
  const items=data.images||[];galleryItems=reset?items:galleryItems.concat(items.filter(x=>!galleryItems.some(y=>y.id===x.id)));
  galleryNextOffset=data.nextOffset??null;storeGallery();drawCustomerGallery();msg('',false,'galleryMessage');
 }catch(e){msg(e.message,true,'galleryMessage');if(!galleryItems.length)root.innerHTML='<div class="m-empty">Could not load your gallery. Please try again.</div>';}
 finally{galleryLoading=false;if(more){more.disabled=false;more.textContent='Load more photos ↓'}}
}
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
 if(!entitlement?.active){try{await refreshEntitlement()}catch(e){return msg(e.message,true)}}
 if(!entitlement?.active)return msg('Start your ₹499 monthly plan first.',true);
 if(!entitlement.freeAccess&&uploadFiles.length>entitlement.remaining)return msg(`You have ${entitlement.remaining} uploads remaining. Upload fewer photos or add more after using your current allowance.`,true);
 uploadBusy=true;$('sendUploads').disabled=true;uploadOverlay(true);let done=0;const total=uploadFiles.length;const progress=$('uploadProgress');progress.hidden=false;
 try{
  const batch=crypto.randomUUID();let errors=[];
  for(const file of [...uploadFiles]){
   const f=new FormData();f.set('file',file);f.set('batch',batch);
   uploadOverlay(true,'Uploading '+(done+1)+' of '+total+' photos…');$('uploadProgressText').textContent='Uploading '+file.name;$('uploadPercent').textContent=Math.round(done/total*100)+'%';$('uploadBar').style.width=Math.round(done/total*100)+'%';
   try{await request('upload',{method:'POST',body:f});done++;uploadFiles=uploadFiles.filter(x=>x!==file)}catch(e){errors.push(file.name+': '+e.message);break}
  }
  drawSelected();const state=await request('status');entitlement=state.entitlement;renderPlan();await loadUploads();
  $('uploadPercent').textContent=Math.round(done/total*100)+'%';$('uploadBar').style.width=Math.round(done/total*100)+'%';
  msg(errors.length?`${done} submitted. ${errors[0]}`:`${done} photo${done===1?'':'s'} submitted. Processing — expect results within 24 hours.`,!!errors.length);
 }catch(e){msg(e.message,true)}finally{uploadBusy=false;uploadOverlay(false);$('sendUploads').disabled=false;setTimeout(()=>{progress.hidden=true;$('uploadBar').style.width='0'},1200)}
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
function showAiAttachments(){
 const root=$('aiAttached');if(!root)return;
 root.replaceChildren();
 for(const [index,file] of aiFiles.entries()){
  const tile=document.createElement('div');tile.className='m-ai-preview';
  const image=document.createElement('img');const url=URL.createObjectURL(file);
  image.src=url;image.alt='Attached photo '+(index+1)+': '+file.name;
  image.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
  image.addEventListener('error',()=>URL.revokeObjectURL(url),{once:true});
  const remove=document.createElement('button');remove.type='button';remove.className='m-ai-preview-remove';
  remove.setAttribute('aria-label','Remove '+file.name);remove.textContent='×';
  remove.onclick=()=>{aiFiles.splice(index,1);showAiAttachments()};
  tile.append(image,remove);root.append(tile);
 }
 root.hidden=aiFiles.length===0;
}
function toggleAiImageMode(){
 const checkbox=$('aiMakeImage'),toggle=$('aiImageToggle');if(!checkbox||!toggle)return;
 checkbox.checked=!checkbox.checked;
 toggle.setAttribute('aria-pressed',String(checkbox.checked));
 toggle.classList.toggle('is-active',checkbox.checked);
}
function addAiReferencePhotos(files){
 const invalid=files.filter(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8*1048576);
 if(invalid.length)msg('Please choose JPG, PNG or WebP photos below 8 MB.',true,'aiMessage');
 const valid=files.filter(f=>['image/png','image/jpeg','image/webp'].includes(f.type)&&f.size<=8*1048576);
 if(valid.length+aiFiles.length>3)msg('You can attach up to 3 photos.',true,'aiMessage');
 aiFiles=[...aiFiles,...valid].slice(0,3);showAiAttachments();
}
async function aiSend(){const button=$('aiSend'),input=$('aiPrompt'),typed=input.value.trim();
 if(button.disabled)return;
 const mode=$('aiMakeImage').checked?'image':'chat';
 const message=typed||(aiFiles.length?(mode==='image'?'Create a professional product image using my attached photos.':'Please review my attached photos.'):'');
 if(!message)return msg('Write a message or attach a photo.',true,'aiMessage');
 if(!await signedInOrPrompt(aiSend))return;
 if(!entitlement?.active){try{await refreshEntitlement()}catch(e){return msg(e.message,true,'aiMessage')}}
 if(!entitlement?.active)return msg('Start the monthly plan to use AI Studio.',true,'aiMessage');
 button.disabled=true;button.setAttribute('aria-busy','true');aiLine('user',message);input.value='';aiLine('assistant','');const waiting=$('aiThread').lastChild;waiting.querySelector('div').innerHTML='<span class="m-dots" aria-label="AI is working"><i></i><i></i><i></i></span>';
 try{const images=await Promise.all(aiFiles.map(fileToJpeg));const history=aiMessages.slice(-8);const ans=await post('ai',{message,mode,images,history});waiting.remove();aiLine('assistant',ans.reply,ans.imageId);
 aiMessages.push({role:'user',text:message},{role:'assistant',text:ans.reply});aiFiles=[];showAiAttachments();msg('',false,'aiMessage');
 }catch(e){waiting.remove();aiLine('assistant','Request failed: '+e.message);msg(e.message,true,'aiMessage')}finally{button.disabled=false;button.removeAttribute('aria-busy');input.focus()}
}
async function boot(){
 hydrateCachedState();
 updateProfileAuth();
 if(customer||entitlement) renderPlan();
 if(page==='home'){await Promise.allSettled([showHero(),loadGallery(),getAuth().catch(()=>null)]);updateProfileAuth();return}
 await getAuth();updateProfileAuth();
 if(!authUser){
  customer=null;entitlement=null;renderPlan();
  if(page==='profile'||page==='gallery')openAuth();
  return;
 }
 try{
  await initSession();
  if(page==='create')await loadUploads();
  if(page==='gallery')await loadCustomerGallery(true)
  if(page==='profile')await loadUploads();
  if(page==='payments')await loadPayments();
 }catch(e){msg(e.message,true,page==='topup'?'paymentMessage':page==='profile'?'profileStatus':'uploadMessage')}
}
if($('galleryMore'))$('galleryMore').onclick=()=>loadCustomerGallery(false);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authUser&&['create','ai','profile','topup'].includes(page))refreshEntitlement().catch(()=>{});});
if($('manualImages'))$('manualImages').addEventListener('change',ev=>{pickFiles([...ev.target.files]);ev.target.value=''});
if($('photoDrop')){const label=$('photoDrop');label.addEventListener('dragover',e=>{e.preventDefault();label.classList.add('is-dragging')});label.addEventListener('dragleave',()=>label.classList.remove('is-dragging'));label.addEventListener('drop',e=>{e.preventDefault();label.classList.remove('is-dragging');pickFiles([...e.dataTransfer.files])})}
if($('sendUploads'))$('sendUploads').onclick=uploadAll;
for(const button of document.querySelectorAll('[data-buy]'))button.onclick=()=>payment(button.dataset.buy);
if($('profileAuthAction'))$('profileAuthAction').onclick=()=>authUser?signOut():openAuth();
if($('verifiedBadge'))$('verifiedBadge').onclick=()=>{if(!authUser)openAuth()};
if($('aiAddPhotos'))$('aiAddPhotos').onclick=()=>$('aiFiles')?.click();
if($('aiImageToggle'))$('aiImageToggle').onclick=toggleAiImageMode;
if($('aiFiles'))$('aiFiles').onchange=e=>{addAiReferencePhotos([...e.target.files]);e.target.value=''};
if($('aiAttached'))showAiAttachments();
if($('aiSend'))$('aiSend').onclick=aiSend;
if($('aiPrompt'))$('aiPrompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend()}};
boot();

if(page==='ai'){
 const fitStudio=()=>{const viewport=window.visualViewport;const height=Math.max(300,Math.round(viewport?.height||window.innerHeight));document.body.style.setProperty('--athave-visible-height',height+'px')};
 fitStudio();window.addEventListener('resize',fitStudio,{passive:true});window.visualViewport?.addEventListener('resize',fitStudio,{passive:true});
}
