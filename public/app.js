/* Athave AI - unified frontend: Cloudflare Pages + service-role backed API. */
const $ = id => document.getElementById(id);
const page = document.body.dataset.page;
let config = null, me = null, lastAuthError = null, verifying = false, generating = false;
let currentPhone = '', activePayment = null;
let selected = { front: null, back: null };
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
 if (!response.ok) { const ex = new Error(json.error || 'Request failed (HTTP ' + response.status + ')'); ex.status = response.status; throw ex; }
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
async function refresh({ required = false, quiet = false } = {}) {
 try { me = await api('me'); lastAuthError = null; renderUser(); return me; }
 catch (e) {
  lastAuthError = e;
  if (e.status === 401) { me = null; renderUser(); if (required) throw e; return null; }
  if (!quiet) pageStatus('Could not load your account: ' + e.message, true);
  if (required) throw e;
  return me;
 }
}
function renderUser() {
 if($('profileName')) $('profileName').textContent=me?.user?.name||'Your account';
 if($('profilePhone')) $('profilePhone').textContent=me?.user?.phone ? '+'+me.user.phone : 'Log in to view your number';
 if($('walletRemaining')) $('walletRemaining').textContent=me?.wallet?.balance ?? '—';
 if($('walletPurchased')) $('walletPurchased').textContent=me?.wallet?.purchased ?? '—';
 if($('walletUsed')) $('walletUsed').textContent=me?.wallet?.used ?? '—';
 if($('uploadWallet')) $('uploadWallet').textContent=me?.wallet?.balance ?? 'Sign in';
 if($('progressFill')) $('progressFill').style.width=me?.wallet?.purchased ? Math.min(100,100*me.wallet.used/me.wallet.purchased)+'%' : '0%';
 for(const badge of document.querySelectorAll('.header-admin-badge'))show(badge,!!me?.user?.isAdmin);
 
 
 if(page==='history') renderHistory();
 if(page==='payments') renderPayments();
}
async function ensureLogin(next) {
 try { await refresh({required:true,quiet:true}); }
 catch(e) {
  if (e.status === 401) { openLogin(next); return false; }
  pageStatus('Account service error: ' + e.message, true); return false;
 }
 return true;
}
async function loginSuccess() {
 try {
  await refresh({required:true,quiet:true});
  if (!me) throw new Error('Your account could not be loaded yet.');
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
async function signOut(){try{await post('auth/logout',{});me=null;renderUser();location.href='/'}catch(e){toast(e.message,true)}}
if($('signOut'))$('signOut').onclick=signOut;
// Uploaded image handling: two independent slots, front required, back optional.
function formatBytes(bytes){return bytes < 1048576 ? Math.round(bytes/1024)+' KB' : (bytes/1048576).toFixed(1)+' MB'}
function renderPhotoSlot(side) {
 const root=$(side+'Preview'); if(!root)return;root.replaceChildren(); const file=selected[side]; root.hidden=!file;
 if(!file)return;
 const pic=document.createElement('img'), u=URL.createObjectURL(file);pic.src=u;pic.onload=()=>URL.revokeObjectURL(u);
 const text=document.createElement('div'),n=document.createElement('b'),sz=document.createElement('small');n.textContent=file.name;sz.textContent=formatBytes(file.size);text.append(n,sz);
 const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove photo');remove.onclick=()=>{selected[side]=null;$(side+'File').value='';renderPhotoSlot(side)};
 root.append(pic,text,remove);
}
function assignPhoto(side,file){
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>7*1024*1024){pageStatus('Please select JPG, PNG or WebP under 7 MB.',true);return}
 selected[side]=file;renderPhotoSlot(side);pageStatus('');
}
for(const side of ['front','back']) {
 const input=$(side+'File'),drop=$(side+'Drop');if(!input)continue;
 input.onchange=()=>assignPhoto(side,input.files?.[0]);
 drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('is-dragging')});
 drop.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));
 drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-dragging');assignPhoto(side,e.dataTransfer.files?.[0])});
}
async function encodePhoto(file){
 let bmp=await createImageBitmap(file),scale=Math.min(1,1080/Math.max(bmp.width,bmp.height));
 let c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);
 let ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bmp,0,0,c.width,c.height);bmp.close();
 let data=c.toDataURL('image/jpeg',.76).split(',')[1];if(data.length>1600000)throw Error('This photo is too large after optimization. Use a smaller one.');
 return {mime:'image/jpeg',data};
}
function storeResults(list){sessionStorage.setItem('athave_recent_results', JSON.stringify(list));}
function storedResults(){try{return JSON.parse(sessionStorage.getItem('athave_recent_results')||'[]')}catch{return []}}
async function generate(){
 if(generating)return;
 if(!selected.front)return pageStatus('Please upload the front image first.',true);
 if(!await ensureLogin(generate))return;
 generating=true;let button=$('generateBtn');button.disabled=true;
 let made=[];
 try{
  pageStatus('Preparing reference photos…');const images=await Promise.all([selected.front,selected.back].filter(Boolean).map(encodePhoto));
  pageStatus('Analysing the products in your photo…');const analysis=await post('analyze',{images});const outputs=analysis.outputs||[];
  if(!outputs.length)throw Error('No product detected in your reference photo.');
  if((me.wallet?.balance ?? 0)<outputs.length)throw Error(`You need ${outputs.length} image credits. Your account has ${me.wallet.balance}. Add a top-up from Pricing.`);
  for(let i=0;i<outputs.length;i++){
   const target=outputs[i],label=`${target.kind} — ${target.side}${target.inferred?' (AI-inferred)':''}`;
   pageStatus(`Generating ${i+1} of ${outputs.length}: ${label}. Keep this tab open…`);
   try {
    const job=await post('generate',{images,kind:target.kind,side:target.side});
    made.push({id:job.id,label,kind:target.kind,side:target.side});storeResults(made);
    // The original output remains in private Supabase Storage. WebP conversion is done client-side on download.
   }catch(e){pageStatus(`Could not generate ${label}: ${e.message}`,true);if(!made.length)throw e;break}
  }
  if(made.length){storeResults(made);location.href='/results/'}
 }catch(e){pageStatus(e.message,true)}finally{generating=false;button.disabled=false;await refresh({quiet:true})}
}
if($('generateBtn')) $('generateBtn').onclick=generate;
// Images downloaded via authenticated private endpoint and browser WebP conversion.
async function optimizedWebp(id){
 const response=await fetch('/api/images/'+id,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('Could not load generated image');
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
 let list=storedResults();if(!list.length){let user=await refresh({quiet:true});if(user){list=(user.history||[]).filter(x=>x.status==='completed').slice(0,8).map(x=>({id:x.id,label:x.kind+' — '+x.side}))}}
 const root=$('resultsGrid');root.replaceChildren();if(!list.length){root.innerHTML='<div class="empty-card">No generated images yet. <a href="/create/" style="text-decoration:underline">Create your first product photo</a>.</div>';return}
 for(const item of list)root.append(buildOutputCard(item));
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
function renderPayments(){let root=$('paymentList');if(!root||!me)return;root.replaceChildren();let list=me.payments||[];if(!list.length){root.innerHTML='<div class="empty-card">No payments yet. <a href="/#pricing" style="text-decoration:underline">See pricing</a>.</div>';return}for(const p of list){let row=document.createElement('div');row.className='payment-row';const div=document.createElement('div');div.className='row-text';const a=document.createElement('strong'),b=document.createElement('small');a.textContent='₹'+(p.amount_paise/100).toFixed(0)+' · '+p.plan;b.textContent=p.status+' · '+new Date(p.created_at).toLocaleString('en-IN');div.append(a,b);row.append(div);root.append(row)}}
// Razorpay: backend creates order and verifies both signature and captured payment.
async function pay(plan, amount){
 if(!await ensureLogin(()=>pay(plan,amount)))return;
 if(!config?.payments)return pageStatus('Razorpay is not configured in Cloudflare.',true);
 try{pageStatus('Creating secure Razorpay payment order…');const order=await post('payments/order',{plan,amount});
 if(!window.Razorpay)throw Error('Razorpay checkout failed to load');
 const checkout=new window.Razorpay({key:order.keyId,amount:order.amount,currency:'INR',order_id:order.orderId,name:'Athave AI',description:'Image credits',prefill:{contact:me.user.phone.slice(2)},theme:{color:'#111418'},handler:async data=>{
  try{pageStatus('Verifying captured payment…');await post('payments/verify',data);await refresh({required:true});pageStatus('Payment verified. Your image limit has been added.');toast('Top-up successful!')}catch(e){pageStatus('Payment needs verification: '+e.message,true)}
 }});
 checkout.on('payment.failed',()=>pageStatus('Payment was not completed.',true));checkout.open();
 }catch(e){pageStatus(e.message,true)}
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
 try{const data=await post('redeem',{code});await refresh({required:true});$('redeemInput').value='';$('redeemStatus').textContent=`Success! ${data.credits} credits added to your account.`;toast(`${data.credits} image credits added.`)}
 catch(e){$('redeemStatus').textContent=e.message;toast(e.message,true)}finally{button.disabled=false}
};
async function boot(){
 try {config=await api('config');await refresh({quiet:true});
  if(!config.login){toast('Login setup incomplete. Check Cloudflare secrets.',true)}
  if(page==='results')await populateResults();

  if(['profile','history','payments'].includes(page)&&!me){if(lastAuthError?.status===401)openLogin();else if(lastAuthError)pageStatus('Could not check account: '+lastAuthError.message,true)}
 }catch(e){pageStatus('Backend configuration error: '+e.message,true)}
}
boot();
