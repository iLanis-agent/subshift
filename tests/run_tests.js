/* SubShift tests: shared engine vs tests/expected.json (independent python
   SRT/VTT oracle). Corpus loads raw files or .b64 mirrors. */
'use strict';
const fs=require('fs'),path=require('path');
const S=require(path.join(__dirname,'..','engine.js'));
const items=JSON.parse(fs.readFileSync(path.join(__dirname,'expected.json'),'utf8')).items;
let pass=0,fail=0;
function ok(){pass++;}
function bad(l,a,b){fail++;console.log('FAIL '+l+': got '+JSON.stringify(a)+' want '+JSON.stringify(b));}
function eq(l,a,b){if(a===b)ok();else bad(l,a,b);}
function arr(l,a,b){eq(l,JSON.stringify(a),JSON.stringify(b));}
function load(file){
  const p=path.join(__dirname,'corpus',file);
  if(fs.existsSync(p))return fs.readFileSync(p,'utf8');
  return Buffer.from(fs.readFileSync(p+'.b64','utf8').trim(),'base64').toString('utf8');
}
for(const it of items){
  const T=it.file+' ';
  const text=load(it.file);
  const p=S.parse(text);
  eq(T+'format',p.format,it.format);
  eq(T+'cues',p.cues.length,it.cue_count);
  arr(T+'ids',p.cues.map(c=>c.id),it.ids);
  arr(T+'starts',p.cues.map(c=>c.start),it.starts);
  arr(T+'ends',p.cues.map(c=>c.end),it.ends);
  arr(T+'settings',p.cues.map(c=>c.settings),it.settings);
  arr(T+'texts',p.cues.map(c=>c.text),it.texts);
  eq(T+'warnings',p.warnings.length,it.warning_count);
  eq(T+'skipped',p.skipped_blocks,it.skipped_blocks);
  eq(T+'overlaps',S.overlapCount(p),it.overlap_count);
  // shift +2500
  const p2=S.parse(text);S.shiftMs(p2,2500);
  arr(T+'shift',p2.cues.map(c=>c.start),it.shift_2500_starts);
  // stretch 25->23.976
  const p3=S.parse(text);S.stretch(p3,1.042709);
  arr(T+'stretchS',p3.cues.map(c=>c.start),it.stretch_starts);
  arr(T+'stretchE',p3.cues.map(c=>c.end),it.stretch_ends);
  // convert to the other format
  eq(T+'convert',S.convert(S.parse(text),it.convert_target),it.convert_output);
  // round-trip: serialize in own format, reparse, same starts/ends
  const own=it.format==='srt'?S.serializeSrt(p):S.serializeVtt(p);
  const rp=S.parse(own);
  arr(T+'roundtrip',rp.cues.map(c=>[c.start,c.end]),p.cues.map(c=>[c.start,c.end]));
}
// unit: fromMs flooring, negative clamp, fraction padding
eq('fromMs',S.fromMs(3723999,false),'01:02:03,999');
eq('fromMs-neg',S.fromMs(-5,true),'00:00:00.000');
eq('parseTime-1dig',S.parseTime('0:00:05,5'),5500);
eq('parseTime-2dig',S.parseTime('00:00:01,00'),1000);
console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
