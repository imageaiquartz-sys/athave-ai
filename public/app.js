/* Athave AI - unified frontend: Cloudflare Pages + service-role backed API. */
const $ = id => document.getElementById(id);
const page = document.body.dataset.page;
let config = null, me = null, lastAuthError = null, verifying = false, generating = false;
let currentPhone = '', activePayment = null;
let selected = [];
const MAX_PHOTOS=6;
let loadingStarted=0;
let analysisPlan=null, analyzedImages=null;
const chosenOutputs=new Set();
const MAX_SELECTABLE_OUTPUTS=8;
const pendingTimer = { start: 0 };
const homeUrl = location.pathname + location.search;
function show(node, state) { if (node) node.hidden = !state; }
function toast(msg, isError = false) {
 const node = $('toast'); if (!node) return;
 node.textContent = msg; node.hidden = false; node.style.background = isError ? '#a5222e' : '#15171b';
 clearTimeout(window.__athaveToast); window.__athaveToast = setTimeout(() => node.hidden = true, 5500);
}
function pageStatus(msg, error = false) {
 const node = $('studioStatus') || $('profileStatus') || $('paymentStatus');
 if (node) { node.textContent = msg; node.classList.toggle('error', error); }
 else toast(msg, error);
}
function authStatus(msg, error = false) {
 if ($('authMsg')) { $('authMsg').textContent = msg; $('authMsg').classList.toggle('error', error); }
}
async function api(route, options = {}) {
 const response = await fetch('/api/' + route, { credentials:'same-origin', cache:'no-store', ...options });
 const json = await response.json().catch(() => ({}));
 if (!response.ok) {
  if(response.status===401 && !route.startsWith('auth/'))clearAccount();
  const ex = new Error(json.error || 'Request failed (HTTP ' + response.status + ')'); ex.status = response.status; throw ex;
 }
 return json;
}
function post(route, value) { return api(route, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(value) }); }
function setAuthStep(step) {
 for (const id of ['phoneForm','otpForm','nameForm']) show($(id), id === step);
}
let authIsOpen = false;
let postLoginAction = null;
function openLogin(after = null) {
 if (typeof after === 'function') postLoginAction = after;
 if (authIsOpen) return;
 authIsOpen = true; show($('authOverlay'),true); setAuthStep('phoneForm'); authStatus('');
 const url = location.pathname + location.search + '#login';
 if (location.hash !== '#login') history.pushState({ athaveLogin:true }, '', url);
 setTimeout(()=>$('phone')?.focus(), 20);
}
function closeLogin(useBack = false) {
 if (!authIsOpen) return;
 authIsOpen = false; show($('authOverlay'),false); authStatus('');
 if (location.hash === '#login') {
  if (useBack) history.back();
  else history.replaceState({}, '', location.pathname + location.search);
 }
}
window.addEventListener('popstate',() => {
 if (authIsOpen && location.hash !== '#login') { authIsOpen = false; show($('authOverlay'),false); authStatus(''); }
});
if ($('closeAuth')) $('closeAuth').onclick = ()=>closeLogin(true);
if ($('modalShade')) $('modalShade').onclick = ()=>closeLogin(true);
document.addEventListener('keydown', e=>{if(e.key==='Escape' && authIsOpen)closeLogin(true)});
if ($('backBtn')) $('backBtn').onclick=()=>{
 if(authIsOpen){closeLogin(true);return}
 try { if (document.referrer && new URL(document.referrer).origin === location.origin) { history.back(); return; } } catch {}
 const fallback = page==='history'||page==='payments' ? '/profile/' : '/';
 location.href=fallback;
};
// Authentication stays in an HttpOnly cookie. A short-lived, per-tab display cache
// removes redundant DB calls when navigating back to the profile; never store OTPs/tokens.
const ACCOUNT_KEY='athave_account_v4', ACCOUNT_TTL=300000;
let sectionLoaded={}; let accountRequest=null;
function sectionForPage(){return page==='history'?'history':page==='payments'?'payments':'profile'}
function saveAccount(){try{sessionStorage.setItem(ACCOUNT_KEY,JSON.stringify({me,sectionLoaded}))}catch{}}
function restoreAccount(){
 try{
  const obj=JSON.parse(sessionStorage.getItem(ACCOUNT_KEY)||'null');
  if(obj?.me?.user && obj.sectionLoaded && Object.values(obj.sectionLoaded).some(t=>Date.now()-t<ACCOUNT_TTL)){
   me=obj.me;sectionLoaded=obj.sectionLoaded;renderUser();return true;
  }
 }catch{}return false;
}
function clearAccount(){me=null;sectionLoaded={};try{sessionStorage.removeItem(ACCOUNT_KEY)}catch{}renderUser()}
function invalidateSection(section){sectionLoaded[section]=0;saveAccount()}
async function refresh({required=false,quiet=false,force=false,section=sectionForPage()}={}){
 if(!force && me?.user && Date.now()-(sectionLoaded[section]||0)<ACCOUNT_TTL){renderUser();return me;}
 if(accountRequest && !force)return accountRequest;
 const run=(async()=>{
  try{
   const fresh=await api('me?section='+encodeURIComponent(section));
   me={...(me||{}),...fresh};sectionLoaded[section]=Date.now();lastAuthError=null;
   saveAccount();renderUser();return me;
  }catch(e){
   lastAuthError=e;
   if(e.status===401){clearAccount();if(required)throw e;return null}
   if(!quiet)pageStatus('Could not load your account: '+e.message,true);
   if(required)throw e;
   return me;
  }
 })();
 accountRequest=run;
 try{return await run}finally{if(accountRequest===run)accountRequest=null}
}
function renderUser(){
 const signed=!!me?.user;
 if($('profileName'))$('profileName').textContent=me?.user?.name||'Your account';
 if($('profilePhone'))$('profilePhone').textContent=me?.user?.phone?'+'+me.user.phone:'Sign in with your phone number';
 if($('profileVerified')){
  $('profileVerified').textContent=signed?'Verified':'Sign in';
  $('profileVerified').setAttribute('aria-label',signed?'Verified account':'Sign in');
  $('profileVerified').setAttribute('aria-disabled',String(signed));
 }
 if($('signActionLabel'))$('signActionLabel').textContent=signed?'Log out':'Log in';
 if($('signOut')){
  $('signOut').setAttribute('aria-label',signed?'Log out':'Log in');
  $('signOut').classList.toggle('login-row',!signed);
  $('signOut').classList.toggle('logout-row',signed);
 }
 const signIcon=$('signActionIcon');
 if(signIcon){
  signIcon.innerHTML=signed
   ? '<path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5M10 8l-4 4 4 4M6 12h11"></path>'
   : '<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"></path><path d="M14 8l4 4-4 4"></path><path d="M10 12h8"></path>';} 
 if($('walletRemaining'))$('walletRemaining').textContent=me?.wallet?.balance??'—';
 if($('walletPurchased'))$('walletPurchased').textContent=me?.wallet?.purchased??'—';
 if($('walletUsed'))$('walletUsed').textContent=me?.wallet?.used??'—';
 if($('uploadWallet'))$('uploadWallet').textContent=me?.wallet?.balance??'—';
  if($('progressFill'))$('progressFill').style.width=me?.wallet?.purchased?Math.min(100,100*me.wallet.used/me.wallet.purchased)+'%':'0%';
 for(const badge of document.querySelectorAll('.header-admin-badge'))show(badge,!!me?.user?.isAdmin);
 if(page==='history')renderHistory();
 if(page==='payments')renderPayments();
}
if($('profileVerified'))$('profileVerified').addEventListener('click',e=>{e.preventDefault();if(!me?.user)openLogin()});
window.addEventListener('storage',e=>{if(e.key==='athave_auth_changed')clearAccount()});
async function ensureLogin(next){
 if(me?.user&&Date.now()-(sectionLoaded.profile||0)<ACCOUNT_TTL)return true;
 try {await refresh({required:true,quiet:true,section:'profile'});if(me?.user)return true;openLogin(next);return false}
 catch(e){if(e.status===401){openLogin(next);return false}pageStatus('Account unavailable: '+e.message,true);return false}
}
async function loginSuccess() {
 try {
  clearAccount();
  await refresh({required:true,quiet:true,force:true,section:sectionForPage()});
  if (!me) throw new Error('Your account could not be loaded yet.');
  try{localStorage.setItem('athave_auth_changed',String(Date.now()))}catch{}
  closeLogin(false);
  authStatus('');
  $('otp').value=''; $('name').value='';
  toast('Signed in successfully. Welcome to Athave AI!');
  let callback=postLoginAction;postLoginAction=null;
  if (callback) await callback();

  else if(page==='profile'||page==='history'||page==='payments') renderUser();
 } catch (e) {
  authStatus('OTP was accepted but the account session did not load: ' + e.message, true);
 }
}
$('phoneForm').onsubmit = async ev => {
 ev.preventDefault(); const raw=$('phone').value.replace(/\D/g,'');
 if(!/^[6-9]\d{9}$/.test(raw))return authStatus('Enter a valid Indian mobile number',true);
 currentPhone='91'+raw;
 const btn=$('phoneForm').querySelector('button[type=submit]'); btn.disabled=true;
 try { authStatus('Sending OTP to +'+currentPhone+'…'); await post('auth/send-otp',{phone:currentPhone}); setAuthStep('otpForm'); authStatus('SMS sent. Enter your OTP.'); }
 catch(e){authStatus(e.message,true)} finally{btn.disabled=false}
};
$('otpForm').onsubmit = async ev => {
 ev.preventDefault(); if(verifying)return;
 const code=$('otp').value.trim(); if(!/^\d{4,8}$/.test(code))return authStatus('Enter the OTP code',true);
 verifying=true; const btn=$('otpForm').querySelector('button[type=submit]');btn.disabled=true;
 try {
  authStatus('Verifying…'); const result=await post('auth/verify-otp',{otp:code});
  if(result.needsName){setAuthStep('nameForm');authStatus('Verified! Enter your name to finish creating your account.');}
  else await loginSuccess();
 }catch(e){authStatus(e.message,true)}finally{verifying=false;btn.disabled=false}
};
$('nameForm').onsubmit=async ev=>{
 ev.preventDefault();let name=$('name').value.trim(); if(!name)return authStatus('Please enter your name',true);
 const btn=$('nameForm').querySelector('button[type=submit]');btn.disabled=true;
 try{await post('auth/complete',{name});await loginSuccess()}catch(e){authStatus(e.message,true)}finally{btn.disabled=false}
};
$('retryOtp').onclick=async()=>{
 if(Date.now()-pendingTimer.start < 15000)return authStatus('Please wait before resending.');
 pendingTimer.start=Date.now();
 try{await post('auth/send-otp',{phone:currentPhone});authStatus('A fresh OTP was sent.')}catch(e){authStatus(e.message,true)}
};
$('changePhone').onclick=()=>{setAuthStep('phoneForm');$('otp').value='';authStatus('')};
async function signOut(){
 if(!me?.user){openLogin();return}
 try{await post('auth/logout',{});clearAccount();try{localStorage.setItem('athave_auth_changed',String(Date.now()))}catch{}toast('Signed out')}
 catch(e){toast(e.message,true)}
}
if($('signOut'))$('signOut').onclick=signOut;
// Unified multiple-photo input. Each reference can be tagged Front, Back or Detail.
function formatBytes(bytes){return bytes<1048576?Math.round(bytes/1024)+' KB':(bytes/1048576).toFixed(1)+' MB'}
function assignPhotos(files){
 if(!files?.length)return;
 const accepted=[];
 for(const file of files){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>7*1048576){toast('Use JPG, PNG or WebP under 7 MB.',true);continue}
  if(selected.some(x=>x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;
  if(selected.length+accepted.length>=MAX_PHOTOS){toast('Up to '+MAX_PHOTOS+' photos per batch.',true);break}
  accepted.push({file,role:selected.length+accepted.length===0?'front':'detail'});
 }
 if(!accepted.length)return;
 selected.push(...accepted);renderPhotoList();invalidateAnalysis();
}
function renderPhotoList(){
 const root=$('productPreviews');if(!root)return;root.replaceChildren();
 selected.forEach((entry,index)=>{
  const item=document.createElement('div');item.className='product-photo';
  const pic=document.createElement('img');const objectUrl=URL.createObjectURL(entry.file);pic.src=objectUrl;pic.onload=()=>URL.revokeObjectURL(objectUrl);pic.alt='Reference '+(index+1);
  const info=document.createElement('div');info.className='photo-info';
  const title=document.createElement('b');title.textContent=entry.file.name;
  const bytes=document.createElement('small');bytes.textContent=formatBytes(entry.file.size);
  info.append(title,bytes);
  const label=document.createElement('label');label.className='photo-role';label.textContent='View';
  const select=document.createElement('select');select.setAttribute('aria-label','Photo '+(index+1)+' view');
  for(const [value,text] of [['front','Front'],['back','Back'],['detail','Detail / Other']]){
   const op=document.createElement('option');op.value=value;op.textContent=text;op.selected=entry.role===value;select.append(op);
  }
  select.onchange=()=>{entry.role=select.value;invalidateAnalysis()};label.append(select);
  const remove=document.createElement('button');remove.type='button';remove.className='photo-remove';remove.textContent='×';remove.setAttribute('aria-label','Remove photo '+(index+1));
  remove.onclick=()=>{selected.splice(index,1);renderPhotoList();invalidateAnalysis()};
  item.append(pic,info,label,remove);root.append(item);
 });
 if($('uploadCount'))$('uploadCount').textContent=selected.length?`${selected.length} / ${MAX_PHOTOS} photos selected`:'No photos selected';
}
if($('productFiles'))$('productFiles').onchange=e=>{assignPhotos([...e.target.files]);e.target.value=''};
if($('productDrop')){
 const drop=$('productDrop');
 drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('is-dragging')});
 drop.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));
 drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-dragging');assignPhotos([...e.dataTransfer.files])});
}
function loader(title,message,count='',percent=0){
 const modal=$('studioLoader');if(!modal)return;
 modal.hidden=false;
 $('loaderTitle').textContent=title;
 $('loaderMessage').textContent=message;
 $('loaderCount').textContent=count;
 $('loaderProgress').style.width=Math.max(5,Math.min(100,percent))+'%';
 document.body.classList.add('is-studio-busy');
}
function hideLoader(){show($('studioLoader'),false);document.body.classList.remove('is-studio-busy')}
const outputBackground=()=> 'white';
async function encodePhoto(file){
 let bmp=await createImageBitmap(file),scale=Math.min(1,900/Math.max(bmp.width,bmp.height));
 let c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);
 let ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bmp,0,0,c.width,c.height);bmp.close();
 let data=c.toDataURL('image/jpeg',.67).split(',')[1];if(data.length>1600000)throw Error('This photo is too large after optimization. Use a smaller one.');
 return {mime:'image/jpeg',data};
}
function storeResults(list){sessionStorage.setItem('athave_recent_results', JSON.stringify(list));}
function storedResults(){try{return JSON.parse(sessionStorage.getItem('athave_recent_results')||'[]')}catch{return []}}
function invalidateAnalysis(){
 analysisPlan=null;analyzedImages=null;chosenOutputs.clear();
 show($('selectionPanel'),false);
 if($('analyzeBtn')){$('analyzeBtn').disabled=false;$('analyzeBtn').textContent='Analyze photos';show($('analyzeBtn'),true)}
 show($('selectionPanel'),false);show($('uploadStage'),true);show($('studioControls'),true);show($('studioTitle'),true);
 if($('studioStepper')){const spans=$('studioStepper').querySelectorAll('span');if(spans.length>1){spans[0].className='active';spans[1].className=''}}
 updateSelection();
}
function updateSelection(){
 const total=chosenOutputs.size;
 if($('selectedCount'))$('selectedCount').textContent=String(total);
 if($('generateBtn'))$('generateBtn').disabled=!analysisPlan||!total||generating;
 if($('generateLabel'))$('generateLabel').textContent=total?`Generate ${total} image${total===1?'':'s'}`:'Choose your views';
}
function renderSelectionCards(){
 const root=$('detectedItems');if(!root)return;root.replaceChildren();
 for(const item of analysisPlan?.items||[]){
  const wrapper=document.createElement('div');wrapper.className='detected-item';
  const heading=document.createElement('div');heading.className='detected-heading';
  const title=document.createElement('strong');title.textContent=item.name||item.kind;
  const subtitle=document.createElement('span');subtitle.textContent=item.kind||'';
  heading.append(title,subtitle);wrapper.append(heading);
  const row=document.createElement('div');row.className='view-choices';
  for(const view of item.views){
   const key=item.id+'|'+view;
   const btn=document.createElement('button');btn.type='button';btn.className='view-card';btn.setAttribute('aria-pressed','false');btn.dataset.key=key;
   const glyph=document.createElement('span');glyph.className='view-card-icon';glyph.innerHTML=view==='front'?'<svg viewBox="0 0 24 24"><path d="M12 20V4m-6 6 6-6 6 6"/></svg>':view==='back'?'<svg viewBox="0 0 24 24"><path d="M12 4v16m-6-6 6 6 6-6"/></svg>':view==='side'?'<svg viewBox="0 0 24 24"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>':'<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6v6"/></svg>';
   const words=document.createElement('span');words.className='view-card-label';words.textContent=analysisPlan.views?.[view]||view;
   const unit=document.createElement('small');unit.textContent='White background';
   btn.append(glyph,words,unit);
   btn.onclick=()=>{
    if(chosenOutputs.has(key))chosenOutputs.delete(key);
    else chosenOutputs.add(key);
    for(const card of root.querySelectorAll('.view-card')){const active=chosenOutputs.has(card.dataset.key);card.classList.toggle('is-selected',active);card.setAttribute('aria-pressed',String(active))}
    updateSelection();pageStatus('');
   };
   row.append(btn);
  }
  wrapper.append(row);root.append(wrapper);
 }
 updateSelection();
}
async function analyzePhotos(){
 if(!selected.length)return pageStatus('Add at least one product photo.',true);
 if(!await ensureLogin(analyzePhotos))return;
 const btn=$('analyzeBtn');if(!btn)return;
 btn.disabled=true;
 try{
  loader('Preparing photos','Optimizing your product references…');
  const images=await Promise.all(selected.map(x=>encodePhoto(x.file)));
  const roles=selected.map(x=>x.role);
  loader('Analyzing photos','Identifying products and their visible details…','',34);
  const result=await post('analyze',{images,roles});
  if(!result.items?.length||!result.analysisToken)throw Error('No products were identified. Try another photo.');
  analyzedImages=images;analyzedRoles=roles;analysisPlan=result;chosenOutputs.clear();
  renderSelectionCards();show($('selectionPanel'),true);show($('uploadStage'),false);show($('studioControls'),false);show($('studioTitle'),false);
  if($('studioStepper')){const spans=$('studioStepper').querySelectorAll('span');if(spans.length>1){spans[0].className='done';spans[1].className='active'}}
  if($('studioStepper')){$('studioStepper').classList.add('on-choose')}
  pageStatus('');hideLoader();
  $('selectionPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){hideLoader();pageStatus(e.message,true)}finally{btn.disabled=false}
}
let analyzedRoles=null;
async function generate(){
 if(generating||!analysisPlan||!analyzedImages)return;
 const targets=[...chosenOutputs].map(key=>{const [itemId,view]=key.split('|');const item=analysisPlan.items.find(x=>x.id===itemId);return item?{itemId,view,item}:null}).filter(Boolean);
 if(!targets.length)return pageStatus('Choose at least one image view.',true);
 if(!await ensureLogin(generate))return;
 generating=true;const background=outputBackground();updateSelection();let made=[],errors=[];
 try{
  for(let i=0;i<targets.length;i++){
   const target=targets[i],label=`${target.item.name} — ${analysisPlan.views[target.view]}`;
   loader('Creating your images',`Generating ${target.item.name} · ${analysisPlan.views[target.view]} · Pure white background`,`${i+1} of ${targets.length}`,Math.round(5+80*i/targets.length));
   try{
    const job=await post('generate',{images:analyzedImages,roles:analyzedRoles,analysisToken:analysisPlan.analysisToken,itemId:target.itemId,view:target.view,background});
    made.push({id:job.id,label:job.label||label,kind:job.kind,side:job.side});storeResults(made);
   }catch(e){errors.push(`${label}: ${e.message}`);break}
  }
  if(made.length){
   loader('Finishing images','Opening your generated photos…','',100);
   invalidateSection('history');invalidateSection('profile');storeResults(made);
   if(errors.length)sessionStorage.setItem('athave_generation_warning',errors.join(' · '));
   location.href='/results/';return;
  }
  if(errors.length)pageStatus(errors[0],true);
 }catch(e){pageStatus(e.message,true)}finally{generating=false;updateSelection();hideLoader();invalidateSection('profile');}
}
if($('analyzeBtn'))$('analyzeBtn').onclick=analyzePhotos;
if($('changePhotosBtn'))$('changePhotosBtn').onclick=()=>{invalidateAnalysis();analyzedImages=null;analyzedRoles=null;if($('studioStepper'))$('studioStepper').classList.remove('on-choose')};
if($('generateBtn'))$('generateBtn').onclick=generate;
// Images downloaded via authenticated private endpoint and browser WebP conversion.
async function optimizedWebp(id){
 const response=await fetch('/api/images/'+id,{credentials:'same-origin',cache:'default'});if(!response.ok)throw Error('Could not load generated image');
 const bmp=await createImageBitmap(await response.blob());const c=document.createElement('canvas');c.width=1024;c.height=1024;
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1024,1024);
 const scale=Math.min(1024/bmp.width,1024/bmp.height);const w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale);
 ctx.drawImage(bmp,(1024-w)/2,(1024-h)/2,w,h);bmp.close();
 let blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',.82));if(!blob||blob.type!=='image/webp')throw Error('WebP export not supported on this browser');
 for(const q of [.7,.62,.54]) {if(blob.size<=350000)break;let smaller=await new Promise(resolve=>c.toBlob(resolve,'image/webp',q));if(smaller)blob=smaller}
 return blob;
}
async function getOptimized(id){
 const blob=await optimizedWebp(id);
 // Save compressed copy back to private Supabase storage. Failure does not prevent download.
 fetch('/api/images/'+id+'/webp',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/webp'},body:blob}).catch(()=>{});
 return blob;
}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),link=document.createElement('a');link.href=u;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)}
function safeName(name){return 'athave-ai-'+String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,55)}
async function downloadSingle(item){try{pageStatus('Preparing WebP download…');const blob=await getOptimized(item.id);downloadBlob(blob,safeName(item.label)+'.webp');pageStatus('Downloaded 1024 × 1024 WebP · '+formatBytes(blob.size))}catch(e){pageStatus(e.message,true)}}
function buildOutputCard(item){
 const card=document.createElement('article');card.className='output-card';
 const image=document.createElement('div');image.className='output-image';
 const pic=document.createElement('img');pic.src='/api/images/'+encodeURIComponent(item.id);pic.alt=item.label;pic.loading='lazy';image.append(pic);
 const footer=document.createElement('div');footer.className='output-footer';const desc=document.createElement('div');
 const strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=item.label;small.textContent='1024 × 1024 · WebP';desc.append(strong,small);
 const btn=document.createElement('button');btn.type='button';btn.textContent='Download ↓';btn.onclick=()=>downloadSingle(item);footer.append(desc,btn);card.append(image,footer);return card;
}
async function populateResults(){
 let list=storedResults();if(!list.length){let user=await refresh({quiet:true,section:'history'});if(user){list=(user.history||[]).filter(x=>x.status==='completed').slice(0,8).map(x=>({id:x.id,label:x.kind+' — '+x.side}))}}
 const root=$('resultsGrid');root.replaceChildren();if(!list.length){root.innerHTML='<div class="empty-card">No generated images yet. <a href="/create/" style="text-decoration:underline">Create your first product photo</a>.</div>';return}
 for(const item of list)root.append(buildOutputCard(item));
 const warning=sessionStorage.getItem('athave_generation_warning');if(warning){sessionStorage.removeItem('athave_generation_warning');pageStatus('Some views could not be generated: '+warning,true)}
}
// ZIP encoder (store-only, no dependency). WebP is already compressed.
function crc32(bytes){let v=0xffffffff;for(let b of bytes){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0)}return (v^0xffffffff)>>>0}
function u16(out,num){out.push(num&255,(num>>>8)&255)}
function u32(out,num){out.push(num&255,(num>>>8)&255,(num>>>16)&255,(num>>>24)&255)}
async function zipResults(items){
 const files=[];for(let i=0;i<items.length;i++){pageStatus('Preparing '+(i+1)+' of '+items.length+' WebP files…');let b=await getOptimized(items[i].id);files.push({name:safeName(items[i].label)+'-'+(i+1)+'.webp',bytes:new Uint8Array(await b.arrayBuffer())})}
 let chunks=[],entries=[],offset=0;let te=new TextEncoder();
 for(const f of files){let name=te.encode(f.name),crc=crc32(f.bytes),local=[];u32(local,0x04034b50);u16(local,20);u16(local,0);u16(local,0);u16(local,0);u16(local,0);u32(local,crc);u32(local,f.bytes.length);u32(local,f.bytes.length);u16(local,name.length);u16(local,0);
 chunks.push(new Uint8Array(local),name,f.bytes);entries.push({name,crc,length:f.bytes.length,offset});offset+=local.length+name.length+f.bytes.length;}
 let center=[];
 for(const f of entries){u32(center,0x02014b50);u16(center,20);u16(center,20);u16(center,0);u16(center,0);u16(center,0);u16(center,0);u32(center,f.crc);u32(center,f.length);u32(center,f.length);u16(center,f.name.length);u16(center,0);u16(center,0);u16(center,0);u16(center,0);u32(center,0);u32(center,f.offset);center.push(...f.name)}
 const cdSize=center.length;chunks.push(new Uint8Array(center));let end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,entries.length);u16(end,entries.length);u32(end,cdSize);u32(end,offset);u16(end,0);chunks.push(new Uint8Array(end));
 return new Blob(chunks,{type:'application/zip'});
}
if($('downloadAllBtn'))$('downloadAllBtn').onclick=async()=>{
 const list=storedResults();if(!list.length)return pageStatus('No recent results found.',true);
 const btn=$('downloadAllBtn');btn.disabled=true;try{downloadBlob(await zipResults(list),'athave-ai-results.zip');pageStatus('All results downloaded as ZIP.')}catch(e){pageStatus(e.message,true)}finally{btn.disabled=false}
};
function renderHistory(){let root=$('historyList');if(!root || !me)return;root.replaceChildren();let list=me.history||[];if(!list.length){root.innerHTML='<div class="empty-card">No generated photos yet. <a href="/create/" style="text-decoration:underline">Create one</a>.</div>';return}
 for(const j of list){let row=document.createElement('div');row.className='history-row';if(j.status==='completed'){let img=document.createElement('img');img.src='/api/images/'+j.id;img.alt=j.kind+' '+j.side;img.loading='lazy';row.append(img)}let div=document.createElement('div');div.className='row-text';let name=document.createElement('strong'),date=document.createElement('small');name.textContent=j.kind+' — '+j.side;date.textContent=j.status+' · '+new Date(j.created_at).toLocaleString('en-IN');div.append(name,date);row.append(div);if(j.status==='completed'){let btn=document.createElement('button');btn.className='small-download';btn.textContent='Download ↓';btn.onclick=()=>downloadSingle({id:j.id,label:j.kind+' '+j.side});row.append(btn)}root.append(row)}
}
function renderPayments(){let root=$('paymentList');if(!root||!me)return;root.replaceChildren();let list=me.payments||[];if(!list.length){root.innerHTML='<div class="empty-card">No payments yet. <a href="/topup/" style="text-decoration:underline">See pricing</a>.</div>';return}for(const p of list){let row=document.createElement('div');row.className='payment-row';const div=document.createElement('div');div.className='row-text';const a=document.createElement('strong'),b=document.createElement('small');a.textContent='₹'+(p.amount_paise/100).toFixed(0)+' · '+p.plan;b.textContent=p.status+' · '+new Date(p.created_at).toLocaleString('en-IN');div.append(a,b);row.append(div);root.append(row)}}
// Razorpay Checkout: new server-side order for each charge; only captured payment adds credits.
let paymentInProgress=false;
async function awaitPaymentCapture(orderId){
 for(let i=0;i<7;i++){
  const checked=await api('payments/status?orderId='+encodeURIComponent(orderId));
  if(checked.paid){invalidateSection('profile');invalidateSection('payments');await refresh({required:true,force:true,section:'profile'});return true;}
  if(i<6)await new Promise(resolve=>setTimeout(resolve,2200));
 }
 return false;
}
async function pay(plan, amount){
 if(paymentInProgress){pageStatus('A payment is already in progress. Please wait.',true);return;}
 if(!await ensureLogin(()=>pay(plan,amount)))return;
 if(!config?.payments)return pageStatus('Payments are not enabled yet. Please try again later.',true);
 paymentInProgress=true;
 try{
  if(!window.Razorpay)throw Error('Razorpay checkout failed to load. Please reconnect and try again.');
  pageStatus('Creating secure Razorpay payment order…');
  const order=await post('payments/order',{plan,amount});
  const checkout=new window.Razorpay({
   key:order.keyId,amount:order.amount,currency:'INR',order_id:order.orderId,
   name:'Athave AI',description:'One-time image credits',
   prefill:{contact:me?.user?.phone?.slice(2)||''},theme:{color:'#111418'},
   handler:async data=>{
    try{
     pageStatus('Verifying your captured payment…');
     try{await post('payments/verify',data)}catch(e){
      // Authorized payments can take time to capture; never mark paid prematurely.
      if(!/captur|temporar|gateway|Database operation failed/i.test(e.message))throw e;
     }
     const paid=await awaitPaymentCapture(order.orderId);
     if(paid){pageStatus('Payment confirmed. Image credits added!');toast('Top-up successful!')}
     else pageStatus('Payment received by Razorpay but capture is pending. Do not pay again. Your credits will be added automatically once captured.',true);
    }catch(e){pageStatus('Could not confirm payment: '+e.message+'. Check Payment History before paying again.',true)}
    finally{paymentInProgress=false}
   },
   modal:{ondismiss:()=>{paymentInProgress=false;pageStatus('Payment window closed. No credits were added unless a payment was captured.')}}
  });
  checkout.on('payment.failed',()=>{paymentInProgress=false;pageStatus('Payment was not completed. Try again only after checking Payment History.',true)});
  checkout.open();
 }catch(e){paymentInProgress=false;pageStatus(e.message,true)}
}
for(const btn of document.querySelectorAll('.pay-btn'))btn.onclick=()=>{
 const plan=btn.dataset.plan;let amount=null;
 if(plan==='custom'){amount=Number($('customAmount')?.value);if(!Number.isInteger(amount)||amount<100||amount>10000)return pageStatus('Enter an amount between ₹100 and ₹10,000.',true)}
 pay(plan,amount)
};

