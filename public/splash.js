/* Pure-white website startup splash, independent from device PWA splash. */
(()=>{
 const finish=()=>{
  const splash=document.getElementById('athaveSplash');if(!splash)return;
  // Keep the splash brief: show brand, never make navigation wait for the network.
  window.setTimeout(()=>{
   splash.classList.add('athave-splash-done');
   window.setTimeout(()=>splash.remove(),210);
  },180);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',finish,{once:true});else finish();
})();
