'use strict';
/* Operator-only, offline recovery. This module is not registered as an HTTP route. */
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {DatabaseSync}=require('node:sqlite');
const {SQLiteStore}=require('./store.cjs');
const P=require('./policy.cjs');
const R=require('./recovery.cjs');
const outName='qayd-shared.sqlite';
const fail=msg=>{throw new Error(msg);};
const usage='الاستخدام: qayd-recovery verify FILE | restore FILE NEW_DIRECTORY | seal-snapshot SNAPSHOT NEW_FILE';
function stdinPhrase(){
  if(process.stdin.isTTY)fail('استخدم أداة qayd-recovery لإدخال العبارة دون إظهارها.');
  const buf=Buffer.alloc(1025);let n=0;
  try{
    while(n<buf.length){const read=fs.readSync(0,buf,n,buf.length-n,null);if(!read)break;n+=read;}
    if(n>=buf.length)fail('حجم عبارة الاستعادة غير صالح.');
    return R.phrase(new TextDecoder('utf-8',{fatal:true}).decode(buf.subarray(0,n)).replace(/\r?\n$/,''));
  }finally{buf.fill(0);}
}
function regular(file,max){
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.size<=0||st.size>max||st.nlink!==1)fail('اختر ملفًا عاديًا بحجم صالح، وليس رابطًا أو مجلدًا.');
}
function privateParent(input){
  const resolved=path.resolve(input),parent=fs.realpathSync(path.dirname(resolved)),st=fs.statSync(parent);
  if(!st.isDirectory()||(st.mode&0o077)!==0||st.uid!==process.getuid?.())fail('استخدم مجلد عمل خاصًا تملكه (صلاحيات 0700).');
  return path.join(parent,path.basename(resolved));
}
function isolated(dir){
  if(dir==='/data'||dir.startsWith('/data/')||process.env.RAILWAY_SERVICE_ID||process.env.RAILWAY_DEPLOYMENT_ID)fail('لا تنفّذ الاستعادة على Railway أو داخل /data. استخدم جهازًا أو خادم اختبار معزولًا.');
}
function snapshot(file){
  regular(file,96*1024*1024);
  if(['-wal','-shm','-journal'].some(s=>fs.lstatSync(file+s,{throwIfNoEntry:false})))fail('يلزم ملف لقطة مستقل من أمر snapshot، لا قاعدة مفتوحة أو ملفات WAL منفصلة.');
  // A verified standalone snapshot must not acquire new WAL/SHM sidecars on read.
  const db=new DatabaseSync(pathToFileURL(file).href+'?immutable=1',{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000');
    if(db.prepare('PRAGMA quick_check(1)').get()?.quick_check!=='ok')fail('فشل فحص سلامة SQLite.');
    if(db.prepare("SELECT type FROM sqlite_schema WHERE name='desk'").get()?.type!=='table')fail('الملف ليس لقطة لخادم قيد.');
    const row=db.prepare('SELECT seq,document FROM desk WHERE id=1').get();
    if(!row||!Number.isSafeInteger(row.seq)||row.seq<1||typeof row.document!=='string'||Buffer.byteLength(row.document)>R.maxPlain)fail('لقطة الخادم غير مكتملة.');
    return R.state(JSON.parse(row.document));
  }finally{db.close();}
}
function describe(at,s){
  return `الملف سليم · ${new Date(at).toISOString()} · ${s.users.length} مستخدم · ${s.ledger.accounts.length} حساب مالي · ${s.ledger.entries.length} حركة · ${s.audit.length} حدث تدقيق.`;
}
function writeNew(file,document){
  const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,document,'utf8');fs.fsyncSync(fd);}catch(e){fs.unlinkSync(file);throw e;}
  finally{fs.closeSync(fd);}
}
function restore(to,state){
  const dir=privateParent(to);isolated(dir);
  // mkdir is an exclusive reservation. Existing or linked directories are never reused.
  fs.mkdirSync(dir,{mode:0o700});
  const temp=path.join(dir,'.restoring.sqlite'),publish=path.join(dir,outName);
  let ok=false;
  try{
    const s={...state,bookVersion:P.token()};delete s.recoveryPrepared;
    const store=new SQLiteStore(temp);
    try{store.init(s);}finally{store.close();}
    const read=snapshot(temp);
    if(JSON.stringify(read)!==JSON.stringify(s))fail('فشلت مطابقة قاعدة البيانات بعد الاستعادة.');
    fs.linkSync(temp,publish);ok=true;
    return publish;
  }finally{
    for(const ext of ['','-wal','-shm','-journal'])fs.rmSync(temp+ext,{force:true});
    if(!ok)try{fs.rmdirSync(dir);}catch{}
  }
}
async function main(args){
  process.umask(0o077);process.env.TZ||='Asia/Aden';
  const [cmd,input,to]=args;
  if(!['verify','restore','seal-snapshot'].includes(cmd)||args.length!==(cmd==='verify'?2:3))fail(usage);
  const phrase=stdinPhrase();
  if(cmd==='seal-snapshot'){
    const source=privateParent(input),dest=privateParent(to);isolated(dest);
    if(!dest.endsWith('.qayd-recovery'))fail('استخدم امتداد .qayd-recovery لملف الاستعادة الجديد.');
    const s=snapshot(source),at=Date.now(),text=await R.seal(s,phrase,at);
    writeNew(dest,text);console.log(describe(at,s));return;
  }
  const pathToArchive=path.resolve(input);regular(pathToArchive,R.maxArchive);
  const {createdAt,state}=await R.open(fs.readFileSync(pathToArchive,'utf8'),phrase);
  if(cmd==='verify'){console.log(describe(createdAt,state));return;}
  restore(to,state);
  console.log(describe(createdAt,state));console.log('حُفظت قاعدة qayd-shared.sqlite في المجلد الجديد. لم تُشغَّل خدمة ولم يُستبدل أي دفتر.');
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{
  const known={EEXIST:'المجلد أو الملف الهدف موجود. لم يُستبدل شيء.',ENOENT:'الملف أو مجلد العمل غير موجود.',EACCES:'إذن القراءة أو الكتابة غير متاح.'};
  // Do not echo lines, paths, thrown JSON fragments or SQLite documents.
  const ar=typeof e.message==='string'&&/^[\u0600-\u06ff]/u.test(e.message);
  console.error(known[e.code]||(ar?e.message:'تعذّر التحقق من الملف أو استعادته. لم يُعتمد أي ناتج.'));process.exitCode=1;
});
