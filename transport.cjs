'use strict';
/* Only a local/private peer explicitly configured as the reverse proxy may attest TLS. */
const {isIP}=require('node:net');
const v4=address=>String(address||'').toLowerCase().replace(/^::ffff:/,'');
function privatePeer(address){
  const value=v4(address),family=isIP(value);
  if(family===4){const [a,b]=value.split('.').map(Number);return a===127||a===10||a===192&&b===168||a===172&&b>=16&&b<=31;}
  return family===6&&(value==='::1'||/^f[cd][0-9a-f]{2}:/.test(value));
}
function proxied(req,trustProxy){return trustProxy===true&&privatePeer(req.socket.remoteAddress)&&req.headers['x-forwarded-proto']==='https';}
function secure(req,trustProxy){return req.socket.encrypted===true||proxied(req,trustProxy);}
function clientAddress(req,trustProxy){
  const sent=req.headers['x-forwarded-for'];
  return proxied(req,trustProxy)&&typeof sent==='string'&&sent.length<=45&&isIP(v4(sent))?v4(sent):v4(req.socket.remoteAddress);
}
module.exports={privatePeer,proxied,secure,clientAddress};
