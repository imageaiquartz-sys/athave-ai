/* Athave AI Cloudflare Pages Function. All secrets live in Pages > Settings > Variables & Secrets. */
const COOKIE='athave_session', PENDING='athave_pending', OTP_COOKIE='athave_otp_request', ADMIN_COOKIE='athave_admin_session', BUCKET='athave-results';
const ALLOWED_KINDS=new Set(['shirt','polo shirt','t-shirt','hoodie','jacket','dress','pants','jeans','shorts','skirt','cap','shoe','bag','watch','sunglasses','jewellery','mouse','keyboard','earbuds','headphones','speaker','bottle','phone case','wallet','sandal','cosmetics','electronics','furniture','product']);
const GARMENTS=new Set(['shirt','polo shirt','t-shirt','hoodie','jacket','dress','pants','jeans','shorts','skirt','cap']);
const VIEW_LABELS={front:'Front view',back:'Back view',catalogue:'Catalogue view',side:'Side view',angle:'Angled view'};
const MAX_DETECTED_PRODUCTS=6;
function viewsForKind(kind){if(GARMENTS.has(kind))return ['front','back'];if(kind==='shoe'||kind==='sandal')return ['catalogue','side','back'];if(kind==='watch'||kind==='jewellery'||kind==='sunglasses')return ['front','angle'];if(kind==='bag')return ['front','back','side'];return ['catalogue','angle']}
function safeDescriptor(v){return String(v||'').replace(/[<>\\\n\r{}]/g,' ').replace(/\s+/g,' ').trim().slice(0,95)}
async function fingerprintImages(images,roles){return sha(images.map((x,i)=>roles[i]+':'+x.inlineData.data).join('|'))}
function photoRoles(raw,length){if(!Array.isArray(raw)||raw.length!==length)return Array(length).fill('detail');return raw.map(x=>['front','back','detail'].includes(x)?x:'detail')}
function referenceParts(images,roles){const labels={front:'front view',back:'back view',detail:'detail or additional view'};return images.flatMap((image,i)=>[{text:`Reference photo ${i+1} (${labels[roles[i]]}). This is a photograph to inspect, not a separate product unless the item itself differs.`},image])}
async function signAnalysisPlan(env,customer,hash,items){const payload=b64url(enc.encode(JSON.stringify({user:customer,hash,items,exp:Date.now()+40*60*1000})));return payload+'.'+await hmac(env.SESSION_SECRET+':analysis',payload)}
async function readAnalysisPlan(env,token,user,hash){if(!env.SESSION_SECRET||typeof token!=='string'||token.length>5500)return null;const [payload,mac,...extra]=token.split('.');if(!payload||!mac||extra.length||await hmac(env.SESSION_SECRET+':analysis',payload)!==mac)return null;try{const v=JSON.parse(new TextDecoder().decode(unb64url(payload)));return v.user===user&&v.hash===hash&&v.exp>Date.now()&&Array.isArray(v.items)?v:null}catch{return null}}
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
// Separate admin session. WARNING: an ID-only login is weaker than a password/passkey.
// Set ADMIN_ACCESS_ID as a Cloudflare encrypted secret. Do not expose it in client code.
async function signAdmin(env){
 const payload=b64url(enc.encode(JSON.stringify({role:'admin',exp:Date.now()+8*3600*1000,nonce:crypto.randomUUID()})));
 return payload+'.'+await hmac(env.SESSION_SECRET+':admin:'+env.ADMIN_ACCESS_ID,payload);
}
async function hasAdminSession(req,env){
 if(!env.SESSION_SECRET||!env.ADMIN_ACCESS_ID)return false;
 const token=cookies(req)[ADMIN_COOKIE];if(!token)return false;
 const [payload,mac,...extra]=token.split('.');if(!payload||!mac||extra.length)return false;
 if(await hmac(env.SESSION_SECRET+':admin:'+env.ADMIN_ACCESS_ID,payload)!==mac)return false;
 try{const data=JSON.parse(new TextDecoder().decode(unb64url(payload)));return data.role==='admin'&&data.exp>Date.now()}catch{return false}
}
async function verifyAdminId(env,id){
 const expected=enc.encode(await sha(env.ADMIN_ACCESS_ID));
 const incoming=enc.encode(await sha(id));
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected[i]^incoming[i];return diff===0;
}
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
function validateInputImages(list){if(!Array.isArray(list)||!list.length||list.length>6)throw Error('Upload 1–6 product images');return list.map(x=>{if(!x||x.mime!=='image/jpeg'||typeof x.data!=='string'||x.data.length>1600000||!/^[A-Za-z0-9+/=]+$/.test(x.data))throw Error('Please upload JPG/PNG/WebP photos under 7 MB (browser optimization failed)');return {inlineData:{mimeType:'image/jpeg',data:x.data}}})}
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
  if(method==='GET'&&route==='config')return json({brand:'Athave AI',login:!!(env.MSG91_WIDGET_ID&&env.MSG91_AUTH_KEY&&env.SESSION_SECRET&&env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY),payments:env.PAYMENTS_ENABLED==='true'&&!!(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET),ai:!!env.GEMINI_API_KEY,otpMode:'server'});
  if(method==='POST'&&route==='webhooks/razorpay'){
   const raw=await request.text(),sig=request.headers.get('x-razorpay-signature')||'';
   if(!env.RAZORPAY_WEBHOOK_SECRET)return err('Webhook secret required',503);
   const check=await hmacHex(env.RAZORPAY_WEBHOOK_SECRET,raw);if(sig!==check)return err('Invalid webhook signature',403);
   const event=JSON.parse(raw);
   if(event.event==='payment.captured'){
     const payment=event.payload?.payment?.entity;
     if(payment?.order_id&&payment.id){if(!await manualCapture(env,payment.order_id,payment.id))await fulfill(env,payment.order_id,payment.id);}
   }
   return json({ok:true});
  }
  if(route.startsWith('manual/'))return await handleManual(request,env,await hasAdminSession(request,env));
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
   login.headers.append('set-cookie',clearCookie(ADMIN_COOKIE));
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
   const reply=json({signedIn:true});reply.headers.append('set-cookie',setCookie(COOKIE,await signSession(env,id)));reply.headers.append('set-cookie',clearCookie(PENDING));reply.headers.append('set-cookie',clearCookie(ADMIN_COOKIE));return reply;
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
    response.headers.append('set-cookie',clearCookie(ADMIN_COOKIE));
    return response;
  }
  // Admin authentication is completely separate from customer mobile OTP.
  const isAdminRoute=route==='admin'||route.startsWith('admin/');
  if(isAdminRoute){
   if(method==='GET'&&route==='admin/status')return json({configured:!!(env.ADMIN_ACCESS_ID&&env.SESSION_SECRET),unlocked:await hasAdminSession(request,env)});
   if(method==='POST'&&route==='admin/login'){
    if(!env.ADMIN_ACCESS_ID||!env.SESSION_SECRET)return err('Add ADMIN_ACCESS_ID and SESSION_SECRET as Cloudflare secrets',503);
    const body=await request.json().catch(()=>({}));const id=String(body.id||'');
    if(!id||id.length>80||!await verifyAdminId(env,id))return err('Invalid admin ID',401);
    return json({unlocked:true},200,{'set-cookie':setCookie(ADMIN_COOKIE,await signAdmin(env),8*3600)});
   }
   if(method==='POST'&&route==='admin/logout')return json({locked:true},200,{'set-cookie':clearCookie(ADMIN_COOKIE)});
   if(!await hasAdminSession(request,env))return err('Unlock the admin panel to continue',401);
  }
  const user=isAdminRoute?{id:null,is_admin:true}:await current(request,env);if(!user)return err('Please log in with your mobile number',401);
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
   const section=new URL(request.url).searchParams.get('section')||'profile';
   if(!['profile','history','payments'].includes(section))return err('Unknown account section');
   const account={user:{phone:user.phone,name:user.name,isAdmin:user.is_admin}};
   if(section==='profile'){
    account.wallet=(await tbl(env,'GET','wallets',`?customer_id=eq.${user.id}&select=balance,purchased,used`))?.[0]||{balance:0,purchased:0,used:0};
    if(account.wallet.balance===0){
     try{await rpc(env,'refund_stale_generations',{p_customer:user.id});account.wallet=(await tbl(env,'GET','wallets',`?customer_id=eq.${user.id}&select=balance,purchased,used`))?.[0]||account.wallet;}catch(e){console.warn('Deferred cleanup:',String(e.message).slice(0,100))}
    }
   }
   if(section==='history')account.history=await getHistory(env,user.id);
   if(section==='payments')account.payments=await tbl(env,'GET','payments',`?customer_id=eq.${user.id}&select=plan,amount_paise,credits,status,created_at&order=created_at.desc&limit=12`);
   return json(account);
  }
  if(method==='POST'&&route==='analyze'){
   const body=await request.json(),images=validateInputImages(body.images),roles=photoRoles(body.roles,images.length);
   const hash=await fingerprintImages(images,roles);
   // Supabase performs per-customer throttling and returns cached detection results when identical photos are uploaded.
   const claim=await rpc(env,'start_analysis_request',{p_customer:user.id,p_fingerprint:hash,p_daily_max:Number(env.MAX_ANALYSES_PER_DAY||12)});
   let items;
   if(claim?.cached&&Array.isArray(claim.items)&&claim.items.length){
    items=claim.items;
   }else{
    const prompt=`You are a precise commercial product photography analyst, NOT an image generator. Examine all ${images.length} uploaded product photos in order with their Front / Back / Detail labels. Identify every DISTINCT physical item offered for sale, up to ${MAX_DETECTED_PRODUCTS} products. Multiple reference angles/photos of the same item count as ONE product. Ignore model, hands and backgrounds. If multiple items are worn/held together identify separately. Carefully distinguish casual cotton t-shirts from sports jerseys, polo shirts from sportswear, electronics such as computer mouse or earphones, footwear, jewellery, furniture and more. Preserve exact shape, fabric, construction, branding, embroidery, graphics, text, colors, ports, labels and accessories as visibly shown. Respond JSON ONLY: {"items":[{"kind":"t-shirt","name":"Black printed cotton T-shirt","appearance":"visible realistic details including material, branding, color, prints, hardware, shape","location":"where in images, reference numbers"}]}. Allowed kinds: ${[...ALLOWED_KINDS].join(', ')}. Product name <=45 chars, appearance <=95 chars, location <=40 chars. Never invent products or details. Only return items actually visible.`;
    let result;
    try{
     const parts=await gemini(env,[{text:prompt},...referenceParts(images,roles)],env.ANALYSIS_MODEL||'gemini-3.5-flash-lite',{responseMimeType:'application/json',temperature:0,maxOutputTokens:500});
     result=JSON.parse((parts.find(x=>x.text)?.text||'{}').replace(/^```(?:json)?\s*|\s*```$/g,''));
    }catch(e){throw Error('Product analysis failed: '+String(e.message).slice(0,150))}
    let list=Array.isArray(result.items)?result.items:[];
    items=list.slice(0,MAX_DETECTED_PRODUCTS).map((x,i)=>({
      id:'item'+(i+1),kind:ALLOWED_KINDS.has(String(x.kind||'').toLowerCase())?String(x.kind).toLowerCase():'product',
      name:safeDescriptor(x.name)||'Product '+(i+1),appearance:safeDescriptor(x.appearance),location:safeDescriptor(x.location)
    }));
    if(!items.length)items=[{id:'item1',kind:'product',name:'Detected product',appearance:'',location:''}];
    if(claim?.requestId)await rpc(env,'finish_analysis_request',{p_request:claim.requestId,p_items:items});
   }
   // Never run an image model during this endpoint. A signed, short-lived plan restricts generation to detected products.
   items=items.map((x,i)=>({id:'item'+(i+1),kind:x.kind,name:x.name,appearance:x.appearance,location:x.location,views:viewsForKind(x.kind)}));
   return json({items,views:VIEW_LABELS,analysisToken:await signAnalysisPlan(env,user.id,hash,items),maxOutputs:8,analysisCost:0});
  }
  if(method==='POST'&&route==='generate'){
   if(env.GENERATION_ENABLED!=='true')return err('Image generation temporarily paused until the owner enables it',503);
   const body=await request.json(),images=validateInputImages(body.images),roles=photoRoles(body.roles,images.length);
   const hash=await fingerprintImages(images,roles);
   const plan=await readAnalysisPlan(env,body.analysisToken,user.id,hash);
   if(!plan)return err('Your product analysis has expired or the photos changed. Analyze again before generating.',403);
   const item=plan.items.find(x=>x.id===body.itemId);
   const view=String(body.view||'');
   if(!item||!item.views.includes(view)||!VIEW_LABELS[view])return err('This output was not offered in your analysis. Choose a product view card first.',400);
   const kind=item.kind;
   // One credit reserved for exactly this one selected view. Failures refund the wallet credit.
   const job=await rpc(env,'reserve_generation',{p_customer:user.id,p_kind:kind,p_side:view,p_monthly_max:Number(env.AI_MONTHLY_CALL_CAP||80),p_daily_max:Number(env.MAX_GENERATIONS_PER_DAY||30)});
   try{
    const background='white';
    const viewDirection={front:'front view',back:'back view',catalogue:'catalogue three-quarter view',side:'side profile',angle:'angled three-quarter view'}[view];
    const isCasual=['t-shirt','shirt','polo shirt','hoodie','jacket','dress','pants','jeans','shorts','skirt'].includes(kind);
    const isSports=/(sports|jersey|team kit|athletic|football|cricket|basketball|performance|training)/i.test(item.name+' '+item.appearance);
    const isPolo=kind==='polo shirt';
    const isTee=kind==='t-shirt';
    const garmentStyle=isPolo&&!isSports?'This is a polo shirt. Render an accurate professional catalogue front or back view like a premium ecommerce apparel sample: clean collar, placket, sleeve hems and overall polo structure clearly visible. Do NOT make it look like a T-shirt or sports jersey. Preserve exact logo placement, buttons, trim and fabric texture.':isTee&&!isSports?'This is a regular T-shirt. Render it as a premium fashion ecommerce T-shirt, not a polo shirt and not sportswear. Preserve the true neckline, sleeves, print placement and fabric texture.':isCasual&&!isSports?'Style this as premium contemporary retail fashion or understated luxury clothing. Do NOT style an ordinary clothing item like sports kit, football jersey, teamwear or an athletic uniform. Retain its exact original cut, sleeve style, collar, hems and texture.':isSports?'It is sports apparel: keep authentic sportswear construction, sponsor/logo placement, paneling and activewear material, without inventing new sponsors.':'Choose professional commercial photography appropriate for the actual product category, not clothing photography.';
    const backgroundStyle='Background must be PURE SOLID #FFFFFF to the edge, including all four corners, with discreet realistic contact shadow only. No props, scenery, gradients or added elements.';
    const referenceHint=`You have ${images.length} labeled input photos showing the actual product. Honor each photo's Front/Back/Detail label. Match whichever reference shows the requested side. If two or more distinct products appear in one upload photo, isolate ONLY the selected product and exclude the other items. If the requested side cannot be seen, only make conservative plausible unseen geometry and NEVER invent conspicuous brands, prints, markings or text.`;
    const prompt=`Photorealistic PREMIUM PROFESSIONAL E-COMMERCE PRODUCT PHOTOGRAPHY. Make exactly ONE square image showing ONLY the real detected product: ${item.name}, category ${kind}. Target: ${viewDirection}. Visible details: ${item.appearance}. Reference location: ${item.location}. ${referenceHint} Preserve ALL physical details of the selected item from the photos: precise contours, fabric weave, folds, seams, pockets, buttons, collars, prints, all real logos and symbols (without creating new ones), stitching, texture, material finish, colors, ports, knobs, labels, clips, laces, straps and included attachments. Do not remove, swap, simplify, replace, recolor, rearrange or invent any part of the product. For a computer mouse keep its buttons, scroll wheel and actual silhouette; for footwear keep eyelets, sole, stitching and logos; for clothes keep exact neckline, pattern and real placement. If there are other distinct items, remove those other items and the original person's body/hands/background but NEVER remove components belonging to this item. ${garmentStyle} Show the entire item, fully visible, correct proportions, straight, centered, never cropped. Natural realistic product shape and lighting, elegant premium catalog quality. No mannequin head/body, no hangers, no lifestyle scenery, no artificial sports models. ${backgroundStyle} Output ONLY the finished product photograph, 1:1 square, no caption or extra images.`;
    const parts=await gemini(env,[{text:prompt},...referenceParts(images,roles)],env.GEMINI_IMAGE_MODEL||'gemini-3.1-flash-lite-image',{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'1K'}});
    const part=parts.find(p=>p.inlineData?.data&&p.inlineData?.mimeType?.startsWith('image/'));
    if(!part)throw Error('AI returned no picture. Check Gemini image model access.');
    const binary=Uint8Array.from(atob(part.inlineData.data),c=>c.charCodeAt(0));if(binary.length>8500000)throw Error('AI output too large');
    const type=part.inlineData.mimeType;const ext=type.includes('jpeg')?'jpg':type.includes('webp')?'webp':'png';const key=`${user.id}/${job}.${ext}`;
    const r=await supa(env,'POST',`/storage/v1/object/${BUCKET}/${key}`,binary,{raw:true,headers:{'content-type':type,'x-upsert':'false'},response:true});
    if(!r.ok)throw Error('Could not save generated image to storage');
    await rpc(env,'finish_generation',{p_job:job,p_storage_path:key});
    return json({id:job,kind,side:view,label:item.name+' — '+VIEW_LABELS[view]});
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
    if(env.PAYMENTS_ENABLED!=='true'||!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET||!env.RAZORPAY_WEBHOOK_SECRET)return err('Payments are temporarily unavailable while Razorpay setup is completed.',503);
    let d=await request.json(),plan=String(d.plan||'');if(!['starter','premium','custom'].includes(plan))return err('Invalid plan');
    let amount=plan==='starter'?499:plan==='premium'?999:Number(d.amount);
    if(!Number.isInteger(amount)||amount<100||amount>10000)return err('Custom amount must be ₹100–₹10,000');
    let credits=plan==='starter'?30:plan==='premium'?60:rup(amount);if(credits<1)return err('Amount too low');
    const order=await secureGateway(env,'POST','orders',{amount:amount*100,currency:'INR',receipt:crypto.randomUUID().replace(/-/g,'').slice(0,32)});
    await tbl(env,'POST','payments','',{customer_id:user.id,plan,amount_paise:amount*100,credits,gateway_order_id:order.id},{headers:{prefer:'return=minimal'}});
    return json({orderId:order.id,amount:amount*100,keyId:env.RAZORPAY_KEY_ID});
  }
  if(method==='GET'&&route==='payments/status'){
    const oid=new URL(request.url).searchParams.get('orderId')||'';
    if(!/^order_[A-Za-z0-9]{6,60}$/.test(oid))return err('Invalid payment order');
    const rows=await tbl(env,'GET','payments',`?gateway_order_id=eq.${encodeURIComponent(oid)}&customer_id=eq.${user.id}&select=status,amount_paise`);
    const order=rows?.[0];if(!order)return err('Payment order not found',404);
    if(order.status==='paid')return json({paid:true,status:'paid'});
    // If webhook is delayed, verify captured transactions directly with Razorpay.
    // Never credit an authorized/failed payment, and never trust client-provided amounts.
    if(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET){
      try{
        const list=await secureGateway(env,'GET','orders/'+encodeURIComponent(oid)+'/payments');
        const captured=(list.items||[]).find(p=>p?.status==='captured'&&p.order_id===oid&&p.currency==='INR'&&Number(p.amount)===Number(order.amount_paise));
        if(captured?.id){await fulfill(env,oid,captured.id);return json({paid:true,status:'paid'});}
      }catch(ex){console.warn('Payment status reconciliation deferred:',String(ex?.message||ex).slice(0,90))}
    }
    return json({paid:false,status:'pending'});
  }
  if(method==='POST'&&route==='payments/verify'){
    let b=await request.json();const oid=String(b.razorpay_order_id||''),pid=String(b.razorpay_payment_id||'');
    const sig=String(b.razorpay_signature||'');if(!oid||!pid||!sig)return err('Missing payment proof');
    const rows=await tbl(env,'GET','payments',`?gateway_order_id=eq.${encodeURIComponent(oid)}&customer_id=eq.${user.id}&select=id`);
    if(!rows?.[0])return err('Not your payment',403);
    const mac=await hmacHex(env.RAZORPAY_KEY_SECRET,oid+'|'+pid);if(sig!==mac)return err('Payment signature mismatch',403);
    await fulfill(env,oid,pid);return json({paid:true});
  }
  if(method==='POST'&&route==='redeem'){
    let data=await request.json(),code=String(data.code||'').toUpperCase().trim();
    if(!/^ATH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code))return err('Invalid redeem code format');
    const codeHash=await sha(code);
    const result=await rpc(env,'redeem_image_code',{p_customer:user.id,p_code_hash:codeHash});
    return json({redeemed:true,credits:result.credits,balance:result.balance});
  }
  if(route.startsWith('admin/')){
    if(!user.is_admin)return err('Admins only',403);
    if(method==='GET'&&route==='admin/overview'){
      const result=await rpc(env,'admin_dashboard_totals',{});
      return json(result);
    }
    if(method==='GET'&&(route==='admin/users'||route==='admin/payments')){
      const offsetRaw=Number(new URL(request.url).searchParams.get('offset')||0);
      if(!Number.isSafeInteger(offsetRaw)||offsetRaw<0||offsetRaw>1000000)return err('Invalid pagination offset');
      const isUser=route==='admin/users';
      const list=isUser?await tbl(env,'GET','customers',`?select=id,phone,name,created_at&order=created_at.desc&limit=50&offset=${offsetRaw}`):await tbl(env,'GET','payments',`?select=id,customer_id,plan,amount_paise,credits,status,created_at,gateway_order_id&order=created_at.desc&limit=50&offset=${offsetRaw}`);
      if(isUser&&list.length){
        const ids=list.map(x=>x.id).join(',');
        const wallets=await tbl(env,'GET','wallets',`?select=customer_id,balance,used&customer_id=in.(${ids})`);
        const byId=new Map(wallets.map(w=>[w.customer_id,w]));
        return json({items:list.map(x=>({...x,balance:byId.get(x.id)?.balance??0,used:byId.get(x.id)?.used??0}))});
      }
      return json({items:list});
    }
    if(method==='GET'&&route==='admin/codes'){
      const codes=await tbl(env,'GET','redeem_codes','?select=id,label,credits,uses,max_uses,active,expires_at,created_at&order=created_at.desc&limit=100');
      return json({items:codes});
    }
    if(method==='POST'&&route==='admin/codes/disable'){
      const data=await request.json();const id=String(data.id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id))return err('Invalid code ID');
      await tbl(env,'PATCH','redeem_codes',`?id=eq.${encodeURIComponent(id)}`,{active:false},{headers:{prefer:'return=minimal'}});
      return json({disabled:true});
    }
    if(method==='POST'&&route==='admin/codes'){
      const d=await request.json();const label=String(d.label||'').trim(),credits=Number(d.credits),maxUses=Number(d.maxUses),expiresDays=Number(d.expiresDays);
      if(label.length<2||label.length>70||!Number.isInteger(credits)||credits<1||credits>10000||!Number.isInteger(maxUses)||maxUses<1||maxUses>10000||!Number.isInteger(expiresDays)||expiresDays<1||expiresDays>365)return err('Enter valid label, credits, uses and expiry (1–365 days)');
      const parts=[];for(let i=0;i<3;i++){const bytes=crypto.getRandomValues(new Uint8Array(4));parts.push([...bytes].map(x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join(''))}
      const code='ATH-'+parts.join('-');const codeHash=await sha(code);
      const expiry=new Date(Date.now()+expiresDays*86400000).toISOString();
      await tbl(env,'POST','redeem_codes','',{code_hash:codeHash,label,credits,max_uses:maxUses,expires_at:expiry,created_by:null},{headers:{prefer:'return=minimal'}});
      return json({created:true,code,credits,maxUses,expires_at:expiry});
    }
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

// V16 no-login manual-photo service. Separate signed HttpOnly guest cookie; never expose service key.
const MANUAL_COOKIE='athave_manual_guest', MANUAL_BUCKET='athave-manual';
const HERO_KEY='home-hero';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function guestSession(req,env){
 const token=cookies(req)[MANUAL_COOKIE];if(!token||!env.SESSION_SECRET)return null;
 const [p,mac,extra]=token.split('.');if(!p||!mac||extra||await hmac(env.SESSION_SECRET+':manual',p)!==mac)return null;
 try{const data=JSON.parse(new TextDecoder().decode(unb64url(p)));return UUID_RE.test(data.id)&&data.exp>Date.now()?data.id:null}catch{return null}
}
async function makeGuestCookie(env,id){
 const payload=b64url(enc.encode(JSON.stringify({id,exp:Date.now()+180*86400000})));
 return setCookie(MANUAL_COOKIE,payload+'.'+await hmac(env.SESSION_SECRET+':manual',payload),180*86400);
}
async function guestUser(req,env){const id=await guestSession(req,env);if(!id)return null;
 return (await tbl(env,'GET','manual_customers',`?id=eq.${encodeURIComponent(id)}&select=id,display_name,contact`))?.[0]||null;
}
async function guestEntitlement(env,guestId){
 const membership=(await tbl(env,'GET','manual_memberships',`?customer_id=eq.${guestId}&select=period_start,period_end,upload_cap,used`))?.[0]||null;
 const active=!!membership&&new Date(membership.period_end).getTime()>Date.now();
 return {active,periodEnd:membership?.period_end||null,uploadCap:active?membership.upload_cap:0,used:active?membership.used:0,remaining:active?Math.max(0,membership.upload_cap-membership.used):0};
}
async function manualUploadList(env,guestId){
 const uploads=await tbl(env,'GET','manual_uploads',`?customer_id=eq.${guestId}&status=neq.uploading&select=id,batch_id,filename,status,created_at&order=created_at.desc&limit=300`);
 if(!uploads?.length)return [];
 const ids=uploads.map(x=>x.id).join(',');const results=await tbl(env,'GET','manual_outputs',`?upload_id=in.(${ids})&select=id,upload_id,filename,created_at&order=created_at.desc&limit=500`);
 return uploads.map(x=>({...x,deliveries:results.filter(y=>y.upload_id===x.id).map(({id,filename,created_at})=>({id,filename,created_at}))}));
}
function validManualImage(file,maxBytes){
 if(!file||typeof file.arrayBuffer!=='function')throw Error('Choose an image file');
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Upload JPG, PNG or WebP only');
 if(!file.size||file.size>maxBytes)throw Error('Maximum '+Math.floor(maxBytes/1048576)+' MB per image');
 const suffix={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
 const fileName=String(file.name||'product-image.'+suffix).replace(/[\x00-\x1F<>]/g,'').slice(0,150);
 return {suffix,fileName};
}
async function manualFileFromStorage(env,path,mime,downloadName=''){
 const r=await supa(env,'GET',`/storage/v1/object/${MANUAL_BUCKET}/${path}`,null,{response:true});
 if(!r.ok)return err('Image unavailable',404);
 const headers={'content-type':mime||r.headers.get('content-type')||'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff'};
 if(downloadName)headers['content-disposition']=`attachment; filename="${downloadName.replace(/[^a-zA-Z0-9._-]/g,'_')}"`;
 return new Response(r.body,{status:200,headers});
}
async function manualVerifyPayment(env,order,paymentId){
 const gateway=await secureGateway(env,'GET','payments/'+encodeURIComponent(paymentId));
 if(gateway.status!=='captured'||gateway.order_id!==order.gateway_order_id||gateway.currency!=='INR'||Number(gateway.amount)!==Number(order.amount_paise))throw Error('Payment capture not confirmed');
 await rpc(env,'manual_apply_paid_order',{p_order:order.gateway_order_id,p_gateway_payment:paymentId});
}
async function manualCapture(env,orderId,paymentId){
 const orders=await tbl(env,'GET','manual_payments',`?gateway_order_id=eq.${encodeURIComponent(orderId)}&select=*`);
 if(!orders?.length)return false;
 await manualVerifyPayment(env,orders[0],paymentId);return true;
}
async function manualAi(env,user,data){
 const message=String(data.message||'').trim().slice(0,2500);
 if(!message)return err('Enter a message for AI');
 const images=data.images||[];
 if(!Array.isArray(images)||images.length>3)return err('Up to 3 reference photos per AI request');
 const parts=[];
 for(const img of images){
  if(!img||img.mime!=='image/jpeg'||typeof img.data!=='string'||img.data.length>1400000||!/^[A-Za-z0-9+/=]+$/.test(img.data))return err('Invalid reference photo');
  parts.push({inlineData:{mimeType:'image/jpeg',data:img.data}});
 }
 const mode=data.mode==='image'?'image':'chat';
 if(!env.GEMINI_API_KEY)return err('AI studio is not configured yet',503);
 const history=Array.isArray(data.history)?data.history.slice(-8).map(x=>({role:x.role==='assistant'?'assistant':'customer',text:String(x.text||'').slice(0,600)})):[];
 await rpc(env,'manual_reserve_ai',{p_customer:user.id,p_image:mode==='image',p_chat_max:Math.max(1,Math.min(300,Number(env.MANUAL_AI_CHAT_MAX)||30)),p_image_max:Math.max(1,Math.min(100,Number(env.MANUAL_AI_IMAGE_MAX)||10))});
 const instruction=mode==='image'
  ?`Create one polished high quality 1:1 image responding to this request: ${message}. Use uploaded reference images carefully and preserve identifiable product details and logos. Return an image, and optionally a short reply.`
  :`You are Athave AI, a concise helpful assistant for business owners, products and image creation. Be truthful; no unsupported claims. Prior messages: ${JSON.stringify(history)}. Customer request: ${message}`;
 const answer=await gemini(env,[{text:instruction},...parts],mode==='image'?(env.GEMINI_IMAGE_MODEL||'gemini-3.1-flash-lite-image'):(env.ANALYSIS_MODEL||'gemini-3.5-flash-lite'),mode==='image'?{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'1K'}}:{temperature:0.5,maxOutputTokens:1200});
 const reply=answer.filter(x=>typeof x.text==='string').map(x=>x.text).join('\n').slice(0,5000);
 if(mode==='chat')return json({reply:reply||'No text response was returned.'});
 const pic=answer.find(x=>x.inlineData?.data&&x.inlineData?.mimeType?.startsWith('image/'));
 if(!pic)return err('AI did not return an image this time',502);
 // AI images are served only to the signed guest and saved privately; never public URLs.
 const raw=Uint8Array.from(atob(pic.inlineData.data),c=>c.charCodeAt(0));
 if(raw.byteLength>8500000)throw Error('Generated image too large');
 const id=crypto.randomUUID(),type=pic.inlineData.mimeType,extension=type.includes('jpeg')?'jpg':type.includes('webp')?'webp':'png';
 const key=`${user.id}/ai/${id}.${extension}`;
 const stored=await supa(env,'POST',`/storage/v1/object/${MANUAL_BUCKET}/${key}`,raw,{raw:true,headers:{'content-type':type,'x-upsert':'false'},response:true});
 if(!stored.ok)throw Error('AI image storage failed');
 // Limited image history is intentionally kept in manual_ai_images for re-downloads.
 await tbl(env,'POST','manual_ai_images','',{id,customer_id:user.id,object_path:key,mime_type:type,prompt:message},{headers:{prefer:'return=minimal'}});
 return json({reply:reply||'Your image is ready.',imageId:id});
}
async function manualAccount(req,env){
 const account=await current(req,env);
 if(!account)return null;
 let rows=await tbl(env,'GET','manual_customers',`?account_customer_id=eq.${encodeURIComponent(account.id)}&select=id,display_name,contact,account_customer_id`);
 if(rows?.length)return rows[0];
 // One-time V16 migration: link the workspace controlled by this device AFTER OTP verification.
 // A workspace already linked to another account must never be transferred.
 const legacy=await guestUser(req,env);
 if(legacy){
  const linked=await tbl(env,'GET','manual_customers',`?id=eq.${legacy.id}&select=id,account_customer_id`);
  if(linked?.length&&!linked[0].account_customer_id){
   await tbl(env,'PATCH','manual_customers',`?id=eq.${legacy.id}&account_customer_id=is.null`,{account_customer_id:account.id,display_name:legacy.display_name.startsWith('Customer ')?account.name:legacy.display_name},{headers:{prefer:'return=minimal'}});
   rows=await tbl(env,'GET','manual_customers',`?account_customer_id=eq.${encodeURIComponent(account.id)}&select=id,display_name,contact,account_customer_id`);
   if(rows?.length)return rows[0];
  }
 }
 const id=crypto.randomUUID();
 try{await tbl(env,'POST','manual_customers','',{id,display_name:account.name||'Athave customer',contact:'',account_customer_id:account.id},{headers:{prefer:'return=minimal'}})}
 catch(e){
  // Another tab may have created the workspace concurrently.
  const existing=await tbl(env,'GET','manual_customers',`?account_customer_id=eq.${encodeURIComponent(account.id)}&select=id,display_name,contact,account_customer_id`);
  if(existing?.length)return existing[0];throw e;
 }
 return {id,display_name:account.name||'Athave customer',contact:'',account_customer_id:account.id};
}
async function heroSetting(env){
 const items=await tbl(env,'GET','manual_site_settings',`?id=eq.${HERO_KEY}&select=mode,object_path,mime_type,updated_at`);
 return items?.[0]||null;
}
async function handleManual(req,env,isAdmin){
 const method=req.method.toUpperCase(),url=new URL(req.url),route=url.pathname.replace(/^\/api\/manual\/?/,'');
 if(!env.SESSION_SECRET||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return err('Manual service configuration is incomplete',503);
 const admin=route.startsWith('admin/');
 if(admin&&!isAdmin)return err('Unlock the admin dashboard first',401);
 if(route==='hero'&&method==='GET'){
  const setting=await heroSetting(env);
  return json({mode:setting?.mode||'default',imageUrl:setting?.object_path?'/api/manual/hero/image?v='+encodeURIComponent(setting.updated_at):null});
 }
 if(route==='hero/image'&&method==='GET'){
  const setting=await heroSetting(env);
  if(!setting?.object_path)return err('No custom image',404);
  const r=await manualFileFromStorage(env,setting.object_path,setting.mime_type);
  r.headers.set('Cache-Control','public, max-age=60');return r;
 }
 let user=null;
 if(!admin && route!=='start'){
  user=await manualAccount(req,env);
  if(!user)return err('Sign in with your mobile number to continue',401);
 }
 if(route==='start'&&method==='POST'){
  const linked=await manualAccount(req,env);
  if(!linked)return err('Sign in with OTP to access your workspace',401);
  return json({customer:linked,entitlement:await guestEntitlement(env,linked.id),new:false});
 }
 if(route==='recover'||route==='rotate-recovery')return err('Use mobile OTP to access your orders',410);
 if(route==='status'&&method==='GET'){await rpc(env,'manual_refund_stale_uploads',{p_customer:user.id});return json({customer:user,entitlement:await guestEntitlement(env,user.id)});}

 if(route==='update-customer'&&method==='POST'){
  const data=await req.json(),name=String(data.name||'').trim().slice(0,70),contact=String(data.contact||'').trim().slice(0,90);
  if(name.length<2)return err('Enter your name or shop name');
  await tbl(env,'PATCH','manual_customers',`?id=eq.${user.id}`,{display_name:name,contact,updated_at:new Date().toISOString()},{headers:{prefer:'return=minimal'}});
  return json({saved:true});
 }
 if(route==='uploads'&&method==='GET')return json({uploads:await manualUploadList(env,user.id)});
 if(route==='payments'&&method==='GET'){const records=await tbl(env,'GET','manual_payments',`?customer_id=eq.${user.id}&select=id,kind,amount_paise,status,created_at,paid_at&order=created_at.desc&limit=100`);return json({payments:records||[]});}
 if(route==='upload'&&method==='POST'){
  const f=await req.formData(),file=f.get('file');const info=validManualImage(file,8*1048576);
  const batch=String(f.get('batch')||'');const batchId=UUID_RE.test(batch)?batch:crypto.randomUUID();
  const uploadId=await rpc(env,'manual_reserve_upload',{p_customer:user.id,p_batch:batchId,p_filename:info.fileName,p_mime:file.type});
  const path=`${user.id}/${uploadId}/source.${info.suffix}`;
  try{
   const fileBytes=await file.arrayBuffer();
   const save=await supa(env,'POST',`/storage/v1/object/${MANUAL_BUCKET}/${path}`,fileBytes,{raw:true,headers:{'content-type':file.type,'x-upsert':'false'},response:true});
   if(!save.ok)throw Error('Storage upload failed (HTTP '+save.status+')');
   await rpc(env,'manual_confirm_upload',{p_customer:user.id,p_upload:uploadId,p_path:path});
   return json({id:uploadId,batchId,status:'processing',message:'Processing. Results expected within 24 hours.'});
  }catch(ex){await rpc(env,'manual_cancel_upload',{p_customer:user.id,p_upload:uploadId}).catch(()=>{});throw ex}
 }
 if(route==='file'&&method==='GET'){
  const kind=url.searchParams.get('kind'),id=url.searchParams.get('id');if(!UUID_RE.test(id||''))return err('Invalid file ID');
  if(kind==='source'){
   const rows=await tbl(env,'GET','manual_uploads',`?id=eq.${id}&customer_id=eq.${user.id}&select=source_path,mime_type`);
   if(!rows?.[0]?.source_path)return err('Image not found',404);
   return manualFileFromStorage(env,rows[0].source_path,rows[0].mime_type);
  }
  if(kind==='result'){
   const rows=await tbl(env,'GET','manual_outputs',`?id=eq.${id}&select=id,upload_id,object_path,filename,mime_type`);
   if(!rows?.length)return err('Image not found',404);
   const own=await tbl(env,'GET','manual_uploads',`?id=eq.${rows[0].upload_id}&customer_id=eq.${user.id}&select=id`);
   if(!own?.length)return err('Image not found',404);
   return manualFileFromStorage(env,rows[0].object_path,rows[0].mime_type,rows[0].filename);
  }
  return err('Unknown file type');
 }
 if(route==='plan/order'&&method==='POST'){
  if(env.PAYMENTS_ENABLED!=='true'||!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET||!env.RAZORPAY_WEBHOOK_SECRET)return err('Razorpay payments are not configured',503);
  const data=await req.json(),kind=data.kind; if(kind!=='month'&&kind!=='addon')return err('Invalid plan');
  const plan=await guestEntitlement(env,user.id);
  if(kind==='month'&&plan.active)return err('Your monthly plan is still active');
  if(kind==='addon'&&(!plan.active||plan.remaining>0))return err('Add-on is available after your current 50 uploads are used');
  const amount=kind==='month'?49900:9900;
  const order=await secureGateway(env,'POST','orders',{amount,currency:'INR',receipt:'atv'+crypto.randomUUID().replace(/-/g,'').slice(0,28)});
  await tbl(env,'POST','manual_payments','',{customer_id:user.id,kind,amount_paise:amount,gateway_order_id:order.id},{headers:{prefer:'return=minimal'}});
  return json({orderId:order.id,keyId:env.RAZORPAY_KEY_ID,amount,kind});
 }
 if(route==='plan/verify'&&method==='POST'){
  const d=await req.json();const orderId=String(d.razorpay_order_id||''),paymentId=String(d.razorpay_payment_id||''),sig=String(d.razorpay_signature||'');
  if(!/^order_[A-Za-z0-9]{6,60}$/.test(orderId)||!/^pay_[A-Za-z0-9]{6,60}$/.test(paymentId)||!sig)return err('Invalid payment details');
  const orders=await tbl(env,'GET','manual_payments',`?gateway_order_id=eq.${encodeURIComponent(orderId)}&customer_id=eq.${user.id}&select=*`);
  if(!orders?.length)return err('Payment not found',404);
  if(await hmacHex(env.RAZORPAY_KEY_SECRET,orderId+'|'+paymentId)!==sig)return err('Payment signature mismatch',403);
  await manualVerifyPayment(env,orders[0],paymentId);
  return json({paid:true,entitlement:await guestEntitlement(env,user.id)});
 }
 if(route==='plan/status'&&method==='GET'){
  const orderId=url.searchParams.get('orderId')||'';
  if(!/^order_[A-Za-z0-9]{6,60}$/.test(orderId))return err('Invalid order ID');
  const list=await tbl(env,'GET','manual_payments',`?gateway_order_id=eq.${encodeURIComponent(orderId)}&customer_id=eq.${user.id}&select=*`);
  const payment=list?.[0];if(!payment)return err('Unknown order',404);
  if(payment.status==='paid')return json({paid:true,entitlement:await guestEntitlement(env,user.id)});
  const transaction=await secureGateway(env,'GET','orders/'+encodeURIComponent(orderId)+'/payments');
  const captured=(transaction.items||[]).find(p=>p.order_id===orderId&&p.status==='captured'&&p.currency==='INR'&&Number(p.amount)===payment.amount_paise);
  if(captured){await manualVerifyPayment(env,payment,captured.id);return json({paid:true,entitlement:await guestEntitlement(env,user.id)})}
  return json({paid:false});
 }
 if(route==='ai'&&method==='POST')return manualAi(env,user,await req.json());
 if(route==='ai/file'&&method==='GET'){
  const id=url.searchParams.get('id');if(!UUID_RE.test(id||''))return err('Invalid AI image');
  const rows=await tbl(env,'GET','manual_ai_images',`?id=eq.${id}&customer_id=eq.${user.id}&select=object_path,mime_type`);
  if(!rows?.length)return err('AI image not found',404);
  const extension=rows[0].mime_type==='image/jpeg'?'jpg':rows[0].mime_type==='image/webp'?'webp':'png';
  return manualFileFromStorage(env,rows[0].object_path,rows[0].mime_type,'athave-ai-'+id+'.'+extension);
 }
 if(route==='admin/customers'&&method==='GET'){
  const customers=await tbl(env,'GET','manual_customers','?select=id,display_name,contact,created_at&order=created_at.desc&limit=300');
  const uploads=await tbl(env,'GET','manual_uploads','?status=neq.uploading&select=customer_id,status,created_at&order=created_at.desc&limit=3000');
  return json({customers:customers.map(x=>({...x,total:uploads.filter(u=>u.customer_id===x.id).length,processing:uploads.filter(u=>u.customer_id===x.id&&u.status==='processing').length}))});
 }
 if(route==='admin/customer'&&method==='GET'){
  const customerId=url.searchParams.get('id')||'';if(!UUID_RE.test(customerId))return err('Invalid customer ID');
  const customer=(await tbl(env,'GET','manual_customers',`?id=eq.${customerId}&select=id,display_name,contact,created_at`))?.[0];
  if(!customer)return err('Customer not found',404);
  return json({customer,uploads:await manualUploadList(env,customerId),entitlement:await guestEntitlement(env,customerId)});
 }
 if(route==='admin/file'&&method==='GET'){
  const id=url.searchParams.get('id'),kind=url.searchParams.get('kind');if(!UUID_RE.test(id||''))return err('Invalid file ID');
  if(kind==='source'){
   const rows=await tbl(env,'GET','manual_uploads',`?id=eq.${id}&select=source_path,mime_type`);
   if(!rows?.[0]?.source_path)return err('File not found',404);
   return manualFileFromStorage(env,rows[0].source_path,rows[0].mime_type);
  }
  if(kind==='result'){
   const rows=await tbl(env,'GET','manual_outputs',`?id=eq.${id}&select=object_path,mime_type`);
   if(!rows?.length)return err('File not found',404);
   return manualFileFromStorage(env,rows[0].object_path,rows[0].mime_type);
  }
  return err('Unknown file type');
 }
 if(route==='admin/hero'&&method==='GET'){
  const setting=await heroSetting(env);
  return json({mode:setting?.mode||'default',imageUrl:setting?.object_path?'/api/manual/hero/image?v='+encodeURIComponent(setting.updated_at):null});
 }
 if(route==='admin/hero'&&method==='POST'){
  const form=await req.formData();
  const mode=String(form.get('mode')||'');
  if(!['transparent','background','default'].includes(mode))return err('Choose a valid display mode');
  if(mode==='default'){
   await tbl(env,'POST','manual_site_settings','?on_conflict=id',{id:HERO_KEY,mode:'default',object_path:null,mime_type:null,updated_at:new Date().toISOString()},{headers:{prefer:'resolution=merge-duplicates,return=minimal'}});
   return json({saved:true,mode:'default'});
  }
  const file=form.get('file');
  if(!file||typeof file.arrayBuffer!=='function')return err('Choose the homepage image');
  const info=validManualImage(file,8*1048576);
  const objectPath=`site/hero/${crypto.randomUUID()}.${info.suffix}`;
  const saved=await supa(env,'POST',`/storage/v1/object/${MANUAL_BUCKET}/${objectPath}`,await file.arrayBuffer(),{raw:true,headers:{'content-type':file.type,'x-upsert':'false'},response:true});
  if(!saved.ok)throw Error('Homepage image upload failed');
  await tbl(env,'POST','manual_site_settings','?on_conflict=id',{id:HERO_KEY,mode,object_path:objectPath,mime_type:file.type,updated_at:new Date().toISOString()},{headers:{prefer:'resolution=merge-duplicates,return=minimal'}});
  return json({saved:true,mode,imageUrl:'/api/manual/hero/image?v='+Date.now()});
 }
 if(route==='admin/deliver'&&method==='POST'){
  const form=await req.formData(),id=String(form.get('uploadId')||'');if(!UUID_RE.test(id))return err('Invalid upload');
  const file=form.get('file'),info=validManualImage(file,12*1048576);
  const source=(await tbl(env,'GET','manual_uploads',`?id=eq.${id}&status=in.(processing,completed)&select=id,customer_id`))?.[0];
  if(!source)return err('Upload unavailable',404);
  const path=`${source.customer_id}/${id}/result/${crypto.randomUUID()}.${info.suffix}`;
  const saved=await supa(env,'POST',`/storage/v1/object/${MANUAL_BUCKET}/${path}`,await file.arrayBuffer(),{raw:true,headers:{'content-type':file.type,'x-upsert':'false'},response:true});
  if(!saved.ok)throw Error('Result image upload failed');
  await tbl(env,'POST','manual_outputs','',{upload_id:id,object_path:path,filename:info.fileName,mime_type:file.type},{headers:{prefer:'return=minimal'}});
  await tbl(env,'PATCH','manual_uploads',`?id=eq.${id}`,{status:'completed',updated_at:new Date().toISOString()},{headers:{prefer:'return=minimal'}});
  return json({delivered:true});
 }
 return err('Unknown manual service route',404);
}
