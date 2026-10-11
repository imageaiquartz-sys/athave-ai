/* Athave AI Cloudflare Pages Function. All secrets live in Pages > Settings > Variables & Secrets. */
const COOKIE='athave_session', PENDING='athave_pending', OTP_COOKIE='athave_otp_request', BUCKET='athave-results';
const ALLOWED_KINDS=new Set(['shirt','polo shirt','t-shirt','hoodie','jacket','dress','pants','jeans','shorts','skirt','cap','shoe','bag','product']);
const GARMENTS=new Set(['shirt','polo shirt','t-shirt','hoodie','jacket','dress','pants','jeans','shorts','skirt','cap']);
const enc=new TextEncoder();
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}})}
function err(message,status=400){return json({error:message},status)}
function cookies(req){let o={};for(let chunk of (req.headers.get('cookie')||'').split(';')){let [k,...v]=chunk.trim().split('=');if(k)o[k]=decodeURIComponent(v.join('='));}return o}
function b64url(buf){return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64url(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
async function sha(s){return b64url(await crypto.subtle.digest('SHA-256',enc.encode(s)))}
async function hmac(secret,data){let key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64url(await crypto.subtle.sign('HMAC',key,enc.encode(data)))}
async function signSession(env,id){let payload=b64url(enc.encode(JSON.stringify({id,exp:Date.now()+14*86400000})));return `${payload}.${await hmac(env.SESSION_SECRET,payload)}`}
async function readSession(req,env){const token=cookies(req)[COOKIE];if(!token||!env.SESSION_SECRET)return null;let parts=token.split('.');if(parts.length!==2)return null;const expected=await hmac(env.SESSION_SECRET,parts[0]);if(expected!==parts[1])return null;try{let p=JSON.parse(new TextDecoder().decode(unb64url(parts[0])));if(p.exp<=Date.now()||!p.id)return null;return p.id}catch{return null}}
function setCookie(name,value,age=1209600){return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`}
function clearCookie(name){return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`}
function phone(raw){let n=String(raw||'').replace(/\D/g,'');if(n.length===10)n='91'+n;return /^91[6-9][0-9]{9}$/.test(n)?n:null}

// CAPTCHA-free OTP widget API. OTP requests are server-side, capped in Supabase,
// and cryptographically bound to the visitor's HttpOnly cookie before verification.
async function sealOtpCookie(env,phoneNumber,reqId){
 const payload=b64url(enc.encode(JSON.stringify({p:phoneNumber,r:reqId,exp:Date.now()+10*60*1000})));
 return `${payload}.${await hmac(env.SESSION_SECRET,payload)}`;
}
async function readOtpCookie(request,env){
 const token=cookies(request)[OTP_COOKIE];if(!token||!env.SESSION_SECRET)return null;
 const parts=token.split('.');if(parts.length!==2)return null;
 if(await hmac(env.SESSION_SECRET,parts[0])!==parts[1])return null;
 try{
  const obj=JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
  return obj.exp>Date.now()&&phone(obj.p)===obj.p&&typeof obj.r==='string'&&obj.r.length>=8?obj:null;
 }catch{return null;}
}
async function widgetApi(env,route,body){
 if(!env.MSG91_WIDGET_ID||!env.MSG91_AUTH_KEY)throw Error('MSG91 is not configured');
 const c=new AbortController(), timer=setTimeout(()=>c.abort(),20000);
 try{
  const resp=await fetch(`https://control.msg91.com/api/v5/widget/${route}`,{
   method:'POST',headers:{accept:'application/json','content-type':'application/json',authkey:env.MSG91_AUTH_KEY},
   body:JSON.stringify({widgetId:env.MSG91_WIDGET_ID,...body}),signal:c.signal
  });
  const answer=await resp.json().catch(()=>null);
  if(!resp.ok||!answer||answer.type==='error'||answer.success===false||String(answer.code||'')==='201'){
   const detail=typeof answer?.message==='string'?answer.message:'MSG91 rejected the request';
   throw Error('MSG91: '+detail.slice(0,130));
  }
  return answer;
 }finally{clearTimeout(timer)}
}
function widgetReqId(answer){
 // Widget sendOtp usually returns the reqId in `message`.
 for(const value of [answer?.reqId,answer?.requestId,answer?.data?.reqId,answer?.data?.requestId,answer?.message]){
  if(typeof value==='string'&&/^[a-zA-Z0-9_-]{16,160}$/.test(value))return value;
 }
 return null;
}
function widgetAccessToken(answer){
 for(const value of [answer?.['access-token'],answer?.access_token,answer?.accessToken,answer?.jwt,
   answer?.data?.['access-token'],answer?.data?.accessToken,answer?.data?.access_token,answer?.data?.jwt,answer?.message]){
   if(typeof value==='string'&&value.length>=50&&value.length<=6000&&value.split('.').length===3)return value;
 }
 return null;
}
async function finishVerifiedLogin(env,verifiedPhone,accessToken){
 await verifyMsg91(env,accessToken,verifiedPhone);
 const pending=crypto.randomUUID()+crypto.randomUUID();
 const result=await rpc(env,'prepare_phone_login',{
  p_phone:verifiedPhone,p_token_digest:await sha(accessToken),p_claim_digest:await sha(pending)
 });
 if(result.needs_name){const reply=json({needsName:true});reply.headers.append('set-cookie',setCookie(PENDING,pending,600));reply.headers.append('set-cookie',clearCookie(COOKIE));return reply;}
 const reply=json({signedIn:true});reply.headers.append('set-cookie',setCookie(COOKIE,await signSession(env,result.customer_id)));reply.headers.append('set-cookie',clearCookie(PENDING));return reply;
}
function validateInputImages(list){if(!Array.isArray(list)||!list.length||list.length>2)throw Error('Upload one or two images');return list.map(x=>{if(!x||x.mime!=='image/jpeg'||typeof x.data!=='string'||x.data.length>1600000||!/^[A-Za-z0-9+/=]+$/.test(x.data))throw Error('Please upload JPG/PNG/WebP photos under 7 MB (browser optimization failed)');return {inlineData:{mimeType:'image/jpeg',data:x.data}}})}
async function supa(env,method,relative,body=null,opts={}){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Supabase not configured');
 const url=env.SUPABASE_URL.replace(/\/$/,'')+relative;
 const headers={'apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,...opts.headers};
 if(body!==null&&!opts.raw)headers['content-type']='application/json';
 let r=await fetch(url,{method,headers,body:body===null?undefined:(opts.raw?body:JSON.stringify(body))});
 if(opts.response)return r;
 if(!r.ok){let message=(await r.text()).slice(0,260);throw Error(`Database operation failed: ${r.status} ${message}`)}
 const raw=await r.text();return raw?JSON.parse(raw):null;
}
const tbl=(env,method,table,query='',data=null,opts={})=>supa(env,method,'/rest/v1/'+table+query,data,opts);
const rpc=(env,name,body)=>supa(env,'POST','/rest/v1/rpc/'+name,body);
async function current(req,env){let id=await readSession(req,env);if(!id)return null;let rows=await tbl(env,'GET','customers','?id=eq.'+encodeURIComponent(id)+'&select=id,phone,name,is_admin');return rows?.[0]||null}
function rup(rupees){return Math.floor((rupees*30/500)+0.000001)}
async function secureGateway(env,method,route,body){
 if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)throw Error('Payments not configured');
 let credentials=btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET);
 let r=await fetch('https://api.razorpay.com/v1/'+route,{method,headers:{authorization:'Basic '+credentials,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 let data=await r.json().catch(()=>({}));if(!r.ok)throw Error('Payment gateway unavailable');return data;
}
async function fulfill(env,orderId,paymentId){
 const rows=await tbl(env,'GET','payments',`?gateway_order_id=eq.${encodeURIComponent(orderId)}&select=*`);const order=rows?.[0];if(!order)throw Error('Unknown payment order');
 const gateway=await secureGateway(env,'GET','payments/'+encodeURIComponent(paymentId));
 if(gateway.status!=='captured'||gateway.order_id!==orderId||gateway.currency!=='INR'||Number(gateway.amount)!==Number(order.amount_paise))throw Error('Payment has not been captured or details differ');
 await rpc(env,'credit_paid_order',{p_order:orderId,p_payment:paymentId});
}
async function verifyMsg91(env,accessToken,requestedPhone){
 if(!env.MSG91_AUTH_KEY)throw Error('MSG91 not configured');
 let r=await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({authkey:env.MSG91_AUTH_KEY,'access-token':accessToken})});
 let v=await r.json().catch(()=>null);
 if(!r.ok||!v)throw Error('MSG91 denied OTP verification');
 // MSG91 deployments differ in response fields. Be fail-closed: never default to user-supplied phone.
 const affirmative=v.type==='success'||v.status==='success'||v.status===true||v.success===true||v.verified===true||v.data?.verified===true;
 if(!affirmative)throw Error('OTP access token was not accepted by MSG91');
 let claims={};try{let middle=accessToken.split('.')[1];if(middle)claims=JSON.parse(new TextDecoder().decode(unb64url(middle)))}catch{}
 const identities=[v.identifier,v.mobile,v.phone,v.message,v.data?.identifier,v.data?.mobile,v.data?.phone,v.data?.data?.identifier,typeof v.data==='string'?v.data:null,claims.identifier,claims.mobile,claims.phone,claims.number,claims.sub];
 const verified=identities.map(phone).find(Boolean);
 if(!verified||verified!==requestedPhone)throw Error('MSG91 did not confirm the same mobile number. Check MSG91 response format.');
 return verified;
}
async function gemini(env,parts,model,config){
 if(!env.GEMINI_API_KEY)throw Error('Gemini API key not configured');
 let ctrl=new AbortController();let t=setTimeout(()=>ctrl.abort('Timeout'),115000);
 try{
  let r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts}],generationConfig:config}),signal:ctrl.signal});
  let data=await r.json().catch(()=>({}));if(!r.ok)throw Error('Gemini error: '+(data.error?.message||`HTTP ${r.status}`).slice(0,160));
  return data?.candidates?.[0]?.content?.parts||[];
 }finally{clearTimeout(t)}
}
async function getHistory(env,id){let jobs=await tbl(env,'GET','jobs',`?customer_id=eq.${id}&select=id,kind,side,status,created_at,storage_path&order=created_at.desc&limit=24`);return jobs||[]}
function errorResponse(ex){const msg=String(ex.message||ex).slice(0,220);console.error('Athave API:',msg);return err(msg,(/not configured|disabled|site-wide/.test(msg)?503:400))}
export async function onRequest({request,env,params}){
 try{
  const pathname=new URL(request.url).pathname;
  const route=pathname.replace(/^\/api\/?/,'');
  const method=request.method.toUpperCase();
  if(method==='OPTIONS')return err('Not allowed',405);
  if(!['GET','HEAD'].includes(method)&&route!=='webhooks/razorpay'){
    const origin=request.headers.get('Origin');const expected=new URL(request.url).origin;
    if(origin!==expected)return err('Invalid request origin',403);
  }
  if(method==='GET'&&route==='config')return json({brand:'Athave AI',login:!!(env.MSG91_WIDGET_ID&&env.MSG91_AUTH_KEY&&env.SESSION_SECRET&&env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY),payments:!!(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET),ai:!!env.GEMINI_API_KEY,otpMode:'server'});
  if(method==='POST'&&route==='webhooks/razorpay'){
   const raw=await request.text(),sig=request.headers.get('x-razorpay-signature')||'';
   if(!env.RAZORPAY_WEBHOOK_SECRET)return err('Webhook secret required',503);
   const check=await hmacHex(env.RAZORPAY_WEBHOOK_SECRET,raw);if(sig!==check)return err('Invalid webhook signature',403);
   const event=JSON.parse(raw);
   if(event.event==='payment.captured'){
     const payment=event.payload?.payment?.entity;
     if(payment?.order_id&&payment.id)await fulfill(env,payment.order_id,payment.id);
   }
   return json({ok:true});
  }
  if(method==='POST'&&route==='auth/send-otp'){
   if(!env.MSG91_WIDGET_ID||!env.MSG91_AUTH_KEY||!env.SESSION_SECRET||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)
     return err('Login configuration is incomplete',503);
   const body=await request.json(),n=phone(body.phone);
   if(!n)return err('Enter a valid Indian mobile number');
   const ip=request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')?.split(',')[0]||'unknown';
   const ipHash=await hmac(env.SESSION_SECRET,'otp-ip:'+ip);
   await rpc(env,'reserve_otp_send',{p_phone:n,p_ip_digest:ipHash});
   const sent=await widgetApi(env,'sendOtp',{identifier:n});
   const reqId=widgetReqId(sent);
   if(!reqId)throw Error('MSG91 sent an unexpected OTP response. Check OTP Widget logs; reqId not found.');
   return json({sent:true},200,{'set-cookie':setCookie(OTP_COOKIE,await sealOtpCookie(env,n,reqId),600)});
  }
  if(method==='POST'&&route==='auth/verify-otp'){
   if(!env.MSG91_AUTH_KEY||!env.SESSION_SECRET)return err('MSG91 verification unavailable',503);
   const challenge=await readOtpCookie(request,env);
   if(!challenge)return err('OTP request expired. Send a new code.',401);
   const body=await request.json(),code=String(body.otp||'').trim();
   if(!/^\d{4,8}$/.test(code))return err('Enter the OTP you received');
   const ip=request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')?.split(',')[0]||'unknown';
   const ipHash=await hmac(env.SESSION_SECRET,'otp-ip:'+ip);
   await rpc(env,'reserve_otp_verify',{p_phone:challenge.p,p_ip_digest:ipHash});
   const verified=await widgetApi(env,'verifyOtp',{reqId:challenge.r,otp:code});
   const jwt=widgetAccessToken(verified);
   if(!jwt)throw Error('MSG91 returned no access token after OTP verification. Check MSG91 Widget logs.');
   const login=await finishVerifiedLogin(env,challenge.p,jwt);
   login.headers.append('set-cookie',clearCookie(OTP_COOKIE));
   return login;
  }
  if(method==='POST'&&route==='auth/verify'){
   let body=await request.json();const n=phone(body.phone),token=String(body.accessToken||'');
   if(!n||!token||token.length>6000)return err('Invalid verification details');
   return finishVerifiedLogin(env,n,token);
  }
  if(method==='POST'&&route==='auth/complete'){
   let token=cookies(request)[PENDING],data=await request.json();if(!token)return err('Please verify your phone again',401);
   let name=String(data.name||'').trim();if(name.length<1||name.length>80)return err('Enter your name (1–80 characters)');
   const id=await rpc(env,'complete_phone_signup',{p_claim_digest:await sha(token),p_name:name});
   const reply=json({signedIn:true});reply.headers.append('set-cookie',setCookie(COOKIE,await signSession(env,id)));reply.headers.append('set-cookie',clearCookie(PENDING));return reply;
  }
  if(method==='GET'&&route==='auth/session'){
    const user=await current(request,env);
    return user?json({authenticated:true,name:user.name,phoneLast4:user.phone.slice(-4)}):json({authenticated:false},401);
  }
  if(method==='POST'&&route==='auth/logout'){
    const response=json({ok:true});
    response.headers.append('set-cookie',clearCookie(COOKIE));
    response.headers.append('set-cookie',clearCookie(PENDING));
    response.headers.append('set-cookie',clearCookie(OTP_COOKIE));
    return response;
  }
  const user=await current(request,env);if(!user)return err('Please log in with your mobile number',401);
  if(method==='GET'&&route==='ai/check'){
   if(!env.GEMINI_API_KEY)return json({configured:false,model:env.GEMINI_IMAGE_MODEL||'gemini-3.1-flash-lite-image',message:'GEMINI_API_KEY is missing'});
   const model=env.GEMINI_IMAGE_MODEL||'gemini-3.1-flash-lite-image';
   try{
    const check=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model),{headers:{'x-goog-api-key':env.GEMINI_API_KEY}});
    if(!check.ok){const detail=await check.json().catch(()=>({}));return json({configured:true,accessible:false,model,message:String(detail?.error?.message||'Google denied model access').slice(0,160)});}
    return json({configured:true,accessible:true,model,message:'Key is accepted and model metadata is accessible. Image generation still requires a real test.'});
   }catch{return json({configured:true,accessible:false,model,message:'Could not contact Google AI Studio API'});}
  }
  if(method==='GET'&&route==='me'){
   try{await rpc(env,'refund_stale_generations',{p_customer:user.id})}catch(e){console.warn('Optional stale generation cleanup:',String(e.message).slice(0,120))};
   const wallet=(await tbl(env,'GET','wallets',`?customer_id=eq.${user.id}&select=balance,purchased,used`))?.[0]||{balance:0,purchased:0,used:0};
   const payments=await tbl(env,'GET','payments',`?customer_id=eq.${user.id}&select=plan,amount_paise,credits,status,created_at&order=created_at.desc&limit=12`);
   return json({user:{phone:user.phone,name:user.name,isAdmin:user.is_admin},wallet,history:await getHistory(env,user.id),payments});
  }
  if(method==='POST'&&route==='analyze'){
   let body=await request.json(),images=validateInputImages(body.images);
   const manualKind=String(body.manualKind||'auto').toLowerCase();
   if(manualKind!=='auto'&&!ALLOWED_KINDS.has(manualKind))return err('Invalid product type');
   const walletBefore=(await tbl(env,'GET','wallets',`?customer_id=eq.${user.id}&select=balance`))?.[0]?.balance||0;
   if(walletBefore<1)return err('Not enough image limit; top up before analysing a product');
   if(manualKind!=='auto'){
     return json({outputs:(GARMENTS.has(manualKind)?['front','back']:['catalogue']).map(side=>({kind:manualKind,side,inferred:side==='back'&&images.length<2}))});
   }
   const prompt=`Analyze these product reference photos for a catalogue photo service. Return compact JSON only: {"items":[{"kind":"shirt|polo shirt|t-shirt|hoodie|jacket|dress|pants|jeans|shorts|skirt|cap|shoe|bag|product","isGarment":true|false}]}. Identify DISTINCT product types. If a person wears both shirt and pants return both (up to two). Treat multiple reference views of the same object as one item. Clothing and caps are garments that need separate front and back images. Shoes/bags/other objects need one professional catalogue image. Do not include people as items. Never invent products that are absent. Max 2 items.`;
   let result;try{let parts=await gemini(env,[{text:prompt},...images],env.ANALYSIS_MODEL||'gemini-3.5-flash-lite',{responseMimeType:'application/json'});result=JSON.parse(parts.find(x=>x.text)?.text||'{}')}catch(e){throw Error('Product detection failed: '+String(e.message).slice(0,95)+'. Select the product type manually or check ANALYSIS_MODEL.')}
   let items=(Array.isArray(result.items)?result.items:[]).slice(0,2).filter(x=>ALLOWED_KINDS.has(x.kind));if(!items.length)items=[{kind:'product'}];
   let outputs=[];for(let item of items){let garment=GARMENTS.has(item.kind);for(let side of (garment?['front','back']:['catalogue']))outputs.push({kind:item.kind,side,inferred:side==='back'&&images.length<2})}
   return json({outputs:outputs.slice(0,4)});
  }
  if(method==='POST'&&route==='generate'){
   if(env.GENERATION_ENABLED==='false')return err('Image generation temporarily paused',503);
   let body=await request.json(),images=validateInputImages(body.images);
   const kind=String(body.kind||'product').toLowerCase(),side=String(body.side||'catalogue');
   if(!ALLOWED_KINDS.has(kind)||!['front','back','catalogue'].includes(side)||(!GARMENTS.has(kind)&&side!=='catalogue'))return err('Invalid image request');
   const job=await rpc(env,'reserve_generation',{p_customer:user.id,p_kind:kind,p_side:side,p_monthly_max:Number(env.AI_MONTHLY_CALL_CAP||80),p_daily_max:Number(env.MAX_GENERATIONS_PER_DAY||30)});
   try{
    const prompt=`Use the supplied photo(s) as strict reference of ONE actual commercial product. ${images.length===2?'The first supplied photo is the FRONT and the second is the BACK of the same original product when both show the same item. Use the correct reference for each requested angle.':'Only the first/front reference is available. Do not claim the unseen back is original.'} Extract/isolate only the ${kind}. ${side==='catalogue'?'Show an ideal premium professional ecommerce product camera angle.':`Show its ${side.toUpperCase()} view as a standalone garment with natural realistic shape; remove the model/person entirely. If this angle is not visible, carefully infer a plausible ${side} based on supplied references; do NOT claim unseen details are exact.`} Pure #FFFFFF background edge-to-edge, centered with 8–12% margin, no person/human, no hanger, no props, no extra product, no added graphics, no captions or watermarks. Maintain exact product color, material, patches, pattern, seams, text and logo wherever visible; don't invent logos, words, badges or alter known design. Photorealistic high-end studio lighting, clean premium catalogue cutout. SINGLE product only, 1:1 square 1024x1024.`;
    let parts=await gemini(env,[{text:prompt},...images],env.GEMINI_IMAGE_MODEL||'gemini-3.1-flash-lite-image',{responseModalities:['TEXT','IMAGE'],responseFormat:{image:{aspectRatio:'1:1',imageSize:'1K'}}});
    const part=parts.find(p=>p.inlineData?.data&&p.inlineData?.mimeType?.startsWith('image/'));
    if(!part)throw Error('AI returned no picture. Check Gemini image model access.');
    const binary=Uint8Array.from(atob(part.inlineData.data),c=>c.charCodeAt(0));if(binary.length>8500000)throw Error('AI output too large');
    const type=part.inlineData.mimeType;const ext=type.includes('jpeg')?'jpg':type.includes('webp')?'webp':'png';const key=`${user.id}/${job}.${ext}`;
    let r=await supa(env,'POST',`/storage/v1/object/${BUCKET}/${key}`,binary,{raw:true,headers:{'content-type':type,'x-upsert':'false'},response:true});
    if(!r.ok)throw Error('Could not save generated image to storage');
    await rpc(env,'finish_generation',{p_job:job,p_storage_path:key});
    return json({id:job,kind,side});
   }catch(e){try{await rpc(env,'fail_generation',{p_job:job,p_reason:String(e.message).slice(0,180)})}catch{}throw e}
  }
  if(method==='GET'&&route.startsWith('images/')){
    const id=route.slice('images/'.length);if(!/^[0-9a-f-]{36}$/i.test(id))return err('Invalid image id');
    const rows=await tbl(env,'GET','jobs',`?id=eq.${id}&customer_id=eq.${user.id}&status=eq.completed&select=storage_path`);
    if(!rows?.[0]?.storage_path)return err('Image not found',404);
    const r=await supa(env,'GET',`/storage/v1/object/${BUCKET}/${rows[0].storage_path}`,null,{response:true});
    if(!r.ok)return err('Image storage unavailable',502);
    return new Response(r.body,{status:200,headers:{'content-type':r.headers.get('content-type')||'image/png','cache-control':'private, max-age=600','x-content-type-options':'nosniff'}});
  }
  if(method==='POST'&&route.startsWith('images/')&&route.endsWith('/webp')){
    const id=route.split('/')[1];if(!/^[0-9a-f-]{36}$/i.test(id))return err('Invalid image id');
    const rows=await tbl(env,'GET','jobs',`?id=eq.${id}&customer_id=eq.${user.id}&status=eq.completed&select=storage_path`);
    if(!rows?.[0]?.storage_path)return err('Image not found',404);
    const bytes=await request.arrayBuffer();if(bytes.byteLength<24||bytes.byteLength>1500000)return err('Optimized WebP too large');
    const header=new TextDecoder().decode(bytes.slice(0,12));if(!header.startsWith('RIFF')||!header.endsWith('WEBP'))return err('Invalid WebP');
    const key=`${user.id}/${id}.webp`;
    const r=await supa(env,'POST',`/storage/v1/object/${BUCKET}/${key}`,bytes,{raw:true,headers:{'content-type':'image/webp','x-upsert':'true'},response:true});
    if(!r.ok)throw Error('Could not store WebP result');
    await tbl(env,'PATCH','jobs',`?id=eq.${id}&customer_id=eq.${user.id}`,{storage_path:key});
    return json({ok:true});
  }
  if(method==='POST'&&route==='payments/order'){
    let d=await request.json(),plan=String(d.plan||'');if(!['starter','topup','custom'].includes(plan))return err('Invalid plan');
    let amount=plan==='starter'?499:plan==='topup'?299:Number(d.amount);
    if(!Number.isInteger(amount)||amount<100||amount>10000)return err('Custom amount must be ₹100–₹10,000');
    let credits=plan==='starter'?30:plan==='topup'?18:rup(amount);if(credits<1)return err('Amount too low');
    const order=await secureGateway(env,'POST','orders',{amount:amount*100,currency:'INR',receipt:crypto.randomUUID().replace(/-/g,'').slice(0,32)});
    await tbl(env,'POST','payments','',{customer_id:user.id,plan,amount_paise:amount*100,credits,gateway_order_id:order.id},{headers:{prefer:'return=minimal'}});
    return json({orderId:order.id,amount:amount*100,keyId:env.RAZORPAY_KEY_ID});
  }
  if(method==='POST'&&route==='payments/verify'){
    let b=await request.json();const oid=String(b.razorpay_order_id||''),pid=String(b.razorpay_payment_id||'');
    const sig=String(b.razorpay_signature||'');if(!oid||!pid||!sig)return err('Missing payment proof');
    const rows=await tbl(env,'GET','payments',`?gateway_order_id=eq.${encodeURIComponent(oid)}&customer_id=eq.${user.id}&select=id`);
    if(!rows?.[0])return err('Not your payment',403);
    const mac=await hmacHex(env.RAZORPAY_KEY_SECRET,oid+'|'+pid);if(sig!==mac)return err('Payment signature mismatch',403);
    await fulfill(env,oid,pid);return json({paid:true});
  }
  if(method==='GET'&&route==='admin'){
    if(!user.is_admin)return err('Admins only',403);
    const users=await tbl(env,'GET','customers','?select=id,phone,name,created_at&order=created_at.desc&limit=100');
    const paid=await tbl(env,'GET','payments','?status=eq.paid&select=amount_paise,credits');
    const recent=await tbl(env,'GET','jobs','?select=id,kind,side,status,created_at&order=created_at.desc&limit=25');
    return json({users,revenue:paid.reduce((a,x)=>a+x.amount_paise,0)/100,soldCredits:paid.reduce((a,x)=>a+x.credits,0),recent});
  }
  return err('API route not found',404);
 }catch(ex){return errorResponse(ex)}
}
async function hmacHex(secret,message){let key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);let sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(message)));return [...sig].map(x=>x.toString(16).padStart(2,'0')).join('')}
