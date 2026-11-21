'use strict';
/* Full recovery archive. No plaintext backup route, credentials or session cookies. */
const {randomBytes,scrypt,createCipheriv,createDecipheriv}=require('node:crypto');
const {gzipSync,gunzipSync}=require('node:zlib');
const {promisify}=require('node:util');
const L=require('../app/ledger.js');
const P=require('./policy.cjs');
const {uuid,maxTransfers}=require('./transfer.cjs');
const derive=promisify(scrypt),format='qayd-recovery',version=1;
const maxPlain=32*1024*1024,maxArchive=44*1024*1024;
const stamp=n=>Number.isSafeInteger(n)&&n>0&&n<=253402300799999;
const safeText=(s,n)=>typeof s==='string'&&s.length<=n;
const b64=(s,n)=>typeof s==='string'&&s.length===Math.ceil(n*4/3)&&/^[A-Za-z0-9_-]+$/.test(s)&&Buffer.from(s,'base64url').toString('base64url')===s;
const canonicalData=s=>{
  if(typeof s!=='string'||s.length<=20||!/^[A-Za-z0-9_-]+$/.test(s))return false;
  const tail=s.length%4,last='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.indexOf(s.at(-1));
  return tail===0||tail===2&&last%16===0||tail===3&&last%4===0;
};
const need=(ok,message='بنية نسخة الاستعادة غير صالحة.')=>{if(!ok)throw new Error(message);};
function phrase(s){
  if(typeof s!=='string'||s.length>128||s.trim().length<16||/[\u0000-\u001f\u007f]/.test(s))P.fail(400,'استخدم عبارة استعادة مختلفة من 16 إلى 128 حرفًا.','backup-phrase');
  return s;
}
function state(raw){
  P.object(raw,['schema','bookVersion','imported','ledger','users','audit','transfers','recoveryPrepared']);
  need(raw.schema===1&&uuid(raw.bookVersion)&&typeof raw.imported==='boolean');
  const ledger=L.validate(raw.ledger);need(!ledger.demo&&Buffer.byteLength(JSON.stringify(ledger))<=P.maxDocument);
  need(Array.isArray(raw.users)&&raw.users.length>=1&&raw.users.length<=101);
  const ids=new Set(),names=new Set();let owners=0;
  for(const u of raw.users){
    P.object(u,['id','login','name','owner','enabled','mustChange','version','epoch','password','grants','mfa']);
    need(uuid(u.id)&&uuid(u.version)&&!ids.has(u.id)&&typeof u.login==='string'&&/^[a-z0-9][a-z0-9._-]{2,31}$/.test(u.login)&&!names.has(u.login)&&safeText(u.name,60)&&u.name.trim()&&b64(u.epoch,18));
    need(typeof u.owner==='boolean'&&typeof u.enabled==='boolean'&&typeof u.mustChange==='boolean');
    ids.add(u.id);names.add(u.login);if(u.owner){owners++;need(u.enabled);}P.grants(u.grants,ledger);
    P.object(u.password,['salt','digest']);need(b64(u.password.salt,16)&&b64(u.password.digest,32));
    if(u.mfa!==undefined){
      const m=P.object(u.mfa,['secret','last','recovery']);
      need(u.owner&&typeof m.secret==='string'&&/^[A-Z2-7]{32}$/.test(m.secret)&&Number.isSafeInteger(m.last)&&m.last>=0&&
        Array.isArray(m.recovery)&&m.recovery.length<=8&&new Set(m.recovery).size===m.recovery.length&&m.recovery.every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)));
    }
  }
  need(owners===1&&Array.isArray(raw.audit)&&raw.audit.length<=1000);
  const auditIds=new Set();
  for(const a of raw.audit){
    P.object(a,['id','actorId','at','actor','kind','subject','versions']);
    need(uuid(a.id)&&!auditIds.has(a.id)&&uuid(a.actorId)&&stamp(a.at)&&safeText(a.actor,80)&&safeText(a.kind,60)&&safeText(a.subject,500)&&Buffer.byteLength(JSON.stringify(a))<=8192);
    auditIds.add(a.id);
    if(a.versions!==undefined){
      const v=P.object(a.versions,['before','after']);
      for(const x of [v.before,v.after]){
        if(x===null)continue;
        P.object(x,['day','time','memo','due','image','receipt','legs']);
        need(L.validDay(x.day)&&L.validTime(x.time)&&safeText(x.memo,600)&&(x.due===''||L.validDay(x.due))&&typeof x.image==='boolean'&&Array.isArray(x.legs)&&x.legs.length>=1&&x.legs.length<=2);
        for(const leg of x.legs){P.object(leg,['name','code','minor']);need(safeText(leg.name,90)&&typeof leg.code==='string'&&/^[A-Z][A-Z0-9]{1,7}$/.test(leg.code)&&Number.isSafeInteger(leg.minor)&&leg.minor!==0&&Math.abs(leg.minor)<=L.MAX);}
        if(x.receipt!==null){P.object(x.receipt,['number','method']);need(Number.isInteger(x.receipt.number)&&x.receipt.number>=1&&x.receipt.number<=999999999&&L.receiptMethods.includes(x.receipt.method));}
      }
    }
  }
  if(raw.transfers!==undefined){
    need(Array.isArray(raw.transfers)&&raw.transfers.length<=maxTransfers);
    const seen=new Set(),scopes=new Set();
    for(const t of raw.transfers){
      P.object(t,['category','digest','at']);
      need(uuid(t.category)&&!scopes.has(t.category)&&ledger.categories.some(c=>c.id===t.category)&&typeof t.digest==='string'&&/^[a-f0-9]{64}$/.test(t.digest)&&!seen.has(t.digest)&&stamp(t.at));
      seen.add(t.digest);scopes.add(t.category);
    }
  }
  if(raw.recoveryPrepared!==undefined){
    const m=P.object(raw.recoveryPrepared,['revision','version','at']);need(Number.isSafeInteger(m.revision)&&m.revision>=2&&uuid(m.version)&&stamp(m.at));
  }
  return {...raw,ledger};
}
const aad=m=>Buffer.from(JSON.stringify([format,version,m.createdAt,m.salt,m.iv]),'utf8');
const unlock=(value,salt)=>derive(value,Buffer.from(salt,'base64url'),32,{N:32768,r:8,p:2,maxmem:64*1024*1024});
async function seal(raw,value,createdAt=Date.now()){
  phrase(value);need(stamp(createdAt));
  const plain=Buffer.from(JSON.stringify(state(raw)),'utf8');
  try{
    if(plain.length>maxPlain)P.fail(413,'حجم الدفتر أكبر من حد ملف الاستعادة. خذ لقطة SQLite من الخادم.','backup-size');
    const m={format,version,createdAt,salt:randomBytes(16).toString('base64url'),iv:randomBytes(12).toString('base64url')};
    const key=await unlock(value,m.salt);let zip;
    try{
      zip=gzipSync(plain,{level:3});const c=createCipheriv('aes-256-gcm',key,Buffer.from(m.iv,'base64url'));c.setAAD(aad(m));
      const body=Buffer.concat([c.update(zip),c.final()]);
      const text=JSON.stringify({...m,tag:c.getAuthTag().toString('base64url'),data:body.toString('base64url')});
      if(Buffer.byteLength(text)>maxArchive)P.fail(413,'حجم ملف الاستعادة أكبر من الحد. خذ لقطة SQLite من الخادم.','backup-size');
      return text;
    }finally{key.fill(0);zip?.fill(0);}
  }finally{plain.fill(0);}
}
async function open(text,value){
  phrase(value);
  need(typeof text==='string'&&Buffer.byteLength(text)<=maxArchive,'حجم ملف الاستعادة غير صالح.');
  const m=P.object(JSON.parse(text),['format','version','createdAt','salt','iv','tag','data']);
  need(m.format===format&&m.version===version&&stamp(m.createdAt)&&b64(m.salt,16)&&b64(m.iv,12)&&b64(m.tag,16)&&canonicalData(m.data));
  const key=await unlock(value,m.salt);let zip,plain,part;
  try{
    const c=createDecipheriv('aes-256-gcm',key,Buffer.from(m.iv,'base64url'));c.setAAD(aad(m));c.setAuthTag(Buffer.from(m.tag,'base64url'));
    try{part=c.update(Buffer.from(m.data,'base64url'));zip=Buffer.concat([part,c.final()]);}catch{throw new Error('عبارة الاستعادة غير صحيحة أو الملف غير سليم.');}
    plain=gunzipSync(zip,{maxOutputLength:maxPlain});
    return {createdAt:m.createdAt,state:state(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain)))};
  }finally{key.fill(0);part?.fill(0);zip?.fill(0);plain?.fill(0);}
}
module.exports={format,version,maxPlain,maxArchive,phrase,state,seal,open};
