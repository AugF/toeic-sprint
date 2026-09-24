#!/usr/bin/env node

/**
 * Rebuild the user-visible Part 1–4 transcripts from the published audio.
 *
 * The legacy text was extracted from printed answer pages, so page ornaments,
 * question numbers and adjacent columns leaked into the website.  Audio is the
 * source of truth here.  OCR is used only as a coverage check; it is never
 * copied into the rebuilt transcript.
 *
 * The command is read-only unless --write is supplied.  Whisper output is
 * cached by the SHA-256 of the model and audio so interrupted runs resume.
 */

import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdtemp,readFile,readdir,rename,rm,stat,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const defaultDataRoot=path.join(projectRoot,"public/data/banks");
const defaultAssetRoot=path.join(projectRoot,"public/assets");
const defaultCacheRoot=path.join(projectRoot,"outputs/listening-transcripts");
const SCHEMA="listening_transcript_v2";
const FORBIDDEN=/[©®™°]|(?:^|\s)[<>{}\[\]|_=~@]+(?:\s|$)|\b(?:BLANK_AUDIO|End of recording|Go on to the next page)\b/i;
const INTRO=/^\s*(?:Number\s+\d+\s*[.,:]?\s*)?(?:Questions?\s+\d+\s+(?:through|to|and)\s+\d+\s+refer\s+to\s+the\s+following\s+(?:conversation|talk)\s*[.,:]?\s*)/i;
const VISUAL_REFERENCE_FRAGMENT=/^(?:(?:and|with)\s+(?:(?:[a-z][a-z -]{0,48}\s+)?(?:chart|graphic|graph|list|brochure|map|schedule|table|receipt|menu|sign|coupon|order|bill|plan|agenda|results|keys|page|layout|card|flyer|machine|poster|timeline|calendar|directory))|information and ticket)\s*[.!?]\s*/i;
// An open-ended "letters until the next period" can consume the first spoken
// sentence when ASR omits the punctuation after the direction. Enumerate only
// material names; unknown introductions must be reviewed, never guessed away.
const MATERIAL_TYPE="(?:conversation(?: with three speakers)?|excerpt from (?:a|an) (?:radio interview|meeting|workshop)|telephone message|recorded message|radio broadcast|news report|tour information|announcement|advertisement|instructions|introduction|broadcast|podcast|message|speech|talk)";
const GRAPHIC_TYPE="(?:list of classes|airport departure board|presentation slide|production schedule|building directory|inventory list|assignment list|purchase order|restaurant bill|business card|seating chart|fundraising flyer|weather report|product samples|shirt options|voting results|room layouts|store layout|ticket machine|order form|floor plan|price list|sales graph|pie chart|bar graph|project plan|web page|chart|graphic|graph|list|brochure|map|schedule|table|receipt|menu|sign|coupon|order|bill|plan|agenda|results|keys|page|layout|card|flyer|machine|poster|timeline|calendar|directory|ticket|contract|report|logos)";

export function splitPart34Introduction(raw,start,end){
  const normalized=normalizeText(raw);
  const expected=new RegExp(`^(?:(?:page|[A-Za-z]{1,3})[.:]?\\s+)?(?:Questions?\\s+)?${start}\\s+(?:through|to|and)\\s+${end}[,.:]?\\s+refer\\s+to\\s+the\\s+following\\s+${MATERIAL_TYPE}(?:\\s+(?:and|with)\\s+${GRAPHIC_TYPE})?(?=[.,:!?\\s]|$)[.,:!?]*\\s*`,"i");
  const match=normalized.match(expected);
  if(!match)throw new Error(`missing or unknown spoken Questions ${start} through ${end} introduction`);
  let body=normalized.slice(match[0].length);
  // ASR sometimes puts a period before the graphic label. Strip it only here,
  // while processing a verified instruction, not from an arbitrary body line.
  body=body.replace(new RegExp(`^(?:and|with)\\s+${GRAPHIC_TYPE}[.!?:]\\s*`,"i"),"");
  if(/^(?:and|with)\b/i.test(body))throw new Error("ambiguous material introduction; review audio boundary");
  return {introduction:normalized.slice(0,normalized.length-body.length),body};
}

