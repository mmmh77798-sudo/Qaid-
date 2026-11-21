'use strict';
/* RFC 6238 (HMAC-SHA1, 30 s, six digits). Recovery codes carry 80 random bits each. */
const {randomBytes,createHmac,createHash,timingSafeEqual}=require('node:crypto');
const L=require('../app/ledger.js');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encode(bytes){
  let out='',bits=0,v=0;
  for(const byte of bytes){v=(v<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(v>>>bits)&31];}v&=(1<<bits)-1;}
  return bits?out+alphabet[(v<<(5-bits))&31]:out;
}
function decode(text){
  const out=[];let bits=0,v=0;
  for(const char of text){const n=alphabet.indexOf(char);if(n<0)throw new Error('Invalid TOTP key');v=(v<<5)|n;bits+=5;if(bits>=8){bits-=8;out.push((v>>>bits)&255);v&=(1<<bits)-1;}}
  return Buffer.from(out);
}
const seed=()=>encode(randomBytes(20));
const step=now=>Math.floor(now/30000);
function code(secret,counter,digits=6){
  const bytes=Buffer.alloc(8);bytes.writeBigUInt64BE(BigInt(counter));
  const h=createHmac('sha1',decode(secret)).update(bytes).digest();
  const n=h.readUInt32BE(h[h.length-1]&15)&0x7fffffff;
  return String(n%(10**digits)).padStart(digits,'0');
}
const exact=(a,b)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cleaned=input=>typeof input==='string'&&input.length<61?L.digits(input).toUpperCase().replace(/[-\s]/g,''):'';
const digest=x=>createHash('sha256').update('qayd-recovery-v1:'+x).digest('hex');
function timeMatch(secret,input,now=Date.now(),last=-1){
  const value=cleaned(input);if(!/^\d{6}$/.test(value))return null;
  const current=step(now);
  for(const candidate of [current,current-1,current+1])if(candidate>=0&&candidate>last&&exact(code(secret,candidate),value))return candidate;
  return null;
}
function begin(secret,accepted){
  const backups=[];while(backups.length<8){const raw=encode(randomBytes(10));if(!backups.includes(raw))backups.push(raw);}
  return {mfa:{secret,last:accepted,recovery:backups.map(digest)},codes:backups.map(x=>x.match(/.{4}/g).join('-'))};
}
function accept(mfa,input,now=Date.now()){
  const value=cleaned(input);
  if(/^[A-Z2-7]{16}$/.test(value)){
    const d=digest(value),index=mfa.recovery.findIndex(x=>exact(x,d));
    if(index>=0)return {value:{...mfa,recovery:mfa.recovery.filter((_,i)=>i!==index)},recovered:true};
  }
  const time=timeMatch(mfa.secret,value,now,mfa.last);
  return time===null?null:{value:{...mfa,last:time},recovered:false};
}
module.exports={encode,decode,seed,step,code,timeMatch,begin,accept};
