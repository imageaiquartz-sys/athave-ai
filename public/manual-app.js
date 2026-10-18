/* Athave AI: verified OTP account, manual uploads, member plan and optional AI studio. */
const $=id=>document.getElementById(id);
const API='/api/manual/';
const page=document.body.dataset.page;
let customer=null, entitlement=null, subscription=null, uploadFiles=[], uploadBusy=false, aiFiles=[], aiMessages=[];
let authUser=null, authAfter=null, authOpen=false, authPendingPhone='', checkoutBusy=false;
const CACHE_KEYS={auth:'athave_auth_cache_v2',session:'athave_session_cache_v2',gallery:'athave_customer_gallery_v24_',uploads:'athave_customer_uploads_v24_'};
const SESSION_FRESH_MS=60000; // Server remains authoritative; caches only speed up verified account display.
const MAX_UPLOADS_PER_BATCH=10;
let lastEntitlementCheck=0,uploadsLastCheck=0;
const readCache=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const writeCache=(key,val)=>{try{localStorage.setItem(key,JSON.stringify(val))}catch{}};
const clearCache=key=>{try{localStorage.removeItem(key)}catch{}};
function hydrateCachedState(){
 // Never render one customer's stored data before the HttpOnly session is verified.
 if(!authUser?.id)return false;
 const s=readCache(CACHE_KEYS.session);
 if(!s?.customer || s.customer.account_customer_id!==authUser.id)return false;
 customer=s.customer;entitlement=s.entitlement||null;subscription=s.subscription||null;
 lastEntitlementCheck=s.ts||0;return true;
}
function saveSession(){if(customer?.account_customer_id===authUser?.id)writeCache(CACHE_KEYS.session,{customer,entitlement,subscription,ts:Date.now()});}
function erasePrivateCache(id){
 if(!id)return;
 clearCache(CACHE_KEYS.gallery+id);clearCache(CACHE_KEYS.uploads+id);
 if('caches' in window){Promise.all(['athave-gallery-previews-v23-','athave-private-previews-v24-'].map(prefix=>caches.delete(prefix+id))).catch(()=>{});}
}

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
 try{
  const r=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok){erasePrivateCache(customer?.id||readCache(CACHE_KEYS.session)?.customer?.id);authUser=null;customer=null;entitlement=null;subscription=null;clearCache(CACHE_KEYS.auth);clearCache(CACHE_KEYS.session);return null;}
  const verified=await r.json();if(!verified.authenticated||!verified.id){authUser=null;return null;}
  if(customer?.account_customer_id&&customer.account_customer_id!==verified.id){erasePrivateCache(customer.id);customer=null;entitlement=null;subscription=null;}
  authUser=verified;writeCache(CACHE_KEYS.auth,{user:verified,ts:Date.now()});return authUser;
 }catch{authUser=null;customer=null;entitlement=null;subscription=null;return null;}
}
async function authSuccess(){
 const old=authAfter;authAfter=null;authOpen=false;$('athaveOtpOverlay').hidden=true;
 await getAuth();await boot({verified:true});if(old)await old();
}
async function signOut(){
 try{await postPublic('auth/logout',{});erasePrivateCache(customer?.id);authUser=null;customer=null;entitlement=null;subscription=null;clearCache(CACHE_KEYS.auth);clearCache(CACHE_KEYS.session);uploadFiles=[];if($('allUploads'))$('allUploads').replaceChildren();updateProfileAuth();location.href='/profile/'}catch(e){msg(e.message,true,'profileStatus')}
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
 const state=await request('status');entitlement=state.entitlement;subscription=state.subscription||null;customer=state.customer||customer;
 lastEntitlementCheck=Date.now();saveSession();renderPlan();
}
async function initSession({force=false}={}){
 if(!force&&customer?.account_customer_id===authUser?.id&&Date.now()-lastEntitlementCheck<SESSION_FRESH_MS){
  renderPlan();updateProfileAuth();return {customer,entitlement,subscription,cached:true};
 }
 const fresh=await post('start',{});
 if(customer?.id&&customer.id!==fresh.customer?.id){erasePrivateCache(customer.id);}
 customer=fresh.customer;entitlement=fresh.entitlement;subscription=fresh.subscription||null;
 lastEntitlementCheck=Date.now();saveSession();
 renderPlan();updateProfileAuth();return fresh;
}
function proActive(){return !!(authUser&&entitlement?.active&&(entitlement.freeAccess||Date.parse(entitlement.periodEnd)>Date.now()));}
function updateProGate(){
 if(!['create','ai','gallery'].includes(page))return;
 const main=document.querySelector('main');if(!main)return;
 let gate=$('proGate');
 if(!gate){gate=document.createElement('section');gate.id='proGate';gate.className='m-pro-gate m-panel';main.prepend(gate)}
 const unlocked=proActive();main.classList.toggle('m-pro-content-locked',!unlocked);gate.hidden=unlocked;
 if(!unlocked){
  const heading=authUser?'Athave AI Pro required':'Sign in to activate Pro';
  const detail=authUser?'Your paid month has ended, or a successful ₹699 charge has not yet been confirmed. Renew to unlock uploads, AI Studio and Gallery.':'Subscribe for ₹699/month to unlock unlimited uploads, AI Studio and Gallery.';
  gate.replaceChildren();
  const icon=document.createElement('span');icon.className='m-pro-gate-icon';icon.textContent='✦';
  const title=document.createElement('h2');title.textContent=heading;
  const para=document.createElement('p');para.textContent=detail;
  const action=document.createElement('a');action.className='m-btn m-primary';action.href='/topup/';action.textContent=authUser?'View plan / Renew →':'Sign in & Subscribe →';
  gate.append(icon,title,para,action);
  if(page==='gallery'){galleryItems=[];galleryNextOffset=0;}
 }
}
function renderPlan(){
 const e=entitlement||{},free=e.active&&e.freeAccess,active=proActive();
 if($('planRemaining'))$('planRemaining').textContent=active?'∞':0;
 if($('planUsage'))$('planUsage').textContent=free?'Admin access':active?e.used+' uploaded · Unlimited':'No active plan';
 if($('planUntil'))$('planUntil').textContent=free?'Until revoked':active?date(e.periodEnd):'—';
 if($('planAction'))$('planAction').textContent=free?'My gallery →':!active?'Subscribe for ₹699 →':'Manage subscription →';
 if($('planAction'))$('planAction').href=free?'/gallery/':'/topup/';
 if($('profileRemaining'))$('profileRemaining').textContent=active?'∞':0;
 if($('profileEnd'))$('profileEnd').textContent=free?'Free access':active?date(e.periodEnd):'—';
 if($('profilePlanAction'))$('profilePlanAction').textContent=free?'View my gallery →':!active?'Subscribe for ₹699 →':'Manage subscription →';
 if($('profilePlanAction'))$('profilePlanAction').href=free?'/gallery/':'/topup/';
 if($('pricingBalance'))$('pricingBalance').textContent=free?'Complimentary unlimited access provided by admin':active?'Unlimited photo uploads included':'No active plan';
 if($('pricingDeadline'))$('pricingDeadline').textContent=free?'Access stays active until your admin ends it. AI fair-use safety limits apply.':active?((subscription?.cancelAtCycleEnd?'Access ends ':'Current paid period ends ')+date(e.periodEnd)):'Subscribe for ₹699 per month to unlock Pro.';
 updateProGate();
 const btn=document.querySelector('[data-buy="month"]');
 if(btn){btn.disabled=free||active||!!(subscription&&['created','authenticated','active','pending','halted','paused'].includes(subscription.status)&&subscription.status!=='created');
  btn.textContent=active?'Plan active':subscription?.status==='created'?'Complete subscription →':subscription?.status==='authenticated'?'Authorisation pending →':'Subscribe for ₹699/month →';}
 const status=$('subscriptionState');if(status){status.textContent=!subscription?'No recurring mandate yet.':
  subscription.cancelAtCycleEnd?'Auto-renewal stopped; you retain access through the paid period.':
  subscription.status==='active'?'Automatic monthly renewal is active.':
  subscription.status==='created'?'Subscription created. Complete the checkout to authorise recurring payments.':
  subscription.status==='authenticated'?'Mandate authorised. Waiting for first monthly charge.':
  subscription.status==='pending'||subscription.status==='halted'?'Renewal payment unsuccessful. Please check your Razorpay payment method.':
  'Subscription status: '+subscription.status+'.';}
 const cancel=$('cancelSubscription');if(cancel)cancel.hidden=!(subscription&&['created','authenticated','active','pending','halted','paused'].includes(subscription.status)&&!subscription.cancelAtCycleEnd&&!free);
}
function mimeOk(file){return ['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size>0&&file.size<=8*1048576}
function imageUrl(id,type='source'){return API+'file?kind='+encodeURIComponent(type)+'&id='+encodeURIComponent(id)}
const previewObjectUrls=[];
async function cachedPrivatePreview(img,src){
 const uid=customer?.id;if(!uid||!('caches' in window)){img.src=src;return;}
 try{
  const cache=await caches.open('athave-private-previews-v24-'+uid);
  let response=await cache.match(src);
  if(!response){
   const remote=await fetch(src,{credentials:'same-origin',cache:'no-store'});
   if(!remote.ok)throw Error('Image unavailable');
   response=remote.clone();try{
    await cache.put(src,remote);
    const keys=await cache.keys();if(keys.length>50)await Promise.all(keys.slice(0,keys.length-50).map(k=>cache.delete(k)));
   }catch{}
  }
  if(!img.isConnected)return;
  const blobUrl=URL.createObjectURL(await response.blob());previewObjectUrls.push(blobUrl);img.src=blobUrl;
 }catch{if(img.isConnected)img.src=src;}
}
function drawUploads(root,list){if(!root)return;root.replaceChildren();if(!list.length){root.innerHTML='<div class="m-empty">No uploads yet. <a href="/create/" style="text-decoration:underline">Start uploading →</a></div>';return}
 for(const x of list){const item=document.createElement('article');item.className='m-order';
  const preview=document.createElement('img');preview.className='m-order-thumb';preview.dataset.src=imageUrl(x.id);preview.alt='Uploaded product';preview.loading='lazy';
  const info=document.createElement('div');info.className='m-order-info';
  const title=document.createElement('strong');title.textContent=x.filename;
  const sub=document.createElement('small');sub.textContent=date(x.created_at);
  const status=document.createElement('span');status.className='m-badge'+(x.status==='completed'?' done':'');status.textContent=x.status==='completed'?'Ready to download':'Processing · before 24 hours';
  const files=document.createElement('div');files.className='m-results-links';
  for(const [i,out] of (x.deliveries||[]).entries()){
   const link=document.createElement('a');link.href=imageUrl(out.id,'result');link.className='m-result-link';link.download=out.filename;link.textContent='Download '+(i+1)+' ↓';files.append(link)
  }
  info.append(title,sub,status,files);item.append(preview,info);root.append(item);cachedPrivatePreview(preview,preview.dataset.src);
 }
}
function uploadsKey(){return customer?.id?CACHE_KEYS.uploads+customer.id:null;}
function savedUploads(){const key=uploadsKey(),data=key&&readCache(key);return data?.owner===authUser?.id?data:null;}
function renderUploads(list){previewObjectUrls.splice(0).forEach(url=>URL.revokeObjectURL(url));drawUploads($('allUploads'),list);drawUploads($('recentUploads'),list.slice(0,4));}
function persistUploads(items,meta){const key=uploadsKey();if(key)writeCache(key,{owner:authUser.id,items:items.slice(0,300),meta,ts:Date.now()});}
async function loadUploads({force=false}={}){
 const saved=savedUploads();if(saved&&!force)renderUploads(saved.items);
 // One tiny metadata response before deciding whether upload rows need reloading.
 // Force is used after a successful new upload or administrative change.
 const meta=await request('uploads/version');uploadsLastCheck=Date.now();
 if(!force&&saved?.meta?.revision===meta.revision&&saved?.meta?.count===meta.count)return;
 let list=null;
 if(!force&&saved?.meta?.latestUpdatedAt&&saved.meta.count!==null&&meta.count>=saved.meta.count){
  const diff=await request('uploads/changes?since='+encodeURIComponent(saved.meta.latestUpdatedAt));
  const changed=diff.uploads||[],known=new Map(saved.items.map(x=>[x.id,x]));
  changed.forEach(row=>known.set(row.id,row));
  if(known.size===Math.min(300,meta.count))list=[...known.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,300);
 }
 if(!list){const result=await request('uploads');list=result.uploads||[];}
 persistUploads(list,meta);renderUploads(list);
}
let galleryNextOffset=0,galleryLoading=false,galleryItems=[],galleryRevision='',galleryCount=null;
let galleryObserver=null;const galleryObjectUrls=[];
async function galleryCachedPreview(img,src){
 const uid=customer?.id;if(!uid){img.src=src;return}
 const cacheName='athave-private-previews-v24-'+uid;
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
function storeGallery(){const k=galleryKey(),items=galleryItems.slice(0,250);if(k)writeCache(k,{owner:authUser?.id,count:galleryCount,revision:galleryRevision,items,nextOffset:galleryNextOffset===null&&galleryItems.length<=250?null:Math.min(items.length,galleryNextOffset??items.length),updatedAt:Date.now()})}
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
 const root=$('galleryGrid'),more=$('galleryMore');if(!root||galleryLoading||!proActive())return;
 if(reset){
  const raw=cachedGallery(),cache=raw?.owner===authUser?.id?raw:null;galleryItems=cache?.items||[];galleryNextOffset=cache?.nextOffset??0;galleryRevision=cache?.revision||'';galleryCount=cache?.count??null;
  if(cache)drawCustomerGallery();
 }
 if(!reset&&galleryNextOffset===null)return;
 galleryLoading=true;if(more){more.disabled=true;more.textContent='Checking photos…'}
 try{
  if(reset){
   // Single tiny metadata check; don't reload gallery rows when admin has not delivered anything.
   const meta=await request('gallery/version');
   if(meta.revision===galleryRevision&&meta.count===galleryCount&&cachedGallery()){msg('',false,'galleryMessage');return}
   const oldCount=galleryCount;
   // An additive delivery can be merged into the cached pages without downloading old rows.
   if(galleryItems.length&&Number.isInteger(oldCount)&&meta.count>oldCount&&galleryNextOffset!==undefined){
    const d=await request('gallery/changes?after='+encodeURIComponent(galleryItems[0].created_at));
    const existingIds=new Set(galleryItems.map(x=>x.id));
    const additions=(d.images||[]).filter(x=>!existingIds.has(x.id));
    if(additions.length===meta.count-oldCount&&!d.truncated){
     galleryItems=[...additions,...galleryItems].slice(0,250);
     if(galleryNextOffset!==null)galleryNextOffset+=additions.length;
     galleryRevision=meta.revision;galleryCount=meta.count;storeGallery();drawCustomerGallery();msg('',false,'galleryMessage');return;
    }
   }
   galleryItems=[];galleryNextOffset=0;galleryRevision=meta.revision;galleryCount=meta.count;
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
  const left=document.createElement('div');const title=document.createElement('strong');title.textContent='₹699 monthly subscription';
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
function pickFiles(files){
 let rejected=0,extra=0;
 for(const file of files){
  if(!mimeOk(file)){rejected++;continue}
  if(uploadFiles.length>=MAX_UPLOADS_PER_BATCH){extra++;continue}
  uploadFiles.push(file);
 }
 drawSelected();
 if(extra)msg('Up to 10 photos per batch. Submit these first, then select the next 10. Monthly uploads are unlimited.',true);
 else if(rejected)msg('Some photos were skipped. Use JPG, PNG or WebP under 8 MB.',true);
}
async function uploadAll(){if(uploadBusy)return;
 if(!uploadFiles.length)return msg('Choose at least one image.',true);
 if(!await signedInOrPrompt(uploadAll))return;
 try{await refreshEntitlement()}catch(e){return msg(e.message,true)}
 if(!proActive()){updateProGate();return msg('An active, paid ₹699/month subscription is required to upload.',true)}
 if(uploadFiles.length>MAX_UPLOADS_PER_BATCH)return msg('Upload up to 10 photos in one batch.',true);
 uploadBusy=true;$('sendUploads').disabled=true;uploadOverlay(true);let done=0;const total=uploadFiles.length;const progress=$('uploadProgress');progress.hidden=false;
 try{
  const batch=crypto.randomUUID();let errors=[];
  for(const file of [...uploadFiles]){
   const f=new FormData();f.set('file',file);f.set('batch',batch);
   uploadOverlay(true,'Uploading '+(done+1)+' of '+total+' photos…');$('uploadProgressText').textContent='Uploading '+file.name;$('uploadPercent').textContent=Math.round(done/total*100)+'%';$('uploadBar').style.width=Math.round(done/total*100)+'%';
   try{await request('upload',{method:'POST',body:f});done++;uploadFiles=uploadFiles.filter(x=>x!==file)}catch(e){errors.push(file.name+': '+e.message);break}
  }
  drawSelected();const state=await request('status');entitlement=state.entitlement;subscription=state.subscription||subscription;customer=state.customer||customer;lastEntitlementCheck=Date.now();saveSession();renderPlan();await loadUploads({force:true});
  $('uploadPercent').textContent=Math.round(done/total*100)+'%';$('uploadBar').style.width=Math.round(done/total*100)+'%';
  msg(errors.length?`${done} submitted. ${errors[0]}`:`${done} photo${done===1?'':'s'} submitted. Processing — expect results within 24 hours.`,!!errors.length);
 }catch(e){msg(e.message,true)}finally{uploadBusy=false;uploadOverlay(false);$('sendUploads').disabled=false;setTimeout(()=>{progress.hidden=true;$('uploadBar').style.width='0'},1200)}
}
async function payment(){
 if(!await signedInOrPrompt(payment))return;
 if(checkoutBusy)return;
 if(!window.Razorpay)return msg('Razorpay checkout is unavailable. Please refresh.',true,'paymentMessage');
 checkoutBusy=true;const button=document.querySelector('[data-buy="month"]');if(button)button.disabled=true;
 try{
  const order=await post('subscription/create',{});
  subscription={id:order.subscriptionId,status:order.status,cancelAtCycleEnd:false};renderPlan();
  const checkout=new Razorpay({key:order.keyId,subscription_id:order.subscriptionId,name:'Athave AI',
   description:'Unlimited product photo uploads · ₹699/month',theme:{color:'#18191f'},
   modal:{ondismiss:()=>checkSubscription()},
   handler:async proof=>{try{
     const result=await post('subscription/verify',proof);
     entitlement=result.entitlement;await checkSubscription();
     msg(entitlement?.active?'Athave AI Pro is active. Unlimited photo uploads are unlocked!':'Payment authorisation received. Waiting for Razorpay to confirm the monthly charge.',false,'paymentMessage');
    }catch(e){msg('Authorisation could not be confirmed: '+e.message,true,'paymentMessage');await checkSubscription()}}
  });
  checkout.on('payment.failed',()=>msg('Subscription authorisation was not completed.',true,'paymentMessage'));
  checkout.open();
 }catch(e){msg(e.message,true,'paymentMessage')}finally{checkoutBusy=false;renderPlan()}
}
async function checkSubscription(){
 try{const d=await request('subscription/status');subscription=d.subscription;entitlement=d.entitlement;lastEntitlementCheck=Date.now();saveSession();renderPlan();return entitlement?.active}
 catch(e){msg(e.message,true,'paymentMessage');return false}
}
async function cancelSubscription(){
 if(!subscription||!window.confirm('Stop future ₹699 monthly charges? Your current paid access stays available until the end of this cycle.'))return;
 const btn=$('cancelSubscription');if(btn)btn.disabled=true;
 try{const data=await post('subscription/cancel',{});entitlement=data.entitlement;await checkSubscription();msg(data.atCycleEnd?'Auto-renewal cancelled. Access stays until this paid period ends.':'Unpaid subscription authorisation cancelled.',false,'paymentMessage')}
 catch(e){msg(e.message,true,'paymentMessage')}finally{if(btn)btn.disabled=false}
}
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
 try{await refreshEntitlement()}catch(e){return msg(e.message,true,'aiMessage')}
 if(!proActive()){updateProGate();return msg('An active, paid ₹699/month subscription is required for AI Studio.',true,'aiMessage')}
 button.disabled=true;button.setAttribute('aria-busy','true');aiLine('user',message);input.value='';aiLine('assistant','');const waiting=$('aiThread').lastChild;waiting.querySelector('div').innerHTML='<span class="m-dots" aria-label="AI is working"><i></i><i></i><i></i></span>';
 try{const images=await Promise.all(aiFiles.map(fileToJpeg));const history=aiMessages.slice(-8);const ans=await post('ai',{message,mode,images,history});waiting.remove();aiLine('assistant',ans.reply,ans.imageId);
 aiMessages.push({role:'user',text:message},{role:'assistant',text:ans.reply});aiFiles=[];showAiAttachments();msg('',false,'aiMessage');
 }catch(e){waiting.remove();aiLine('assistant','Request failed: '+e.message);msg(e.message,true,'aiMessage')}finally{button.disabled=false;button.removeAttribute('aria-busy');input.focus()}
}
async function boot({verified=false}={}){
 if(page==='home'){await Promise.allSettled([showHero(),loadGallery(),getAuth().catch(()=>null)]);updateProfileAuth();return;}
 // Read cache only after the verified cookie identity is checked with the server.
 if(!verified)await getAuth();if(authUser)hydrateCachedState();updateProfileAuth();updateProGate();
 if(customer||entitlement)renderPlan();
 if(!authUser){
  customer=null;entitlement=null;renderPlan();
  if(page==='profile'||page==='gallery')openAuth();
  return;
 }
 try{
  await initSession({force:['create','ai','gallery'].includes(page)});
  // Revalidate the server-verified entitlement on every Pro page opening.
  if(page==='topup')await checkSubscription();
  if(page==='create'&&proActive())await loadUploads();
  if(page==='gallery'&&proActive())await loadCustomerGallery(true)
  if(page==='profile')await loadUploads();
  if(page==='payments')await loadPayments();
 }catch(e){msg(e.message,true,page==='topup'?'paymentMessage':page==='profile'?'profileStatus':'uploadMessage')}
}
if($('galleryMore'))$('galleryMore').onclick=()=>loadCustomerGallery(false);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden||!authUser)return;
 if(Date.now()-lastEntitlementCheck>SESSION_FRESH_MS&&['create','ai','profile','topup','gallery'].includes(page))refreshEntitlement().catch(()=>{});
 if(Date.now()-uploadsLastCheck>SESSION_FRESH_MS&&['create','profile'].includes(page))loadUploads().catch(()=>{});
 if(page==='gallery'&&proActive())loadCustomerGallery(true).catch(()=>{});
});
if($('manualImages'))$('manualImages').addEventListener('change',ev=>{pickFiles([...ev.target.files]);ev.target.value=''});
if($('photoDrop')){const label=$('photoDrop');label.addEventListener('dragover',e=>{e.preventDefault();label.classList.add('is-dragging')});label.addEventListener('dragleave',()=>label.classList.remove('is-dragging'));label.addEventListener('drop',e=>{e.preventDefault();label.classList.remove('is-dragging');pickFiles([...e.dataTransfer.files])})}
if($('sendUploads'))$('sendUploads').onclick=uploadAll;
for(const button of document.querySelectorAll('[data-buy]'))button.onclick=payment;
if($('cancelSubscription'))$('cancelSubscription').onclick=cancelSubscription;
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
