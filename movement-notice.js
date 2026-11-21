/* A successful posting may offer a draft, never open a composer by itself. */
'use strict';
const MovementNotice=(()=>{
  const duration=3000;
  const el=()=>qs('#movement-notice');
  let offered=null, timer=null;
  function clear(){
    if(!offered)return false;
    clearTimeout(timer);timer=null;offered=null;el().replaceChildren();return true;
  }
  function show(id,success){
    clear();
    qs('#toast').replaceChildren();
    el().innerHTML=`<div class="movement-offer" role="group" aria-label="خيارات الإشعار بعد الحفظ" style="--offer-duration:${duration}ms">
      <div class="movement-offer-copy" role="status"><span class="movement-offer-icon">${icon('check',16)}</span><div><strong>${html(success)}</strong><p>إرسال إشعار بالمبلغ والرصيد؟</p></div></div>
      <div class="movement-offer-actions">${button('إغلاق','movement-notice-close','','btn-outline')}${button('إرسال','movement-notice-send','mail','btn-primary')}</div>
      <div class="movement-offer-timer" aria-hidden="true"></div></div>`;
    offered={id,until:performance.now()+duration};
    timer=setTimeout(clear,duration);
    return true;
  }
  function respond(send){
    const choice=offered;clear();
    if(!send||!choice||performance.now()>=choice.until||security.locked)return;
    const channel=data.settings.notify.channel;
    return movementRecipients(choice.id,channel==='none'?'both':channel);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  return {show,clear,respond};
})();