// Customer redeem codes: backend verifies account and atomically adds credits.
const redeemForm=$('redeemForm');
if(redeemForm)redeemForm.onsubmit=async event=>{
 event.preventDefault();const button=redeemForm.querySelector('button'); const code=$('redeemInput').value.trim().toUpperCase();
 if(!/^[A-Z0-9-]{8,40}$/.test(code)){ $('redeemStatus').textContent='Enter a valid redeem code.';return }
 button.disabled=true; $('redeemStatus').textContent='Checking your code…';
 try{const data=await post('redeem',{code});invalidateSection('profile');await refresh({required:true,force:true,section:'profile'});$('redeemInput').value='';$('redeemStatus').textContent=`Success! ${data.credits} credits added to your account.`;toast(`${data.credits} image credits added.`)}
 catch(e){$('redeemStatus').textContent=e.message;toast(e.message,true)}finally{button.disabled=false}
};
if($('customAmount'))$('customAmount').addEventListener('input',()=>{
 const amount=Number($('customAmount').value);
 if($('customCredits'))$('customCredits').textContent=Number.isInteger(amount)&&amount>=100&&amount<=10000?String(Math.floor(amount*30/500)):'—';
});
async function boot(){
 restoreAccount();
 try{
  try{
   const cached=JSON.parse(sessionStorage.getItem('athave_config_v2')||'null');
   if(cached && Date.now()-cached.t<60000 && page!=='topup')config=cached.value;
  }catch{}
  if(!config){config=await api('config');try{sessionStorage.setItem('athave_config_v2',JSON.stringify({t:Date.now(),value:config}))}catch{}}
  // Public pages need no wallet/history round-trip until the visitor requests an action.
  if(['profile','history','payments','create','topup','results'].includes(page)){
   const section=page==='results'?'history':sectionForPage();
   // Lazy-load history only when required; avoid large image-history requests on every profile visit.
   if(page!=='results'||!storedResults().length)await refresh({quiet:true,section});
  }
  if(page==='results')await populateResults();
 }catch(e){pageStatus('Could not load the app: '+e.message,true)}
}
boot();