function sha256(value){return createHash("sha256").update(value).digest("hex")}
const NUMBER_WORDS={1:"one",2:"two",3:"three",4:"four",5:"five",6:"six",7:"seven",8:"eight",9:"nine",10:"ten",11:"eleven",12:"twelve",13:"thirteen",14:"fourteen",15:"fifteen",16:"sixteen",17:"seventeen",18:"eighteen",19:"nineteen",20:"twenty",21:"twenty[- ]one",22:"twenty[- ]two",23:"twenty[- ]three",24:"twenty[- ]four",25:"twenty[- ]five",26:"twenty[- ]six",27:"twenty[- ]seven",28:"twenty[- ]eight",29:"twenty[- ]nine",30:"thirty",31:"thirty[- ]one"};
function spokenNumberPattern(number){return `(?:${number}|${NUMBER_WORDS[number]||number})`}
async function fileSha(file){return sha256(await readFile(file))}
function words(value){return String(value||"").match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]}
function normalizedTokens(value){return words(value).map(x=>x.toLowerCase().replace(/[’]/g,"'"))}
function normalizeText(value){
  return String(value||"").normalize("NFKC")
    .replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
    .replace(/\s+([,.;:!?])/g,"$1").replace(/([,.;:!?])(?=[A-Za-z])/g,"$1 ")
    .replace(/\bwww\.\s+([A-Za-z0-9-]+)\.\s+(com|org|net|edu|gov)\b/gi,"www.$1.$2")
    .replace(/\b([ap])\.\s+m\./gi,"$1.m.")
    .replace(/\s+/g," ").trim();
}
function coverage(reference,candidate){
  const a=normalizedTokens(reference),b=new Set(normalizedTokens(candidate));
  if(!a.length)return 1;
  return a.filter(token=>b.has(token)).length/a.length;
}
function repetitionHazard(value){
  const tokens=normalizedTokens(value);
  for(let i=0;i<tokens.length;i++){
    if(tokens.slice(i,i+5).length===5&&new Set(tokens.slice(i,i+5)).size===1)return true;
    if(i+9<=tokens.length){const a=tokens.slice(i,i+3).join(" ");if(a===tokens.slice(i+3,i+6).join(" ")&&a===tokens.slice(i+6,i+9).join(" "))return true}
    for(let width=2;width<=6;width++){
      if(i+width*4>tokens.length)break;
      const phrase=tokens.slice(i,i+width).join(" ");
      if([1,2,3].every(offset=>phrase===tokens.slice(i+offset*width,i+(offset+1)*width).join(" ")))return true;
    }
  }
  return false;
}
function cleanLegacyForCoverage(value){
  return normalizeText(value).replace(/[©®™°@|_=~<>\[\]{}]/g," ").replace(/\b[A-Z]{1,2}\b/g," ");
}
function stripIntro(value){return normalizeText(value).replace(INTRO,"").trim()}
function stripNavigation(value){
  return normalizeText(value)
    .replace(/\s+Go on to the next page\.?[\s\S]*$/i,"")
    .replace(/\s+This is the end of (?:Part|the)\s+\w+\.?[\s\S]*$/i,"").trim();
}
export function sentenceLines(value,{stripLegacyIntro=true}={}){
  // Split only at plausible sentence boundaries. Protect title abbreviations
  // and the internal dot in a.m./p.m. so the UI never renders "p." / "m."
  // as separate lines.
  const dot="\uE000";
  const text=(stripLegacyIntro?stripIntro(value).replace(VISUAL_REFERENCE_FRAGMENT,""):normalizeText(value))
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Mt|No)\./g,`$1${dot}`)
    .replace(/\b([ap])\.m\./gi,`$1${dot}m.`);
  const pieces=text.split(/(?<=[.!?])\s+(?=(?:["'“‘(]*[A-Z0-9]))/).map(x=>x.trim()).filter(Boolean);
  return pieces.join("\n").replaceAll(dot,".");
}
function tokenSpans(value){
  const spans=[];const regex=/[A-Za-z]+(?:['’-][A-Za-z]+)*/g;let match;
  while((match=regex.exec(value)))spans.push({token:match[0].toLowerCase().replace(/[’]/g,"'"),start:match.index,end:regex.lastIndex});
  return spans;
}
export function mergeTranscriptChunks(chunks){
  let merged="";
  for(const raw of chunks.map(normalizeText).filter(Boolean)){
    if(!merged){merged=raw;continue}
    const previous=tokenSpans(merged),next=tokenSpans(raw);let overlap=0;
    const max=Math.min(18,previous.length,next.length);
    for(let size=max;size>=2;size--){
      const left=previous.slice(-size).map(x=>x.token).join(" ");
      const right=next.slice(0,size).map(x=>x.token).join(" ");
      if(left===right){overlap=size;break}
    }
    if(overlap){
      const cut=next[overlap-1].end;
      merged=`${merged} ${raw.slice(cut).replace(/^[\s,.;:!?-]+/,"")}`.trim();
    }else merged=`${merged} ${raw}`.trim();
  }
  return normalizeText(merged);
}

export function parsePart1(raw,expectedId){
  const number=spokenNumberPattern(expectedId);
  let text=stripNavigation(raw);
  // Some clipped tracks start with "Picture marked number ..." while ASR can
  // render that as "You're marked number ..." or omit the word "number".
  // The expected number plus the four labelled choices still anchors the unit.
  const prefix=new RegExp(`^(?=[\\s\\S]{0,100}\\b(?:number\\s+)?${number}\\b)[\\s\\S]*?(?=A\\.\\s)`,"i");
  text=text.replace(prefix,"");
  // Do not stop choice D at its first full stop: abbreviations and multi-
  // sentence responses must remain intact. Only a known next-question cue is
  // a safe boundary for trailing audio from the next track.
  text=text.replace(new RegExp(`(?<=[.!?])\\s+Number\\s+${spokenNumberPattern(Number(expectedId)+1)}\\b[\\s\\S]*$`,"i"),"");
  const match=text.match(/^A\.\s*(.+?[.!?])\s+B\.\s*(.+?[.!?])\s+C\.\s*(.+?[.!?])\s+D\.\s*(.+[.!?])$/i);
  if(!match)throw new Error("cannot parse four labelled Part 1 choices");
  const choices=match.slice(1).map(normalizeText);
  if(choices.some(x=>words(x).length<3||words(x).length>30||FORBIDDEN.test(x)||repetitionHazard(x)))throw new Error("invalid Part 1 choice");
  return choices.map((choice,index)=>`${"ABCD"[index]}. ${choice}`).join("\n");
}

export function parsePart2(raw,expectedId){
  const text=stripNavigation(raw);
  const head=text.match(new RegExp(`^Number\\s+${spokenNumberPattern(expectedId)}\\b[\\s.,:;-]*`,"i"));
  if(!head&&/^Number\s+/i.test(text))throw new Error(`missing spoken Number ${expectedId}`);
  const body=head?text.slice(head[0].length):text;
  let match=body.match(/^(.+?)\s+A[.)]\s*(.+?)\s+B[.)]\s*(.+?)\s+C[.)]\s*(.+)$/)
    ||body.match(/^(.+?)\s+A\s+(.+?)\s+B\s+(.+?)\s+C\s+(.+)$/);
  if(!match){
    // Punctuation-free ASR may spell the labels as a / B / see. Find B and C
    // first, then distinguish label A from the article by the response opener.
    const tail=body.match(/^(.*?)\s+(?:B|b)\s+(.+?)\s+(?:C|c|see)\s+(.+)$/);
    if(tail){
      const beforeB=tail[1];
      const responseStarter=/(?:^|\s)a\s+(?=(?:yes|no|i|you|he|she|it|we|they|actually|probably|maybe|whose|who|where|when|why|how|thank|thanks|okay|ok|sure|certainly|not|at|in|on|to|the|my|our|mr|ms|mrs)\b)/ig;
      let label;
      while(true){const candidate=responseStarter.exec(beforeB);if(!candidate)break;label=candidate}
      if(label){
        const question=beforeB.slice(0,label.index).trim();
        const choiceA=beforeB.slice(label.index+label[0].length).trim();
        match=[body,question,choiceA,tail[2],tail[3]];
      }
    }
  }
  if(!match)throw new Error("cannot parse Part 2 question and three choices");
  const [question,...choices]=match.slice(1).map(normalizeText);
  const semanticTokens=value=>String(value).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|[$€£]?\d+(?:[.,]\d+)*/g)||[];
  if(words(question).length<2||words(question).length>35||choices.some(x=>!semanticTokens(x).length||words(x).length>30))throw new Error("implausible Part 2 segment length");
  if([question,...choices].some(x=>FORBIDDEN.test(x)||repetitionHazard(x)))throw new Error("Part 2 contains navigation, OCR characters or repetition");
  return `${question}\n${choices.map((choice,index)=>`${"ABC"[index]}. ${choice}`).join("\n")}`;
}

export function parsePart34(raw,part,start,end,legacy=""){
  const {body}=splitPart34Introduction(raw,start,end);
  const transcript=sentenceLines(body,{stripLegacyIntro:false});
  const count=words(transcript).length;
  if(count<22||count>260)throw new Error(`implausible Part ${part} transcript length ${count}`);
  if(FORBIDDEN.test(transcript)||repetitionHazard(transcript))throw new Error(`Part ${part} contains navigation, OCR characters or repetition`);
  const legacyClean=cleanLegacyForCoverage(legacy);
  const legacyCount=words(legacyClean).length;
  const lengthRatio=legacyCount?count/legacyCount:1;
  const legacyCoverage=legacyCount?coverage(legacyClean,transcript):1;
  // A low ratio is a common Whisper failure mode where only the final window is
  // emitted.  Reject it instead of replacing a longer source with a fragment.
  if(legacyCount>=35&&lengthRatio<.62&&legacyCoverage<.58)throw new Error(`audio transcript appears truncated (ratio=${lengthRatio.toFixed(2)}, coverage=${legacyCoverage.toFixed(2)})`);
  return {transcript,metrics:{word_count:count,legacy_word_count:legacyCount,length_ratio:Number(lengthRatio.toFixed(3)),legacy_coverage:Number(legacyCoverage.toFixed(3))}};
}

function legacyPassageForCoverage(detail){
  const legacy=normalizeText(detail.context?.transcript||"");
  if(!legacy)return "";
  const firstQuestion=normalizeText(detail.items?.[0]?.question||"");
  if(firstQuestion){
    const boundary=legacy.toLowerCase().indexOf(firstQuestion.toLowerCase());
    if(boundary>0)return legacy.slice(0,boundary).trim();
  }
  // Without a reliable question boundary the OCR often contains the chart,
  // all questions, choices, translations and glossary. Comparing that whole
  // page to spoken audio creates false "truncated" failures, so skip OCR
  // coverage for this unit and rely on audio-duration coverage instead.
  return "";
}

function anchorPart34Intro(rawAnchor,candidate,detail){
  const ids=detail.items.map(item=>Number(item.item_id)),start=Math.min(...ids),end=Math.max(...ids);
  const hasRange=new RegExp(`(?:Questions?\\s+)?${start}\\s+(?:through|to|and)\\s+${end}[,.:]?\\s+refer\\s+to\\s+the\\s+following`,"i");
  if(hasRange.test(candidate))return candidate;
  try{return `${splitPart34Introduction(rawAnchor,start,end).introduction}${candidate}`}catch{return candidate}
}

export function invalidateChangedTranscriptTranslation(context,before,after){
  if(before===after)return;
  delete context.transcript_translation;
  delete context.transcript_translation_source;
  delete context.content_translation;
}

export function validatePublishedTranscript(detail){
  const source=detail.context?.transcript_source;
  const transcript=detail.context?.transcript;
  if(source?.schema_version!==SCHEMA)throw new Error("missing listening transcript provenance");
  if(!transcript||FORBIDDEN.test(transcript)||repetitionHazard(transcript))throw new Error("missing or unsafe listening transcript");
  if(detail.part===1&&transcript.split("\n").length!==4)throw new Error("Part 1 transcript must contain four lines");
  if(detail.part===2&&transcript.split("\n").length!==4)throw new Error("Part 2 transcript must contain question plus three choices");
  if((detail.part===3||detail.part===4)&&words(transcript).length<22)throw new Error("shared transcript is too short");
  const review=detail.context?.transcript_completeness_review;
  if(review&&(review.transcript_sha256!==sha256(transcript)||review.audio_sha256!==source.audio_sha256))throw new Error("reviewed transcript or audio no longer matches completeness evidence");
  return true;
}

async function atomicJson(file,value){
  const temporary=`${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`);
  await rename(temporary,file);
}
async function collectUnits(dataRoot){
  const units=[];
  for(const bank of (await readdir(dataRoot)).sort()){
    const unitRoot=path.join(dataRoot,bank,"units");
    for(const file of (await readdir(unitRoot)).filter(x=>x.endsWith(".json")).sort()){
      const detailPath=path.join(unitRoot,file);
      const detail=JSON.parse(await readFile(detailPath,"utf8"));
      if(detail.part>=1&&detail.part<=4)units.push({bank,detailPath,detail});
    }
  }
  return units;
}
function audioFileFor(unit,assetRoot){
  const ref=unit.detail.context?.audio_path;
  const key=typeof ref==="string"?ref:ref?.asset_key;
  if(!key)throw new Error("missing audio_path");
  return path.join(assetRoot,key);
}
function cacheFileFor(cacheRoot,modelHash,unit){return path.join(cacheRoot,modelHash.slice(0,16),unit.bank,`${unit.detail.unit_id}.json`)}
async function exists(file){try{await stat(file);return true}catch{return false}}

