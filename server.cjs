'use strict';
/* Qayd Shared Desk — one private ledger per deployment, HTTPS at the reverse proxy. */
const http=require('node:http');
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const P=require('./policy.cjs');
const A=require('./auth.cjs');
const TOTP=require('./totp.cjs');
const Transport=require('./transport.cjs');
const Transfer=require('./transfer.cjs');
const Recovery=require('./recovery.cjs');
const {SQLiteStore,MemoryStore}=require('./store.cjs');
// The Android app and the deployed shared-ledger API have independent releases.
const API_VERSION='3.4';
const L=require('../app/ledger.js');
const ROOT=__dirname, APP=path.resolve(ROOT,'../app');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
const folder=(p,filename)=>path.join(ROOT,p,filename);
const assets=new Map([['/',folder('public','index.html')],['/desk.css',folder('public','desk.css')],['/desk.js',folder('public','desk.js')],['/operations.js',folder('public','operations.js')],['/maintenance.js',folder('public','maintenance.js')],
  ...['logo.svg','icons.js','ledger.js','vault.js','category-backup.js','db-backup.js','db-engine.js','release.js'].map(n=>['/assets/'+n,path.join(APP,n)]),
  ...['fonts.css',...['arabic','latin'].flatMap(a=>[400,500,600,700].map(n=>`plex-${a}-${n}.woff2`))].map(n=>['/assets/fonts/'+n,path.join(APP,'fonts',n)])]);
