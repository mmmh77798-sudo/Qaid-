'use strict';
/* Single-row SQLite revisions: every write is a compare-and-swap transaction. */
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync,backup}=require('node:sqlite');
const P=require('./policy.cjs');
class SQLiteStore{
  constructor(file){
    const full=path.resolve(file);
    fs.mkdirSync(path.dirname(full),{recursive:true,mode:0o700});
    const fd=fs.openSync(full,'a',0o600);fs.closeSync(fd);fs.chmodSync(full,0o600);
    this.db=new DatabaseSync(full);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS desk (id INTEGER PRIMARY KEY CHECK(id=1), seq INTEGER NOT NULL, document TEXT NOT NULL) STRICT;');
    this.stamp=this.db.prepare('SELECT seq FROM desk WHERE id=1');
    this.read=this.db.prepare('SELECT seq,document FROM desk WHERE id=1');
    this.write=this.db.prepare('UPDATE desk SET seq=seq+1, document=? WHERE id=1 AND seq=?');
  }
  load(){
    const meta=this.stamp.get();if(!meta)return null;
    if(this.cache?.seq===meta.seq)return this.cache;
    const row=this.read.get(),s=JSON.parse(row.document);
    if(s.schema!==1||!s.users?.some(u=>u.owner)||!Array.isArray(s.audit))throw new Error('Invalid shared database state');
    this.cache={seq:row.seq,s};return this.cache;
  }
  init(s){
    if(!this.db.prepare('INSERT OR IGNORE INTO desk(id,seq,document) VALUES(1,1,?)').run(JSON.stringify(s)).changes)P.fail(409,'يوجد مالك مُهيّأ بالفعل.');
  }
  commit(previous,s){
    if(Buffer.byteLength(JSON.stringify(s.ledger))>P.maxDocument)P.fail(422,'حجم الدفتر المشترك تجاوز الحد المسموح (20 ميغابايت).');
    const result=this.write.run(JSON.stringify(s),previous.seq);
    if(result.changes!==1)P.stale();
    this.cache={seq:previous.seq+1,s};
  }
  close(){this.db.close();}
  async snapshot(dest){
    const file=path.resolve(dest);
    const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);
    try{await backup(this.db,file);fs.chmodSync(file,0o600);}catch(e){fs.rmSync(file,{force:true});throw e;}
  }
}
class MemoryStore{
  constructor(s){this.current={seq:1,s};}
  load(){return this.current;}
  commit(previous,s){
    if(previous!==this.current)P.stale();
    if(Buffer.byteLength(JSON.stringify(s.ledger))>512*1024)P.fail(422,'مساحة التجربة محدودة.');
    this.current={seq:previous.seq+1,s};
  }
}
module.exports={SQLiteStore,MemoryStore};
