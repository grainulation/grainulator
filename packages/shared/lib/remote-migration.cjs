/** Canonical receipt gate only; no historical parser or remote discovery. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const config=require('./project-config.cjs');
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
function assertMarker(state,destination,newSource,sourceId) {
 const file=path.join(state,'remote-migration.json');if(!fs.existsSync(file))return;
 let marker;try{marker=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error('Remote migration metadata is invalid; publication is blocked.');}
 if(marker.state==='complete'&&!marker.ambiguity&&Array.isArray(marker.pages)&&marker.pages.length===0&&marker.local_resolution){
   const receiptPath=path.resolve(state,marker.local_resolution.file||'');
   const relative=path.relative(fs.realpathSync(state),fs.realpathSync(receiptPath));
   if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('Remote resolution receipt escapes its state directory.');
   const bytes=fs.readFileSync(receiptPath);if(hash(bytes)!==marker.local_resolution.sha256)throw new Error('Remote resolution receipt changed.');
   const decision=JSON.parse(bytes), history=path.resolve(state,decision.history?.file||'');
   const historicalRelative=path.relative(fs.realpathSync(state),fs.realpathSync(history));
   if(historicalRelative==='..'||historicalRelative.startsWith(`..${path.sep}`)||path.isAbsolute(historicalRelative)||hash(fs.readFileSync(history))!==decision.before_sha256||decision.schema!=='grainulator.remote-resolution.v1'||decision.decision!=='not-configured'||decision.complete_inventory!==true||decision.result_sha256!==hash({pages:marker.pages,dispositions:marker.reviewed_not_configured||[]})||!decision.evidence?.length)throw new Error('Remote not-configured decision is not completely documented.');
   return;
 }
 if(marker.schema!=='grainulator.remote-migration.v1'||marker.state!=='complete'||marker.ambiguity||!Array.isArray(marker.pages)||!marker.pages.length||!Array.isArray(marker.bindings)||!marker.receipt)throw new Error('Remote identity migration requires explicit reconciliation before publication or discovery.');
 const selected=path.resolve(state,marker.receipt.file||'');
 const relative=path.relative(fs.realpathSync(state),fs.realpathSync(selected));
 if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('Remote migration receipt escapes its evidence state directory.');
 const bytes=fs.readFileSync(selected);if(hash(bytes)!==marker.receipt.sha256)throw new Error('Remote migration receipt changed.');
 const receipt=JSON.parse(bytes);
 if(receipt.schema!=='grainulator.remote-receipt.v1'||!Array.isArray(receipt.pages)||receipt.pages.some(p=>p.state!=='confirmed'))throw new Error('Remote migration is not confirmed.');
 for(const page of marker.pages){
   const inventory_sha256=hash(page), bindings=marker.bindings.filter(binding=>binding.inventory_sha256===inventory_sha256);
   if(bindings.length!==1)throw new Error('Remote migration inventory has unresolved associations.');
   const binding=bindings[0];if(typeof binding.sourceId!=='string'||!binding.sourceId)throw new Error('Remote migration source identity is missing.');
   if(!receipt.pages.some(record=>record.inventory_sha256===inventory_sha256&&record.sourceId===binding.sourceId&&record.format===binding.format&&JSON.stringify(record.destination)===JSON.stringify(binding.destination)&&record.state==='confirmed'))throw new Error('Remote migration destination association is not confirmed.');
 }
 if(destination){
  const known=sourceId&&marker.bindings.find(binding=>binding.sourceId===sourceId);
  const matches=binding=>binding.destination.site===destination.site&&binding.destination.space===destination.space&&binding.destination.pageId===destination.pageId;
  if(known&&!matches(known))throw new Error('Known migrated source requires its confirmed site, space and page ID; creation fallback is blocked.');
  if(!marker.bindings.some(matches)){
    if(destination.pageId||typeof newSource!=='string'||!newSource.trim()||marker.bindings.some(binding=>binding.sourceId===newSource)||known)throw new Error('Publishing requires a reconciled destination, or explicit newSource for a genuinely new collection.');
  }
 }
}
function assertRemoteMigrationReady(dir=process.cwd(),options={}) {
 if(options.newSource&&options.destination?.pageId)throw new Error('newSource cannot be combined with an existing page ID.');
 const scope=config.resolveScopeRoot(dir,options);let current=path.resolve(dir);
 for(;;){assertMarker(path.join(current,'.grainulator','evidence'),options.destination,options.newSource||options.destination?.newSource,options.sourceId||options.destination?.sourceId);if(fs.realpathSync(current)===fs.realpathSync(scope))break;const parent=path.dirname(current);if(parent===current)break;current=parent;}
}
module.exports={assertRemoteMigrationReady};
