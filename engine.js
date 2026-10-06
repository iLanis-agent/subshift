/* SubShift engine: parse/shift/stretch/convert SRT and WebVTT subtitles.
   Pure JS, no deps, browser + Node. Times are integer milliseconds. */
(function(root,factory){
  if(typeof module==='object'&&module.exports){module.exports=factory();}
  else{root.SubShift=factory();}
})(typeof self!=='undefined'?self:this,function(){
'use strict';
function toMs(h,m,s,ms){return ((+h)*60+(+m))*60000+(+s)*1000+(+ms);}
function fromMs(t,dot){
  if(t<0)t=0;t=Math.round(t);
  var h=Math.floor(t/3600000),r=t%3600000,m=Math.floor(r/60000);r%=60000;
  var s=Math.floor(r/1000),ms=r%1000;
  function p(n,l){n=String(n);while(n.length<l)n='0'+n;return n;}
  return p(h,2)+':'+p(m,2)+':'+p(s,2)+(dot?'.':',')+p(ms,3);
}
var TC=/(\d{1,2}):(\d{2}):(\d{2})([.,])(\d{1,3})/g;
function parseTime(line){
  var m=/(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(line);
  if(!m)return null;
  var ms=m[4];while(ms.length<3)ms=ms+'0'; // 1-2 digit fraction = tenths/hundredths
  return toMs(m[1],m[2],m[3],ms);
}
function parse(text){
  text=String(text).replace(/^﻿/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  var isVtt=/^WEBVTT([ \t]|$)/.test(text.split('\n')[0]||'');
  var lines=text.split('\n'),i,cues=[],warnings=[],notes=0;
  if(isVtt){i=1;while(i<lines.length&&lines[i].trim()!=='')i++;}
  else i=0;
  var auto=0;
  while(i<lines.length){
    while(i<lines.length&&lines[i].trim()==='')i++;
    if(i>=lines.length)break;
    var first=lines[i];
    if(isVtt&&/^(NOTE|STYLE|REGION)([ \t]|$)/.test(first)){
      notes++;
      while(i<lines.length&&lines[i].trim()!=='')i++;
      continue;
    }
    // cue: optional identifier line, then timecode line
    var id=null,tline=first;
    if(!/-->/.test(first)){
      if(i+1<lines.length&&/-->/.test(lines[i+1])){id=first.trim();tline=lines[i+1];i++;}
    }
    var arrow=tline.indexOf('-->');
    if(arrow<0){warnings.push('skipped unparseable block at line '+(i+1));while(i<lines.length&&lines[i].trim()!=='')i++;continue;}
    var startStr=tline.slice(0,arrow).trim(),rest=tline.slice(arrow+3).trim();
    var endStr=rest.split(/[ \t]/)[0];
    var start=parseTime(startStr),end=parseTime(endStr);
    if(start===null||end===null){warnings.push('bad timecode: '+tline.trim().slice(0,40));i++;while(i<lines.length&&lines[i].trim()!=='')i++;continue;}
    var settings=isVtt?rest.slice(endStr.length).trim():'';
    i++;
    var payload=[];
    while(i<lines.length&&lines[i].trim()!==''){payload.push(lines[i]);i++;}
    auto++;
    cues.push({index:auto,id:id,start:start,end:end,settings:settings,text:payload.join('\n')});
  }
  for(var c=0;c<cues.length;c++){
    if(cues[c].end<=cues[c].start)warnings.push('cue '+cues[c].index+' has non-positive duration');
    if(c>0&&cues[c].start<cues[c-1].start)warnings.push('cue '+cues[c].index+' starts before the previous cue');
  }
  return {format:isVtt?'vtt':'srt',cues:cues,warnings:warnings,skipped_blocks:notes};
}
function shiftMs(parsed,ms){
  parsed.cues.forEach(function(c){c.start=Math.max(0,c.start+ms);c.end=Math.max(0,c.end+ms);});
  return parsed;
}
function stretch(parsed,ratio){
  parsed.cues.forEach(function(c){c.start=Math.round(c.start*ratio);c.end=Math.round(c.end*ratio);});
  return parsed;
}
function overlapCount(parsed){
  var n=0;
  for(var i=1;i<parsed.cues.length;i++)if(parsed.cues[i].start<parsed.cues[i-1].end)n++;
  return n;
}
function serializeSrt(parsed){
  return parsed.cues.map(function(c,i){
    return (i+1)+'\n'+fromMs(c.start,false)+' --> '+fromMs(c.end,false)+'\n'+c.text;
  }).join('\n\n')+'\n';
}
function serializeVtt(parsed){
  var out='WEBVTT\n\n';
  out+=parsed.cues.map(function(c){
    var id=c.id?c.id+'\n':'';
    var set=c.settings?' '+c.settings:'';
    return id+fromMs(c.start,true)+' --> '+fromMs(c.end,true)+set+'\n'+c.text;
  }).join('\n\n');
  return out+'\n';
}
function convert(parsed,target){
  return target==='vtt'?serializeVtt(parsed):serializeSrt(parsed);
}
return {parse:parse,shiftMs:shiftMs,stretch:stretch,overlapCount:overlapCount,
        serializeSrt:serializeSrt,serializeVtt:serializeVtt,convert:convert,
        fromMs:fromMs,toMs:toMs,parseTime:parseTime};
});
