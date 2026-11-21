'use strict';
const {scrypt,randomBytes,timingSafeEqual,createHash}=require('node:crypto');
const {promisify}=require('node:util');
const P=require('./policy.cjs');
const work=promisify(scrypt),options={N:65536,r:8,p:2,maxmem:96*1024*1024};
const inactive=30*60*1000,lifetime=8*60*60*1000;
const secret=(n=32)=>randomBytes(n).toString('base64url');
const keyFor=v=>createHash('sha256').update(v).digest('hex');
const loginId=value=>{
  if(typeof value!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/).test(value))P.fail(400,'اسم الدخول من 3 إلى 32 رمزًا لاتينيًا أو رقمًا، ويمكن استخدام النقطة والشرطة.');
  return value.toLowerCase();
};
const acceptable=value=>{
  if(typeof value!=='string'||value.length>128||value.trim().length<12||/[\u0000-\u001f\u007f]/.test(value))P.fail(400,'استخدم كلمة سر من 12 إلى 128 حرفًا دون أحرف تحكم.');
  return value;
};
let busy=0;
async function derived(value,salt){
  if(busy>=4)P.fail(429,'هناك طلبات دخول كثيرة. انتظر قليلًا ثم حاول مجددًا.');
  busy++;
  try{return await work(value,Buffer.from(salt,'base64url'),32,options);}finally{busy--;}
}
async function hash(value){const salt=secret(16);return {salt,digest:(await derived(acceptable(value),salt)).toString('base64url')};}
const dummy={salt:secret(16),digest:secret(32)};
async function verify(value,h=dummy){
  if(typeof value!=='string'||!value.length||value.length>128)return false;
  return timingSafeEqual(await derived(value,h.salt),Buffer.from(h.digest,'base64url'));
}
const makeUser=(login,name,password,{owner=false,mustChange=!owner}={})=>({id:P.token(),login:loginId(login),name:P.text(name,60,{required:true}),password,
  owner,enabled:true,mustChange,grants:[],version:P.token(),epoch:secret(18)});
const bump=(u,revoke=false)=>({...u,version:P.token(),...(revoke?{epoch:secret(18)}:{})});
const LOGIN_COOKIE='__Host-qayd_session';
const cookieToken=req=>{
  const values=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(LOGIN_COOKIE+'='));
  return values.length===1?values[0].slice(LOGIN_COOKIE.length+1):'';
};
const sessionCookie=(token='')=>`${LOGIN_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${token?Math.floor(lifetime/1000):0}`;
const unauth=()=>P.fail(401,'انتهت الجلسة أو لم تسجّل الدخول.','login');
class Sessions{
  constructor(demo=false){this.demo=demo;this.rows=new Map();}
  prune(now=Date.now()){
    for(const [k,s] of this.rows)if(now>=s.until||now-s.touched>=inactive)this.rows.delete(k);
  }
  issue(user,realm,{previous='',commit=null}={}){
    const now=Date.now();this.prune(now);
    const remove=new Set(previous?[previous]:[]),same=[];
    for(const [k,s] of this.rows){
      if(s.realm!==realm||s.id!==user.id||remove.has(k))continue;
      if(s.epoch===user.epoch)same.push(k);else remove.add(k);
    }
    if(same.length>=10)remove.add(same[0]);
    if(this.rows.size-[...remove].filter(k=>this.rows.has(k)).length>=2000)P.fail(429,'عدد الجلسات النشطة كبير. حاول لاحقًا.');
    const token=secret();
    // A rejected CAS must not consume a factor or replace a live browser session.
    if(commit)commit();
    for(const k of remove)this.rows.delete(k);
    this.rows.set(keyFor(token),{id:user.id,epoch:user.epoch,touched:now,until:now+lifetime,realm});return token;
  }
  revokeUser(realm,user){for(const [k,s] of this.rows)if(s.realm===realm&&s.id===user.id&&s.epoch!==user.epoch)this.rows.delete(k);}
  get(req,repos){
    const auth=this.demo?(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]||'':cookieToken(req);
    if(!/^[A-Za-z0-9_-]{43}$/.test(auth))unauth();
    const k=keyFor(auth),s=this.rows.get(k),now=Date.now();
    if(!s||now>=s.until||now-s.touched>=inactive){this.rows.delete(k);unauth();}
    const repo=repos(s.realm),snapshot=repo?.load(),user=snapshot?.s.users.find(u=>u.id===s.id);
    if(!user?.enabled||user.epoch!==s.epoch){this.rows.delete(k);unauth();}
    if(req.headers['x-qayd-passive']!=='1')s.touched=now;return {snapshot,user,repo,key:k,realm:s.realm};
  }
  drop(key){this.rows.delete(key);}
}
function limiter(){
  const buckets=new Map();
  return (key,max,span)=>{
    const now=Date.now();
    if(buckets.size>=2500)for(const [k,x] of buckets)if(x.exp<=now)buckets.delete(k);
    const existing=buckets.get(key);
    const b=existing&&existing.exp>now?existing:{exp:now+span,n:0};
    if(b.n>=max||!existing&&buckets.size>=3000)P.fail(429,'تكررت المحاولات. انتظر بضع دقائق ثم أعد المحاولة.');
    b.n++;buckets.set(key,b);
  };
}
module.exports={secret,loginId,acceptable,hash,verify,makeUser,bump,sessionCookie,unauth,Sessions,limiter};