async function runWhisper({unit,audioFile,modelHash,cacheRoot,transcribe}){
  const audioHash=await fileSha(audioFile);
  const cacheFile=cacheFileFor(cacheRoot,modelHash,unit);
  if(await exists(cacheFile)){
    const cached=JSON.parse(await readFile(cacheFile,"utf8"));
    if(cached.audio_sha256===audioHash&&cached.model_sha256===modelHash&&cached.raw)return cached;
  }
  await import("node:fs/promises").then(fs=>fs.mkdir(path.dirname(cacheFile),{recursive:true}));
  const raw=await transcribe({audioFile});
  const cached={schema_version:SCHEMA,bank_id:unit.bank,unit_id:unit.detail.unit_id,part:unit.detail.part,audio_sha256:audioHash,model_sha256:modelHash,raw};
  await atomicJson(cacheFile,cached);
  return cached;
}

async function runProcess(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:["ignore","pipe","pipe"]});
    let output="",tail="";
    child.stdout.on("data",chunk=>{output+=chunk});
    child.stderr.on("data",chunk=>{tail=(tail+chunk).slice(-5000)});
    child.on("error",reject);
    child.on("exit",code=>code===0?resolve(output.trim()):reject(new Error(`${command} exit ${code}: ${tail.slice(-800)}`)));
  });
}
async function whisperOnce({audioFile,model,threads,offsetMs=0,durationMs=0,prompt=""}){
  const tempRoot=await mkdtemp(path.join(os.tmpdir(),"toeic-listening-"));
  const output=path.join(tempRoot,"transcript");
  const args=["-ng","-t",String(threads),"-m",model,"-l","en","-nt","-np","-otxt","-of",output];
  if(offsetMs)args.push("-ot",String(offsetMs));
  if(durationMs)args.push("-d",String(durationMs));
  if(prompt)args.push("--prompt",prompt);
  args.push("-f",audioFile);
  await runProcess("whisper-cli",args);
  const raw=(await readFile(`${output}.txt`,"utf8")).trim();
  await rm(tempRoot,{recursive:true,force:true});
  return raw;
}
async function promptedWhisper({cached,cacheFile,audioFile,transcribe,legacy}){
  if(cached.raw_prompted)return cached.raw_prompted;
  const promptWords=cleanLegacyForCoverage(legacy).split(/\s+/).filter(Boolean).slice(0,150);
  if(promptWords.length<25)throw new Error("legacy text is too short for an audio-alignment prompt");
  cached.raw_prompted=await transcribe({audioFile,prompt:promptWords.join(" ")});
  cached.prompt_token_count=promptWords.length;
  await atomicJson(cacheFile,cached);
  return cached.raw_prompted;
}
async function audioDurationMs(audioFile){
  const value=await runProcess("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",audioFile]);
  const duration=Math.round(Number(value)*1000);if(!Number.isFinite(duration)||duration<=0)throw new Error("cannot determine audio duration");return duration;
}
export async function transcribeAudioWindows({audioFile,duration,transcribe}){
  // Old 0/21/42-second windows sometimes recognized just the introduction in
  // the first window, silently losing all speech between it and second 21.
  // Retry from the actual end of the direction; retain raw windows for review.
  const windowMs=20000,stepMs=15000;
  const first=await transcribe({audioFile,offsetMs:0,durationMs:Math.min(windowMs,duration),withMetadata:true});
  const firstRaw=typeof first==="string"?first:first.raw;
  const direction=(first.segments||[]).filter(segment=>/refer\s+to\s+the\s+following/i.test(segment.text)).at(-1);
  const detectedBoundary=direction?Math.round(direction.end*1000)+50:5000;
  const bodyOffset=detectedBoundary>=2500&&detectedBoundary<=10000?detectedBoundary:5000;
  const segments=[{offset_ms:0,duration_ms:Math.min(windowMs,duration),raw:firstRaw,timestamps:first.segments||[]}];
  for(let offset=bodyOffset;offset<duration;offset+=stepMs){
    const result=await transcribe({audioFile,offsetMs:offset,durationMs:Math.min(windowMs,duration-offset),withMetadata:true});
    segments.push({offset_ms:offset,duration_ms:Math.min(windowMs,duration-offset),raw:typeof result==="string"?result:result.raw,timestamps:result.segments||[]});
    if(offset+windowMs>=duration)break;
  }
  return segments;
}
async function segmentedWhisper({cached,cacheFile,audioFile,transcribe}){
  if(cached.raw_segmented&&cached.segmentation_version==="intro_aware_windows_v3")return cached.raw_segmented;
  const segments=await transcribeAudioWindows({audioFile,duration:await audioDurationMs(audioFile),transcribe});
  cached.raw_segmented=mergeTranscriptChunks(segments.map(segment=>segment.raw));
  cached.segment_offsets_ms=segments.map(segment=>segment.offset_ms);
  cached.segments=segments;
  cached.segmentation_version="intro_aware_windows_v3";
  await atomicJson(cacheFile,cached);
  return cached.raw_segmented;
}

