/* Athave AI PWA registration. Installation is offered by the browser itself. */
(()=>{
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
 });
})();
