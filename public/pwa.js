/* PWA installation and update management. No auth/payment caching. */
(()=>{
 if(!('serviceWorker' in navigator) || !window.isSecureContext)return;
 window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{}));
 if(document.body?.dataset.page==='admin')return;
 const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 if(installed())return;
 const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent);
 const nav=document.querySelector('.site-header .nav-wrap');if(!nav)return;
 let captured=null;
 const btn=document.createElement('button');btn.className='pwa-install-button';btn.type='button';btn.textContent='Install app';btn.hidden=!ios;
 const anchor=nav.querySelector('.profile-btn');if(anchor)nav.insertBefore(btn,anchor);else nav.append(btn);
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();captured=event;btn.hidden=false});
 window.addEventListener('appinstalled',()=>{captured=null;btn.hidden=true});
 btn.addEventListener('click',async()=>{
  if(captured){const prompt=captured;captured=null;btn.hidden=true;try{await prompt.prompt()}catch{}return;}
  if(ios)alert('To install Athave AI, tap Share in Safari, then Add to Home Screen.');
 });
})();