const at=(url)=>{try{return new URL(url);}catch{return null;}};
const originOf=value=>{
  const u=at(value);
  if(!u||u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!u.hostname)throw new Error('Set QAYD_ORIGIN to the HTTPS origin only (for example https://ledger.example.com).');
  return u;
};
const min=60*1000;
const response=(res,status,body,type='application/json; charset=utf-8',headers={})=>{
  res.writeHead(status,{'Content-Type':type,...headers});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));
};
const json=(res,status,body,headers)=>response(res,status,body,undefined,headers);
const invalidCredentials=()=>P.fail(401,'اسم المستخدم أو كلمة السر غير صحيحة.','credentials');
function security(res,demo){
  const directives=["default-src 'none'","script-src 'self' 'wasm-unsafe-eval'","style-src 'self'","img-src 'self' data:","font-src 'self'","worker-src blob:","connect-src 'self'","base-uri 'none'","form-action 'none'","object-src 'none'",...(!demo?["frame-ancestors 'none'"]:[])];
  res.setHeader('Content-Security-Policy',directives.join('; '));
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  if(!demo){res.setHeader('X-Frame-Options','DENY');res.setHeader('Strict-Transport-Security','max-age=31536000');}
}
function assertOrigin(req,origin,demo){
  if(req.headers['x-qayd-client']!=='desk-v1'||req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')P.forbidden();
  const here=req.headers.origin;
  if(demo){
    const u=at(here),host=req.headers.host,forwarded=req.headers['x-forwarded-host'];
    if(!u||!['http:','https:'].includes(u.protocol)||u.origin!==here||!(u.host===host||u.protocol==='https:'&&/^[a-z0-9-]+\.e2b\.app$/.test(u.host)&&u.host===forwarded))P.forbidden();
  }else if(here!==origin.origin)P.forbidden();
}
async function readBody(req,cap=64*1024){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))P.fail(415,'يجب إرسال طلب JSON.');
  if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')P.fail(415,'هذا الترميز غير مدعوم.');
  if(Number(req.headers['content-length'])>cap)P.fail(413,'الملف أو الطلب أكبر من الحد المسموح.');
  const chunks=[];let n=0;
  // Keep the stream alive long enough to reply with a JSON error on a bounded upload.
  for await(const b of req.iterator({destroyOnReturn:false})){
    n+=b.length;if(n>cap)P.fail(413,'الملف أو الطلب أكبر من الحد المسموح.');chunks.push(b);
  }
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,n)));}
  catch{P.fail(400,'الطلب ليس ملف JSON صالحًا بترميز UTF-8.');}
}
function demoLedger(){
  const d=L.empty();
  for(const [id,name,category,color] of [['badr','متجر السدر','clients','indigo'],['amal','مؤسسة الأمل','clients','sky'],['wadi','مكتبة الوادي','clients','violet'],['yahya','مورد التلال','suppliers','mint'],['saha','توريدات الساحة','suppliers','amber'],['personal','عهدة المحل','personal','rose']])d.accounts.push({id,name,category,color});
  const e=(kind,account,amount,days,memo,code='YER')=>L.saveEntry(d,{kind,account,amount,code,day:L.offset(days),time:'10:15',memo});
  L.setDueDate(d,e('credit','badr','84,500.125',-39,'فاتورة توريد').id,L.offset(-31));e('debit','badr','20,000',0,'سداد جزئي');
  L.setDueDate(d,e('credit','amal','48,360',-2,'دفعة بضاعة').id,L.localDay());L.setDueDate(d,e('credit','wadi','11,250.500',-4,'مبيعات آجلة').id,L.offset(5));e('credit','amal','290.125',-7,'عينة بعملة ثانية','SAR');
  e('debit','yahya','64,700',-4,'طلبية مستلزمات');e('debit','saha','24,300.250',-2,'فاتورة مشتريات');e('credit','personal','6,250',-1,'مصاريف مسجلة');
  L.saveEntry(d,{kind:'transfer',from:'badr',to:'yahya',code:'YER',amount:'5,100.025',day:L.offset(-1),time:'14:20',memo:'بيان مشترك لا يراه إلا من يرى الطرفين'});
  return d;
}
function createDesk({store=null,origin:configuredOrigin,demo=false,trustProxy=false,tls=null,transport=Transport,onError=()=>process.stderr.write('Qayd Shared: request failed\n')}={}){
  const origin=demo?null:originOf(configuredOrigin);
  if(!demo&&!store?.load())throw new Error('Initialize the owner before serving.');
  const sessions=new A.Sessions(demo),limit=A.limiter(),realms=new Map(),enroll=new Map();
  let largeReaders=0,review=null,reviewTimer=null,exporting=false;
  const dropReview=(key=null)=>{if(key!==null&&review?.key!==key)return;review=null;clearTimeout(reviewTimer);reviewTimer=null;};
  const info=()=>({demo,version:API_VERSION,actions:P.actions,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(!demo?{capabilities:{categoryTransfer:1,recoveryArchive:1}}:{})});
  const repoFor=id=>{
    if(!demo)return store;
    const realm=realms.get(id);
    return realm&&realm.exp>Date.now()?realm.store:null;
  };
  const address=req=>transport.clientAddress(req,trustProxy&&!demo);
  const userReady=a=>{if(a.user.mustChange)P.fail(403,'غيّر كلمة السر المؤقتة قبل الدخول إلى الدفتر.','password-required');return a;};
  const auth=req=>sessions.get(req,repoFor);
  function newAuth(res,u,realm,previous,{commit=null,extra={}}={}){
    const token=sessions.issue(u,realm,{previous,commit});
    if(previous){enroll.delete(previous);dropReview(previous);}
    return json(res,200,{me:P.publicUser(u),...extra,...(demo?{token,realm}:{})},demo?{}:{'Set-Cookie':A.sessionCookie(token)});
  }
  const mfaInvalid=()=>P.fail(401,'رمز التحقق غير صالح أو استُخدم بالفعل. جرّب الرمز التالي أو رمز استرداد.','mfa-invalid');
  function secondFactor(u,input){
    if(!u.mfa)return null;
    if(input===undefined||input==='')P.fail(428,'أدخل رمز تطبيق المصادقة أو رمز استرداد واحد.','mfa-required');
    const answer=TOTP.accept(u.mfa,input);if(!answer)mfaInvalid();return answer;
  }
  function replaceUser(snapshot,user,audit=''){
    const s={...snapshot.s,users:snapshot.s.users.map(u=>u.id===user.id?user:u)};
    if(audit)P.log(s,user,audit);
    return s;
  }
  async function login(req,res){
    const b=P.object(await readBody(req),['login','password','realm','otp']);
    const ip=address(req);
    limit(`login-ip:${ip}`,90,5*min);
    let login;
    try{login=A.loginId(b.login);}catch(e){if(e instanceof P.Problem)invalidCredentials();throw e;}
    const realm=demo&&typeof b.realm==='string'&&/^[A-Za-z0-9_-]{24}$/.test(b.realm)?b.realm:'';
    limit(`login-name:${realm}:${login}`,10,5*min);
    const repo=repoFor(realm),prior=repo?.load()?.s.users.find(u=>u.login===login);
    const correct=await A.verify(b.password,prior?.password);
    const snapshot=repo?.load();let u=snapshot?.s.users.find(x=>x.id===prior?.id);
    if(!correct||!u?.enabled||u.epoch!==prior.epoch||demo&&!repoFor(realm))invalidCredentials();
    const check=secondFactor(u,b.otp);
    if(check)u={...u,mfa:check.value};
    let key='';try{key=auth(req).key;}catch(e){if(!(e instanceof P.Problem))throw e;}
    return newAuth(res,u,realm,key,{commit:check?()=>repo.commit(snapshot,replaceUser(snapshot,u,check.recovered?'mfa-recovery':'')):null});
  }
  async function demoStart(req,res){
    if(!demo)P.missing();P.object(await readBody(req),[]);
    limit(`demo:${address(req)}`,15,5*min);
    for(const [k,r] of realms)if(r.exp<Date.now())realms.delete(k);
    if(realms.size>=40)P.fail(429,'التجربة ممتلئة حاليًا. جرّب لاحقًا.');
    const realm=A.secret(18),s=P.fresh(demoLedger());
    // This simulated owner enters via the demo button; no public owner credential exists.
    const user=A.makeUser('owner','مالك الدفتر التجريبي',{salt:A.secret(16),digest:A.secret(32)},{owner:true});
    s.users.push(user);realms.set(realm,{store:new MemoryStore(s),exp:Date.now()+90*min});newAuth(res,user,realm);
  }
  async function changePassword(req,res){
    const prior=auth(req);
    limit(`password:${prior.user.id}`,8,10*min);
    const b=P.object(await readBody(req),['current','password','otp']);A.acceptable(b.password);
    if(b.password===b.current)P.fail(400,'اختر كلمة سر مختلفة عن الحالية.');
    if(!await A.verify(b.current,prior.user.password))P.fail(400,'كلمة السر الحالية غير صحيحة.');
    const password=await A.hash(b.password),a=auth(req);
    if(a.user.epoch!==prior.user.epoch)A.unauth();
    const check=secondFactor(a.user,b.otp);
    const u={...A.bump(a.user,true),password,mustChange:false,...(check?{mfa:check.value}:{})};
    return newAuth(res,u,a.realm,a.key,{commit:()=>a.repo.commit(a.snapshot,replaceUser(a.snapshot,u,'password-change'))});
  }
  async function ownerMfa(req,res,op){
    const before=userReady(auth(req));P.owner(before.user);if(demo)P.missing();
    limit(`owner-mfa:${before.user.id}`,12,5*min);
    if(op==='start'){
      const b=P.object(await readBody(req),['current']);
      if(!await A.verify(b.current,before.user.password))P.fail(400,'كلمة سر المالك غير صحيحة.');
      const a=userReady(auth(req));P.owner(a.user);
      if(a.user.mfa)P.fail(409,'التحقق بخطوتين مفعّل بالفعل.');
      const t=Date.now();for(const [k,v] of enroll)if(v.until<=t)enroll.delete(k);
      if(enroll.size>=16&&!enroll.has(a.key))P.fail(429,'انتظر انتهاء إعداد تحقق سابق.');
      const next={secret:TOTP.seed(),id:A.secret(12),epoch:a.user.epoch,until:t+10*min};enroll.set(a.key,next);
      return json(res,200,{secret:next.secret,setup:next.id,login:a.user.login});
    }
    if(op==='enable'){
      const b=P.object(await readBody(req),['setup','otp']),a=userReady(auth(req)),p=enroll.get(a.key);P.owner(a.user);
      if(a.user.mfa||!p||p.id!==b.setup||p.epoch!==a.user.epoch||p.until<=Date.now())P.fail(409,'انتهت جلسة التهيئة. أعد بدء التفعيل.');
      const matched=TOTP.timeMatch(p.secret,b.otp);if(matched===null)P.fail(400,'تحقّق من المفتاح ووقت الساعة، ثم أدخل الرمز الحالي.');
      const ready=TOTP.begin(p.secret,matched),u={...A.bump(a.user,true),mfa:ready.mfa};
      return newAuth(res,u,a.realm,a.key,{commit:()=>a.repo.commit(a.snapshot,replaceUser(a.snapshot,u,'mfa-enable')),extra:{recovery:ready.codes}});
    }
    const b=P.object(await readBody(req),['current','otp']);
    if(!await A.verify(b.current,before.user.password))P.fail(400,'كلمة سر المالك غير صحيحة.');
    const a=userReady(auth(req));P.owner(a.user);
    if(!a.user.mfa)P.fail(409,'التحقق بخطوتين غير مفعّل.');
    secondFactor(a.user,b.otp);
    const u=A.bump(a.user,true);delete u.mfa;
    return newAuth(res,u,a.realm,a.key,{commit:()=>a.repo.commit(a.snapshot,replaceUser(a.snapshot,u,'mfa-disable'))});
  }
  async function changeUser(req,res,op){
    const prior=userReady(auth(req));P.owner(prior.user);
    const b=await readBody(req);
    const creating=op==='create', resetting=op==='reset';
    P.object(b,creating?['login','name','grants']:op==='update'?['id','version','name','grants','enabled']:['id','version']);
    let plain,password,login,name;
    if(creating){
      login=A.loginId(b.login);name=P.text(b.name,60,{required:true});P.grants(b.grants,prior.snapshot.s.ledger);
      if(prior.snapshot.s.users.some(u=>u.login===login))P.fail(409,'اسم الدخول مستخدم بالفعل.');
      if(prior.snapshot.s.users.length>=(demo?10:101))P.fail(422,'بلغ الدفتر الحد الأقصى لعدد المستخدمين.');
    }
    const find=a=>{
      const u=a.snapshot.s.users.find(u=>u.id===b.id&&!u.owner);
      if(!u)P.missing();if(u.version!==b.version)P.stale();return u;
    };
    if(!creating)find(prior);
    if(creating||resetting){limit(`temporary:${prior.user.id}`,25,5*min);plain=A.secret(18);password=await A.hash(plain);}
    const a=userReady(auth(req));P.owner(a.user);
    const s={...a.snapshot.s,users:[...a.snapshot.s.users]};let user;
    if(creating){
      if(s.users.length>=(demo?10:101))P.fail(422,'بلغ الدفتر الحد الأقصى لعدد المستخدمين.');
      if(s.users.some(u=>u.login===login))P.fail(409,'اسم الدخول مستخدم بالفعل.');
      user={...A.makeUser(login,name,password),grants:P.grants(b.grants,s.ledger)};s.users.push(user);
    }else{
      const old=find(a);
      if(op==='update'){
        if(typeof b.enabled!=='boolean')P.fail(400,'حدّد حالة المستخدم.');
        user={...A.bump(old,old.enabled!==b.enabled),name:P.text(b.name,60,{required:true}),grants:P.grants(b.grants,s.ledger),enabled:b.enabled};
      }else if(resetting)user={...A.bump(old,true),password,mustChange:true};
      else user=A.bump(old,true);
      s.users[s.users.indexOf(old)]=user;
    }
    P.log(s,a.user,'user-'+op,`${user.name} · ${user.login}`);a.repo.commit(a.snapshot,s);
    if(!creating)sessions.revokeUser(a.realm,user);
    json(res,creating?201:200,{user:P.publicUser(user),...(plain?{temporary:plain}:{})});
  }
  async function reviewTransfer(req,res,initial){
    P.owner(initial.user);if(demo)P.missing();
    if(!Transfer.backupIsRecent(initial.snapshot))P.fail(409,'نزّل ملف الاستعادة للحالة الحالية أولًا، ثم أعد المراجعة.','backup-first');
    limit(`transfer-review:${initial.user.id}`,12,10*min);
    if(largeReaders>=1)P.fail(429,'يوجد ملف قيد المراجعة. أعد المحاولة.','busy');
    let b;largeReaders++;
    try{b=P.object(await readBody(req,Transfer.maxCopy+1024),['name','copy','version','previewConsent']);}finally{largeReaders--;}
    if(b.previewConsent!==true)P.fail(400,'أكّد إرسال نسخة التصنيف المحدّد إلى هذا الدفتر للمراجعة.','transfer-consent');
    const a=userReady(auth(req));P.owner(a.user);
    if(a.snapshot.s.bookVersion!==b.version)P.stale();
    if(!Transfer.backupIsRecent(a.snapshot))P.fail(409,'نزّل ملف الاستعادة للحالة الحالية أولًا، ثم أعد المراجعة.','backup-first');
    const plan=Transfer.plan(a.snapshot.s,b.copy,b.name),key=A.secret(24),until=Date.now()+6*min;
    dropReview();review={key:a.key,ticket:key,version:b.version,revision:a.snapshot.seq,until,plan};
    reviewTimer=setTimeout(()=>dropReview(),6*min);reviewTimer.unref();
    return json(res,200,{ticket:key,version:b.version,until,summary:plan.summary});
  }
  async function applyTransfer(req,res,initial){
    P.owner(initial.user);if(demo)P.missing();
    const b=P.object(await readBody(req),['ticket','version','confirm','backupConfirmed']);
    if(b.confirm!==true)P.fail(400,'أكّد إضافة التصنيف الجديد بعد مراجعة الأرصدة.','transfer-consent');
    const a=userReady(auth(req));P.owner(a.user);
    if(!review||review.key!==a.key||review.ticket!==b.ticket||Date.now()>=review.until||review.version!==b.version)
      P.fail(409,'انتهت مراجعة النقل أو تخص جلسة أخرى. أعد مراجعة النسخة.','review-expired');
    if(a.snapshot.seq!==review.revision||a.snapshot.s.bookVersion!==b.version){dropReview(a.key);P.stale();}
    const {s,result}=Transfer.commit(a.snapshot,a.user,review.plan,b.backupConfirmed);
    a.repo.commit(a.snapshot,s);dropReview(a.key);
    return json(res,201,result);
  }
  async function archiveRecovery(req,res,initial){
    P.owner(initial.user);if(demo)P.missing();
    limit(`recovery-export:${initial.user.id}`,10,10*min);
    if(exporting)P.fail(429,'يجري تجهيز نسخة استعادة أخرى. انتظر قليلًا.','busy');
    exporting=true;
    try{
      const b=P.object(await readBody(req),['current','otp','phrase']);Recovery.phrase(b.phrase);
      if(b.phrase===b.current)P.fail(400,'اجعل عبارة الاستعادة مختلفة عن كلمة سر الدخول.','backup-phrase');
      if(!await A.verify(b.current,initial.user.password))P.fail(400,'كلمة سر المالك غير صحيحة.','owner-password');
      const a=userReady(auth(req));P.owner(a.user);
      if(a.user.epoch!==initial.user.epoch)A.unauth();
      const factor=secondFactor(a.user,b.otp),user=factor?{...a.user,mfa:factor.value}:a.user,at=Date.now();
      const s=replaceUser(a.snapshot,user,'recovery-export');s.recoveryPrepared={revision:a.snapshot.seq+1,version:s.bookVersion,at};
      const packed=await Recovery.seal(s,b.phrase,at);
      const still=userReady(auth(req));P.owner(still.user);
      if(still.snapshot.seq!==a.snapshot.seq)P.stale();
      a.repo.commit(a.snapshot,s);
      return response(res,200,packed,'application/json; charset=utf-8',{'Content-Disposition':`attachment; filename="qayd-recovery-${L.localDay(new Date(at))}.qayd-recovery"`});
    }finally{exporting=false;}
  }
  const makeServer=tls?https.createServer:http.createServer;
  const server=makeServer({...(tls||{}),minVersion:'TLSv1.2',requestTimeout:30000,headersTimeout:10000,keepAliveTimeout:5000,maxHeaderSize:8192},async(req,res)=>{
    security(res,demo);
    try{
      if(!demo&&!transport.secure(req,trustProxy))P.fail(426,'هذا الدفتر يتطلب اتصال HTTPS موثوقًا.','tls-required');
      if(!demo&&req.headers.host!==origin.host)P.fail(421,'استخدم عنوان HTTPS المضبوط لهذا الدفتر.');
      if(typeof req.url!=='string'||req.url.length>4096||!req.url.startsWith('/')||req.url.startsWith('//'))P.fail(400,'العنوان غير صالح.');
      const url=new URL(req.url,'http://qayd.invalid'),p=url.pathname,m=req.method;
      if((m==='GET'||m==='HEAD')&&assets.has(p)){
        const filename=assets.get(p),bytes=fs.readFileSync(filename);
        return response(res,200,m==='HEAD'?'':bytes,MIME[path.extname(filename)]);
      }
      if(!p.startsWith('/api/'))P.missing();
      if(m==='POST')assertOrigin(req,origin,demo);
      else if(m!=='GET')P.fail(405,'طريقة الطلب غير مسموحة.');
      if(m==='GET'&&p==='/api/info')return json(res,200,info());
      if(m==='POST'&&p==='/api/login')return await login(req,res);
      if(m==='POST'&&p==='/api/demo')return await demoStart(req,res);
      if(m==='POST'&&p==='/api/password')return await changePassword(req,res);
      if(m==='POST'&&p==='/api/logout'){
        P.object(await readBody(req),[]);
        try{const key=auth(req).key;sessions.drop(key);enroll.delete(key);dropReview(key);}catch(e){if(!(e instanceof P.Problem))throw e;}
        return json(res,200,{ok:true},demo?{}:{'Set-Cookie':A.sessionCookie()});
      }
      const initial=auth(req);
      if(m==='GET'&&p==='/api/me')return json(res,200,{me:P.publicUser(initial.user)});
      userReady(initial);
      if(m==='GET'){
        const {snapshot:{s},user}=initial;
        switch(p){
          case '/api/status':return json(res,200,{version:s.bookVersion,profileVersion:user.version});
          case '/api/desk':return json(res,200,{...P.desk(s,user,url.searchParams),...(!demo&&user.owner?{maintenance:{backupReady:Transfer.backupIsRecent(initial.snapshot),preparedAt:s.recoveryPrepared?.at||null,transfers:s.transfers?.length||0}}:{})});
          case '/api/movements':return json(res,200,P.movements(s,user,url.searchParams));
          case '/api/report':return json(res,200,P.report(s,user,url.searchParams));
          case '/api/collection':return json(res,200,P.collection(s,user,url.searchParams));
          case '/api/collection/detail':return json(res,200,P.collection(s,user,url.searchParams,'detail'));
          case '/api/collection.csv':{
            const r=P.collection(s,user,url.searchParams,'csv'),money=n=>Number(L.decimal(n));
            const cols=['حتى تاريخ','الحساب','التصنيف','العملة','المتبقي','متأخر','اليوم','خلال 7 أيام','بعد 7 أيام','بلا موعد','1–30','31–60','61–90','أكثر من 90','أقرب استحقاق'];
            const data=r.rows.map(x=>[r.asOf,x.name,x.categoryName,r.code,...['total','overdue','today','week','later','unscheduled','d30','d60','d90','d91'].map(k=>money(x[k])),x.firstDue]);
            return response(res,200,L.csv([cols,...data]),'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="qayd-aging.csv"'});
          }
          case '/api/report.csv':{
            const r=P.report(s,user,url.searchParams,true),money=n=>Number(L.decimal(n));
            const rows=[['الحساب','التصنيف','العملة','لي','عليّ','الصافي','الحركات'],...r.rows.map(x=>[x.name,x.category,r.code,money(x.credit),money(x.debit),money(x.balance),x.count])];
            return response(res,200,L.csv(rows),'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="qayd-shared-report.csv"'});
          }
          case '/api/team':return json(res,200,P.team(s,user,url.searchParams));
          case '/api/users':P.owner(user);return json(res,200,{users:s.users.filter(u=>!u.owner).map(P.publicUser)});
          case '/api/audit':return json(res,200,P.auditPage(s,user,url.searchParams));
          case '/api/book/backup':P.owner(user);if(demo)P.missing();return json(res,200,s.ledger);
          default:P.missing();
        }
      }
      const mfa=p.match(/^\/api\/mfa\/(start|enable|disable)$/);
      if(mfa)return await ownerMfa(req,res,mfa[1]);
      const uop=p.match(/^\/api\/users\/(create|update|reset|revoke)$/);
      if(uop)return await changeUser(req,res,uop[1]);
      if(p==='/api/book/transfer-review')return await reviewTransfer(req,res,initial);
      if(p==='/api/book/transfer-commit')return await applyTransfer(req,res,initial);
      if(p==='/api/recovery/export')return await archiveRecovery(req,res,initial);
      if(p==='/api/book/import'){
        P.owner(initial.user);if(demo)P.missing();
        if(largeReaders>=2)P.fail(429,'يوجد استيراد قيد القراءة. أعد المحاولة لاحقًا.');
        let b;largeReaders++;try{b=await readBody(req,P.maxDocument+1024);}finally{largeReaders--;}
        const a=userReady(auth(req)),s={...a.snapshot.s};
        const result=P.importBook(s,a.user,b);a.repo.commit(a.snapshot,s);return json(res,200,result);
      }
      if(p==='/api/book/change'){
        const b=P.object(await readBody(req),['action','id','fields']),a=userReady(auth(req)),s={...a.snapshot.s};
        const result=P.changeBook(s,a.user,b.action,b.id,b.fields);a.repo.commit(a.snapshot,s);return json(res,200,result);
      }
      P.missing();
    }catch(e){
      if(res.headersSent||res.destroyed)return;
      const problem=e instanceof P.Problem;
      if(!problem)onError(e);
      // Do not keep incomplete or rejected request bodies on a reusable connection.
      if(!req.complete){res.setHeader('Connection','close');req.resume();}
      json(res,problem?e.status:500,{error:problem?e.message:'تعذّر إتمام الطلب. حاول مجددًا. لم يُؤكّد الحفظ.',code:problem?e.code:''});
    }
  });
  server.requestTimeout=30000;server.maxHeadersCount=50;server.once('close',()=>dropReview());
  return server;
}
async function cli(){
  process.umask(0o077);process.env.TZ||='Asia/Aden';
  const [command='serve',arg,name]=process.argv.slice(2);
  if(command==='demo'||command==='serve'){
    const demo=command==='demo',origin=process.env.QAYD_ORIGIN,trustProxy=!demo&&process.env.QAYD_TRUST_PROXY==='1';
    const cert=!demo&&process.env.QAYD_TLS_CERT,key=!demo&&process.env.QAYD_TLS_KEY;
    if(!!cert!==!!key)throw new Error('Set both QAYD_TLS_CERT and QAYD_TLS_KEY, or neither.');
    const tls=cert?{cert:fs.readFileSync(cert),key:fs.readFileSync(key)}:null;
    if(!demo&&!tls&&!trustProxy)throw new Error('HTTPS required: configure a trusted HTTPS reverse proxy or set QAYD_TLS_CERT and QAYD_TLS_KEY.');
    const store=demo?null:new SQLiteStore(process.env.QAYD_DB||'data/qayd-shared.sqlite');
    const host=process.env.QAYD_HOST||(demo?'0.0.0.0':'127.0.0.1'),port=Number(process.env.PORT||3100);
    const app=createDesk({store,origin,demo,trustProxy,tls});
    app.listen(port,host,()=>console.log(demo?`Qayd demo · synthetic data only · ${port}`:`Qayd Shared · ${originOf(origin).origin} · ${host}:${port}`));
    const stop=()=>app.close(()=>{store?.close();process.exit(0);});process.once('SIGINT',stop);process.once('SIGTERM',stop);
    return;
  }
  const store=new SQLiteStore(process.env.QAYD_DB||'data/qayd-shared.sqlite');
  try{
    if(command==='snapshot'){if(!store.load()||!arg)throw new Error('Supply a new path for the protected database snapshot.');await store.snapshot(arg);console.log('Saved private SQLite snapshot (contains sensitive ledger and authentication data).');return;}
    if(command==='owner-reset-2fa'){
      if(arg!=='--confirm')throw new Error('Owner recovery requires owner-reset-2fa --confirm.');
      const before=store.load();if(!before)throw new Error('No owner exists.');
      const old=before.s.users.find(u=>u.owner),u=A.bump(old,true);delete u.mfa;
      const s={...before.s,users:before.s.users.map(x=>x===old?u:x)};P.log(s,u,'mfa-console-reset');store.commit(before,s);console.log('Owner two-step verification disabled; owner sessions revoked.');return;
    }
    if(!['owner-init','owner-reset'].includes(command))throw new Error('Commands: serve | demo | owner-init LOGIN NAME | owner-reset | owner-reset-2fa --confirm | snapshot PATH');
    if(process.stdin.isTTY)throw new Error('Pipe the new owner password privately from stdin; see the deployment guide.');
    const value=fs.readFileSync(0,'utf8').replace(/\r?\n$/,''),password=await A.hash(value);
    if(command==='owner-init'){
      const s=P.fresh(),u=A.makeUser(arg||'owner',name||'مالك الدفتر',password,{owner:true});s.users.push(u);P.log(s,u,'owner-init');store.init(s);console.log(`Owner initialized: ${u.login}`);
    }else{
      const before=store.load();if(!before)throw new Error('No owner exists.');
      const old=before.s.users.find(u=>u.owner),u={...A.bump(old,true),password,mustChange:false};
      const s={...before.s,users:before.s.users.map(x=>x===old?u:x)};P.log(s,u,'owner-reset');store.commit(before,s);console.log(`Owner password reset; all owner sessions revoked: ${u.login}`);
    }
  }finally{store.close();}
}
module.exports={createDesk,originOf,demoLedger,API_VERSION};
if(require.main===module)cli().catch(e=>{console.error(e.message);process.exitCode=1;});
