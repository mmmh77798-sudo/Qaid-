/* One bounded local SQLite job. The browser and Android WebView share the reader. */
const QaydDb=(()=>{
  const max=48*1024*1024, sig=[83,81,76,105,116,101,32,102,111,114,109,97,116,32,51,0];
  const mime='application/octet-stream';
  const looksLike=bytes=>sig.every((b,i)=>bytes[i]===b);
  function start(payload, transfer=[]){
    let worker,url,timer,rejectTask;
    const finish=()=>{clearTimeout(timer);if(worker){worker.terminate();worker=null;}if(url){URL.revokeObjectURL(url);url=null;}};
    const promise=new Promise((resolve,reject)=>{
      rejectTask=reject;
      try {
        url=URL.createObjectURL(new Blob([globalThis.QaydDbEngine],{type:'application/javascript'}));
        worker=new Worker(url);
        timer=setTimeout(()=>{finish();reject(new Error('استغرقت قراءة قاعدة البيانات وقتًا طويلاً. لا توجد تغييرات محفوظة.'));},45000);
        worker.onmessage=e=>{finish();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data);};
        worker.onerror=e=>{e.preventDefault();finish();reject(new Error('تعذّر تشغيل قارئ DB. حدّث Chrome أو Android System WebView.'));};
        worker.postMessage(payload,transfer);
      }catch{finish();reject(new Error('هذا المتصفح لا يستطيع فتح نسخ DB بأمان. جرّب Chrome محدثًا.'));}
    });
    return {promise,cancel(){finish();const e=new Error('أُلغيت العملية.');e.cancelled=true;rejectTask(e);}};
  }
  return {
    max,mime,looksLike,
    read(bytes,{review=false}={}){return start({action:'read',bytes:bytes.buffer,review},[bytes.buffer]);},
    async write(value){return (await start({action:'write',value}).promise).bytes;}
  };
})();