function parseUnit(unit,raw){
  const {detail}=unit;
  if(detail.part===1)return {transcript:parsePart1(raw,detail.items[0].item_id),metrics:{word_count:words(raw).length}};
  if(detail.part===2)return {transcript:parsePart2(raw,detail.items[0].item_id),metrics:{word_count:words(raw).length}};
  const ids=detail.items.map(item=>Number(item.item_id));
  return parsePart34(raw,detail.part,Math.min(...ids),Math.max(...ids),legacyPassageForCoverage(detail));
}
function legacyTextForUnit(unit){return unit.detail.context?.transcript||unit.detail.items.flatMap(item=>[item.question,...(item.choices||[])]).filter(Boolean).join("\n")}
function auditLegacy(units){
  const byPart={1:{units:0,unsafe:0,missing:0},2:{units:0,unsafe:0,missing:0},3:{units:0,unsafe:0,missing:0},4:{units:0,unsafe:0,missing:0}};
  for(const {detail} of units){
    const row=byPart[detail.part];row.units++;
    const transcript=detail.context?.transcript||(detail.part<=2?detail.items.flatMap(item=>[item.question,...(item.choices||[])]).filter(Boolean).join("\n"):"");
    if(!transcript)row.missing++;
    if(FORBIDDEN.test(transcript)||/[A-Za-z][©®™°@|_=~<>\[\]{}]/.test(transcript))row.unsafe++;
  }
  return byPart;
}

