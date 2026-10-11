const $=id=>document.getElementById(id);
let config=null, me=null, uploaded=[], currentPhone='', activeTab='history', isGenerating=false;
const show=(el,visible)=>{el.hidden=!visible};
const status=(msg,isError=false)=>{$('studioStatus').textContent=msg;$('studioStatus').classList.toggle('error',isError)};
const authStatus=(msg,isError=false)=>{$('authMsg').textContent=msg;$('authMsg').classList.toggle('error',isError)};
async function api(path,options={}){let r=await fetch('/api/'+path,{credentials:'same-origin',...options});let data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Request failed');return data}
const post=(path,data)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const openLogin=()=>{show($('authOverlay'),true);$('phone').focus()};
function closeLogin(){show($('authOverlay'),false);authStatus('')}
function authStep(s){for(let name of ['phoneForm','otpForm','nameForm'])show($(name),name===s)}
for(let id of ['navAccount','heroStart','ctaStart'])$(id).addEventListener('click',()=>{if(me){location.hash='#studio'}else openLogin()});
$('modalShade').onclick=closeLogin;$('closeAuth').onclick=closeLogin;
$('changePhone').onclick=()=>{authStep('phoneForm');authStatus('');$('otp').value=''};
// OTP is sent and verified by the Cloudflare backend via the official MSG91
// Widget API. We intentionally do not embed the MSG91 browser SDK or CAPTCHA.
const RESEND_DELAY_SECONDS=60;
let otpLastSentAt=0;
let sendingOtp=false;
let verifyingOtp=false;
function setOtpBusy(isBusy){
 const send=$('phoneForm').querySelector('[type="submit"]');
 const verify=$('otpForm').querySelector('[type="submit"]');
 send.disabled=isBusy;verify.disabled=isBusy;
}
function updateRetryButton(){
 const button=$('retryOtp');
 const seconds=Math.max(0,Math.ceil((otpLastSentAt+RESEND_DELAY_SECONDS*1000-Date.now())/1000));
 button.disabled=seconds>0||sendingOtp;
 button.textContent=seconds>0?`Resend in ${seconds}s`:'Resend code';
}
setInterval(updateRetryButton,1000);
async function sendOtpFromServer(){
 if(sendingOtp)return;
 sendingOtp=true;setOtpBusy(true);
 try{
  authStatus('Sending verification code...');
  await post('auth/send-otp',{phone:currentPhone});
  otpLastSentAt=Date.now();
  $('otp').value='';authStep('otpForm');
  authStatus('OTP sent. Enter the code received on your phone.');
 }catch(e){authStatus(e.message||'Could not send OTP',true)}
 finally{sendingOtp=false;setOtpBusy(false);updateRetryButton()}
}
$('phoneForm').onsubmit=async ev=>{
 ev.preventDefault();
 const number=String($('phone').value||'').replace(/\D/g,'');
 if(!/^[6-9]\d{9}$/.test(number)){
  authStatus('Enter a valid Indian mobile number',true);return;
 }
 currentPhone='91'+number;
 await sendOtpFromServer();
};
$('otpForm').onsubmit=async ev=>{
 ev.preventDefault();if(verifyingOtp)return;
 const code=$('otp').value.trim();
 if(!/^\d{4,8}$/.test(code)){authStatus('Enter the OTP code',true);return}
 verifyingOtp=true;setOtpBusy(true);
 try{
  authStatus('Verifying your number...');
  const result=await post('auth/verify-otp',{otp:code});
  if(result.needsName){
   authStep('nameForm');authStatus('Verified! Enter your name once to finish your account.');
  }else{
   closeLogin();authStep('phoneForm');
   await refresh();status('Welcome! Upload your product photos to begin.');
  }
 }catch(e){authStatus(e.message||'OTP verification failed',true)}
 finally{verifyingOtp=false;setOtpBusy(false)}
};
$('retryOtp').onclick=()=>{
 if(Date.now()<otpLastSentAt+RESEND_DELAY_SECONDS*1000){updateRetryButton();return}
 if(!currentPhone){authStep('phoneForm');return}
 sendOtpFromServer();
};
$('nameForm').onsubmit=async ev=>{ev.preventDefault();try{let name=$('name').value.trim();if(!name)throw Error('Please enter your name');
 await post('auth/complete',{name});closeLogin();authStep('phoneForm');await refresh();status('Account created successfully. You can start generating.')
 }catch(e){authStatus(e.message,true)}};
$('signOut').onclick=async()=>{try{await post('auth/logout',{});await refresh();status('Signed out.')}catch(e){status(e.message,true)}};
async function refresh(){
 try{me=await api('me');$('profile').hidden=false;$('navAccount').textContent=me.user.name;
 $('profileName').textContent=me.user.name;$('profilePhone').textContent='+'+me.user.phone;
 $('walletRemaining').textContent=me.wallet.balance;$('walletUsed').textContent=me.wallet.used;$('walletPurchased').textContent=me.wallet.purchased;
 $('progressFill').style.width=(me.wallet.purchased?100*me.wallet.used/me.wallet.purchased:0).toFixed(1)+'%';$('adminTab').hidden=!me.user.isAdmin;
 renderProfile();
 }catch{me=null;$('profile').hidden=true;$('navAccount').innerHTML='Get started <span>↗</span>'}finally{updateGenerateButton()}
}
function element(tag,cl,text){const node=document.createElement(tag);if(cl)node.className=cl;if(text!==undefined)node.textContent=text;return node}
function renderProfile(){let root=$('profileList');root.replaceChildren();let rows=[];
 if(activeTab==='history'){
  rows=me.history||[];for(let j of rows){let card=element('div','hist-card');
   if(j.status==='completed'){let image=element('img');image.src='/api/images/'+j.id;image.alt=j.kind+' '+j.side;card.append(image)}
   let d=element('div','hist-desc');d.append(element('strong',null,`${j.kind} — ${j.side}`),element('span',null,`${j.status} · ${new Date(j.created_at).toLocaleDateString('en-IN')}`));
   if(j.status==='completed'){let btn=element('button',null,'Download WebP ↓');btn.onclick=()=>downloadWebp(j.id,j.kind+'-'+j.side);d.append(btn)}card.append(d);root.append(card)
  }
 }else if(activeTab==='payments'){
  rows=me.payments||[];for(let p of rows){let card=element('div','hist-card');let d=element('div','hist-desc');d.append(element('strong',null,`₹${(p.amount_paise/100).toFixed(0)} • ${p.plan}`),element('span',null,`${p.status} · ${new Date(p.created_at).toLocaleString('en-IN')}`));card.append(d);root.append(card)}
 }else if(activeTab==='admin'){
  root.append(element('div','notice','Loading admin overview...'));
  api('admin').then(data=>{root.replaceChildren();let x=element('div','notice',`${data.users.length} recent customers · ₹${data.revenue} captured revenue · ${data.soldCredits} purchased credits`);root.append(x);for(let u of data.users){let d=element('div','hist-card');d.append(element('div','hist-desc',`${u.name} · +${u.phone}`));root.append(d)}}).catch(e=>{root.replaceChildren(element('div','notice',e.message))});return;
 }
 if(!rows.length)root.append(element('div','notice','Nothing to show yet.'));
}
for(let [id,tab] of [['historyTab','history'],['paymentsTab','payments'],['adminTab','admin']])$(id).onclick=()=>{activeTab=tab;document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));$(id).classList.add('active');renderProfile()};
function addFiles(files){for(let f of files){if(uploaded.length>=2)break;if(!['image/jpeg','image/png','image/webp'].includes(f.type)){status('Only JPG, PNG and WebP supported',true);continue}if(f.size>7*1024*1024){status('Each image must be below 7 MB',true);continue}uploaded.push(f)}renderUploads()}
function renderUploads(){let root=$('uploadPreview');root.replaceChildren();uploaded.forEach((f,i)=>{let box=element('div','filechip'),img=element('img'),url=URL.createObjectURL(f);img.src=url;img.onload=()=>URL.revokeObjectURL(url);let name=element('span',null,f.name),del=element('button',null,'×');del.onclick=()=>{uploaded.splice(i,1);renderUploads()};box.append(img,name,del);root.append(box)});updateGenerateButton()}
function updateGenerateButton(){$('generateBtn').disabled=isGenerating||!uploaded.length;}
const zone=$('dropzone'),picker=$('filepicker');zone.onclick=()=>picker.click();zone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();picker.click()}};picker.onchange=()=>{addFiles([...picker.files]);picker.value=''};zone.ondragover=e=>{e.preventDefault();zone.classList.add('dragging')};zone.ondragleave=()=>zone.classList.remove('dragging');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('dragging');addFiles([...e.dataTransfer.files])};
async function encodePhoto(file){let bitmap=await createImageBitmap(file);const max=1080,ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height));let canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);let ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let data=canvas.toDataURL('image/jpeg',.78).split(',')[1];if(data.length>1600000)throw Error('Photo is too large after optimization. Try another.');return{mime:'image/jpeg',data}}
function renderEmpty(){let root=$('results');root.replaceChildren();let d=element('div','empty');d.append(element('div','empty-picture','✧'),element('h4',null,'Preparing your creative studio'),element('p',null,'Your generated photos will appear here.'));root.append(d)}
function imageCard(id,label,preview=true){let root=$('results');if(root.firstElementChild?.classList.contains('empty'))root.replaceChildren();let card=element('div','result-item'),img=element('img');img.src='/api/images/'+id;img.alt=label;let row=element('div','result-footer'),texts=element('div');texts.append(element('strong',null,label),element('small',null,'1024 × 1024 WebP'));let button=element('button',null,'Download ↓');button.onclick=()=>downloadWebp(id,label);row.append(texts,button);card.append(img,row);root.append(card);return card}
async function optimizedWebp(id){let r=await fetch('/api/images/'+id,{credentials:'same-origin'});if(!r.ok)throw Error('Could not load generated image');let b=await r.blob();let bitmap=await createImageBitmap(b);let c=document.createElement('canvas');c.width=1024;c.height=1024;let ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1024,1024);
 const scale=Math.min(1024/bitmap.width,1024/bitmap.height);let w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);ctx.drawImage(bitmap,(1024-w)/2,(1024-h)/2,w,h);bitmap.close();
 let blob=await new Promise(done=>c.toBlob(done,'image/webp',.8));if(!blob||blob.type!=='image/webp')throw Error('WebP export not supported in this browser');
 for(let q of [.7,.6,.52]){if(blob.size<=350000)break;let next=await new Promise(done=>c.toBlob(done,'image/webp',q));if(next)blob=next}
 return blob;
}
async function saveWebp(id,blob){try{await api('images/'+id+'/webp',{method:'POST',headers:{'Content-Type':'image/webp'},body:blob})}catch(e){console.warn('WebP backup not saved:',e.message)}}
async function downloadWebp(id,label){try{status('Preparing optimized WebP download...');let blob=await optimizedWebp(id);let link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=`athave-ai-${label.toLowerCase().replace(/[^a-z0-9-]/g,'-')}-${id.slice(0,8)}.webp`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);await saveWebp(id,blob);status(`Downloaded 1024×1024 WebP (${Math.round(blob.size/1024)} KB).`)}catch(e){status(e.message,true)}}
$('generateBtn').onclick=async()=>{
 if(!me){openLogin();return}if(isGenerating||!uploaded.length)return;
 isGenerating=true;updateGenerateButton();renderEmpty();let done=0;
 try{status('Optimizing your input photos...');const images=await Promise.all(uploaded.map(encodePhoto));status('Identifying products in your photos...');
  let analysis=await post('analyze',{images});let outputs=analysis.outputs||[];if(!outputs.length)throw Error('Could not recognize any product');
  if(me.wallet.balance<outputs.length)throw Error(`You need ${outputs.length} remaining image limits for these outputs. Top up below.`);
  status(`Creating ${outputs.length} separate catalogue images...`);
  for(let [index,target] of outputs.entries()){
   let label=`${target.kind} — ${target.side}${target.inferred?' (inferred)':''}`;
   status(`Generating ${index+1}/${outputs.length}: ${label}. Please keep this tab open.`);
   try{let response=await post('generate',{images,kind:target.kind,side:target.side});imageCard(response.id,label);done++;
    // Browser conversion shrinks output and saves WebP in private storage.
    let blob=await optimizedWebp(response.id);await saveWebp(response.id,blob);
   }catch(e){status(`Output ${index+1} failed: ${e.message}`,true)}
  }
  uploaded=[];renderUploads();await refresh();if(done)status(`Created ${done}/${outputs.length} images. Click Download below each photo.`)
 }catch(e){status(e.message,true)}finally{isGenerating=false;updateGenerateButton()}
};
async function pay(plan,amount){if(!me){openLogin();return}try{let order=await post('payments/order',{plan,amount});if(!window.Razorpay)throw Error('Razorpay checkout did not load');
 let checkout=new window.Razorpay({key:order.keyId,order_id:order.orderId,amount:order.amount,currency:'INR',name:'Athave AI',description:'Image generation top-up',prefill:{contact:me.user.phone.slice(2)},theme:{color:'#141414'},handler:async data=>{try{await post('payments/verify',data);await refresh();status('Payment received. Image limit added to your account.')}catch(e){status(e.message,true)}}});checkout.on('payment.failed',()=>status('Payment was not completed',true));checkout.open()
 }catch(e){status(e.message,true)}}
for(let btn of document.querySelectorAll('.planBtn'))btn.onclick=()=>pay(btn.dataset.plan);
$('customPay').onclick=()=>{let amount=Number($('customAmount').value);if(!Number.isInteger(amount)||amount<100||amount>10000){status('Enter a top-up between ₹100 and ₹10,000',true);return}pay('custom',amount)};
async function start(){try{config=await api('config');await refresh();if(!config.login)status('Site setup pending: configure MSG91, Supabase and SESSION_SECRET in Cloudflare Secrets.',true);else if(!config.ai)status('Login is ready, but image AI key still needs configuration.',true)}catch(e){status('Backend not connected. Deploy through GitHub-linked Cloudflare Pages.',true)}}
start();