async function mapPool(values,limit,worker){
  let cursor=0;const results=[];
  async function run(){while(true){const index=cursor++;if(index>=values.length)return;results[index]=await worker(values[index],index)}}
  await Promise.all(Array.from({length:Math.min(limit,values.length)},run));return results;
}

function parseArgs(argv){
  const options={dataRoot:defaultDataRoot,assetRoot:defaultAssetRoot,cacheRoot:defaultCacheRoot,concurrency:2,threads:5,write:false,check:false,reformat:false,pendingOnly:false,retryMode:"all",limit:0,model:"",engine:"whisper.cpp",python:path.join(projectRoot,"outputs/mlx-venv/bin/python")};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==="--write")options.write=true;else if(arg==="--check")options.check=true;else if(arg==="--reformat")options.reformat=true;
    else if(arg==="--pending-only")options.pendingOnly=true;
    else if(arg==="--retry-mode")options.retryMode=argv[++i];
    else if(arg==="--model")options.model=path.resolve(argv[++i]);
    else if(arg==="--engine")options.engine=argv[++i];
    else if(arg==="--python")options.python=path.resolve(argv[++i]);
    else if(arg==="--data-root")options.dataRoot=path.resolve(argv[++i]);
    else if(arg==="--asset-root")options.assetRoot=path.resolve(argv[++i]);
    else if(arg==="--cache-root")options.cacheRoot=path.resolve(argv[++i]);
    else if(arg==="--concurrency")options.concurrency=Number(argv[++i]);
    else if(arg==="--threads")options.threads=Number(argv[++i]);
    else if(arg==="--limit")options.limit=Number(argv[++i]);
    else throw new Error(`unknown argument ${arg}`);
  }
  if(!["none","prompt","all"].includes(options.retryMode))throw new Error("--retry-mode must be none, prompt or all");
  return options;
}

class MlxWorker{
  constructor(python,model){this.pending=new Map();this.sequence=0;this.buffer="";this.child=spawn(python,[path.join(projectRoot,"scripts/mlx-whisper-worker.py"),"--model",model],{stdio:["pipe","pipe","pipe"]});this.child.stdout.on("data",chunk=>this.consume(chunk));this.child.stderr.on("data",chunk=>{this.stderr=(this.stderr||"")+chunk;this.stderr=this.stderr.slice(-5000)});this.child.on("exit",code=>{for(const {reject} of this.pending.values())reject(new Error(`MLX worker exited ${code}: ${this.stderr||""}`));this.pending.clear()})}
  consume(chunk){this.buffer+=chunk;while(this.buffer.includes("\n")){const index=this.buffer.indexOf("\n"),line=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);if(!line.trim())continue;let value;try{value=JSON.parse(line)}catch{continue}const pending=this.pending.get(value.id);if(!pending)continue;this.pending.delete(value.id);value.error?pending.reject(new Error(value.error)):pending.resolve(pending.withMetadata?{raw:value.raw,segments:value.segments||[]}:value.raw)}}
  transcribe(payload){return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject,withMetadata:payload.withMetadata});this.child.stdin.write(`${JSON.stringify({id,audio:payload.audioFile,prompt:payload.prompt||"",offset_ms:payload.offsetMs||0,duration_ms:payload.durationMs||0})}\n`)})}
  close(){this.child.stdin.end()}
}

export async function main(argv=process.argv.slice(2)){
  const options=parseArgs(argv);let units=await collectUnits(options.dataRoot);
  console.log(JSON.stringify({legacy_audit:auditLegacy(units),units:units.length},null,2));
  if(options.check){
    const failures=[];for(const unit of units){try{validatePublishedTranscript(unit.detail)}catch(error){failures.push(`${unit.bank}/${unit.detail.unit_id}: ${error.message}`)}}
    console.log(JSON.stringify({checked:units.length,failures:failures.length,samples:failures.slice(0,30)},null,2));
    if(failures.length)process.exitCode=1;return;
  }
  if(options.reformat){
    const changed=[];
    for(const unit of units.filter(({detail})=>detail.part===3||detail.part===4)){
      const before=unit.detail.context?.transcript||"",after=sentenceLines(before);
      if(after===before)continue;
      changed.push(`${unit.bank}/${unit.detail.unit_id}`);
      if(options.write){
        unit.detail.context.transcript=after;
        unit.detail.context.transcript_source={...unit.detail.context.transcript_source,postprocess_version:"sentence_boundaries_v2"};
        delete unit.detail.context.transcript_translation;
        delete unit.detail.context.transcript_translation_source;
        await atomicJson(unit.detailPath,unit.detail);
      }
    }
    console.log(JSON.stringify({reformat:true,write:options.write,changed:changed.length,samples:changed.slice(0,30)},null,2));
    return;
  }
  if(!options.model){console.log("Audit only. Pass --model <file> to transcribe; add --write to update public details.");return}
  if(options.pendingOnly)units=units.filter(unit=>{try{return !validatePublishedTranscript(unit.detail)}catch{return true}});
  if(options.limit>0)units=units.slice(0,options.limit);
  const modelStat=await stat(options.model);const modelFingerprintFile=modelStat.isDirectory()?path.join(options.model,"weights.safetensors"):options.model;
  const modelHash=await fileSha(modelFingerprintFile);let completed=0,worker;
  if(!["whisper.cpp","mlx"].includes(options.engine))throw new Error("--engine must be whisper.cpp or mlx");
  if(options.engine==="mlx"){worker=new MlxWorker(options.python,options.model);options.concurrency=1}
  const transcribe=options.engine==="mlx"?payload=>worker.transcribe(payload):payload=>whisperOnce({...payload,model:options.model,threads:options.threads});
  const results=await mapPool(units,options.concurrency,async unit=>{
    try{
      const audioFile=audioFileFor(unit,options.assetRoot);
      const cached=await runWhisper({unit,audioFile,model:options.model,modelHash,cacheRoot:options.cacheRoot,threads:options.threads,transcribe});
      const durationMs=unit.detail.part>=3?await audioDurationMs(audioFile):0;
      const parseCandidate=raw=>{
        const anchored=unit.detail.part>=3?anchorPart34Intro(cached.raw,raw,unit.detail):raw;
        const value=parseUnit(unit,anchored);
        if(durationMs){
          const wordsPerSecond=value.metrics.word_count/(durationMs/1000);
          value.metrics.audio_duration_ms=durationMs;
          value.metrics.words_per_second=Number(wordsPerSecond.toFixed(3));
          if(wordsPerSecond<1.7)throw new Error(`audio transcript appears incomplete (rate=${wordsPerSecond.toFixed(2)} words/sec)`);
        }
        return value;
      };
      let parsed,method="full";
      try{parsed=parseCandidate(cached.raw)}catch(firstError){
        if(options.retryMode==="none")throw firstError;
        const cacheFile=cacheFileFor(options.cacheRoot,modelHash,unit);
        try{
          const prompted=await promptedWhisper({cached,cacheFile,audioFile,transcribe,legacy:legacyTextForUnit(unit)});
          parsed=parseCandidate(prompted);method="ocr_prompted_audio";
        }catch(promptedError){
          if(unit.detail.part<3||options.retryMode==="prompt")throw new Error(`${firstError.message}; prompted retry: ${promptedError.message}`);
          const segmented=await segmentedWhisper({cached,cacheFile,audioFile,transcribe});
          parsed=parseCandidate(segmented);method="overlap_segments";
          parsed.metrics.prompted_failure=promptedError.message;
        }
      }
      if(options.write){
        const before=unit.detail.context.transcript;
        if(unit.detail.context.transcript_completeness_review&&before!==parsed.transcript)throw new Error("refusing to overwrite reviewed complete transcript; prepare a new reviewed manifest");
        unit.detail.context.transcript=parsed.transcript;
        const engineLabel=options.engine==="mlx"?"mlx-whisper/large-v3-turbo-4bit":"whisper.cpp/large-v3-turbo-q5_0";
        unit.detail.context.transcript_source={schema_version:SCHEMA,method:`${engineLabel}:${method}`,audio_sha256:cached.audio_sha256,model_sha256:modelHash,source_audio:path.relative(projectRoot,audioFile),metrics:parsed.metrics};
        // The legacy translation was derived from a different OCR string.  It
        // must not be presented as if aligned to the corrected English.
        invalidateChangedTranscriptTranslation(unit.detail.context,before,parsed.transcript);
        await atomicJson(unit.detailPath,unit.detail);
      }
      completed++;if(completed%20===0||completed===units.length)console.log(`processed ${completed}/${units.length}`);
      return {ok:true,bank:unit.bank,unit:unit.detail.unit_id};
    }catch(error){completed++;console.error(`FAILED ${unit.bank}/${unit.detail.unit_id}: ${error.message}`);return {ok:false,bank:unit.bank,unit:unit.detail.unit_id,error:error.message}}
  });
  const failures=results.filter(result=>!result.ok);
  worker?.close();
  console.log(JSON.stringify({schema_version:SCHEMA,write:options.write,processed:results.length,passed:results.length-failures.length,failed:failures.length,failures},null,2));
  if(failures.length)process.exitCode=1;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
