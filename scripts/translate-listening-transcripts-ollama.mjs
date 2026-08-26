#!/usr/bin/env node

/** Translate only audio-verified Part 1–4 transcripts.
 *
 * Each source line is translated separately so Part 1/2 labels and Part 3/4
 * sentence boundaries cannot drift.  The transcript SHA is stored beside the
 * result; a later English correction automatically makes the Chinese stale.
 */

import {createHash} from "node:crypto";
import {readFile,readdir,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const defaultDataRoot=path.join(projectRoot,"public/data/banks");
const SCHEMA="listening_translation_v2";
const HAN=/[\u3400-\u9fff]/g;
const FORBIDDEN=/[©®™]|(?:^|\s)[<>{}\[\]|_=~@]+(?:\s|$)|原文\s*OCR\s*不清/i;
const sha=value=>createHash("sha256").update(value).digest("hex");

async function atomicJson(file,value){const temporary=`${file}.tmp-${process.pid}-${Date.now()}`;await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`);await rename(temporary,file)}
async function collect(dataRoot){const values=[];for(const bank of (await readdir(dataRoot)).sort()){const root=path.join(dataRoot,bank,"units");for(const name of (await readdir(root)).filter(x=>x.endsWith(".json")).sort()){const file=path.join(root,name),detail=JSON.parse(await readFile(file,"utf8"));if(detail.part>=1&&detail.part<=4&&detail.context?.transcript_source?.schema_version==="listening_transcript_v2")values.push({key:`${bank}/${detail.unit_id}`,file,detail})}}return values}
export function isCurrentTranslation(detail){
  const source=detail.context?.transcript||"",translation=detail.context?.transcript_translation||"",meta=detail.context?.transcript_translation_source;
  if(!source||!translation||meta?.schema_version!==SCHEMA||meta?.transcript_sha256!==sha(source))return false;
  try{validateTranslation(source,translation.split("\n"),detail.part);return true}catch{return false}
}
export function validateTranslation(source,lines,part=1){
  const sourceLines=String(source||"").split("\n").map(x=>x.trim()).filter(Boolean);
  if(!Array.isArray(lines)||!lines.length)throw new Error("translation is not a non-empty array");
  if(part<=2&&lines.length!==sourceLines.length)throw new Error(`translation line count ${lines?.length} != ${sourceLines.length}`);
  const clean=lines.map(line=>String(line||"").trim());
  if(clean.some(line=>!line||FORBIDDEN.test(line)))throw new Error("empty or unsafe translation line");
  const hanCount=clean.join("").match(HAN)?.length??0;
  if(hanCount<Math.max(2,Math.round(sourceLines.join("").length*.08)))throw new Error("translation contains too little Chinese");
  for(let i=0;part<=2&&i<sourceLines.length;i++){
    const label=sourceLines[i].match(/^([A-D])\.\s/);if(label&&!new RegExp(`^${label[1]}[.：:]`).test(clean[i]))throw new Error(`line ${i+1} lost option label ${label[1]}`);
  }
  return clean;
}
function parseJson(value){const text=String(value||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/," ").trim();return JSON.parse(text)}
async function ollama(url,model,payload,timeoutMs){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const prompt=`把下列 TOEIC 听力原文逐行忠实翻译为简体中文。不得增删、解释或修补英文；专有名词保留或自然音译。每个 translations 数组必须与输入 lines 数量完全一致。A./B./C./D. 选项行必须保留相同字母标签。只返回 JSON：{"items":[{"key":"...","translations":["..."]}]}。输入：${JSON.stringify(payload)}`;
    const response=await fetch(`${url}/api/generate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model,prompt,stream:false,format:"json",options:{temperature:0,num_ctx:16384}}),signal:controller.signal});
    if(!response.ok)throw new Error(`Ollama HTTP ${response.status}`);
    const result=await response.json();
    // Reasoning-enabled Ollama models may place their structured result in
    // `thinking` while leaving `response` empty. Both fields are local model
    // output and are subject to the same JSON and line-alignment validation.
    return parseJson(result.response||result.thinking);
  }finally{clearTimeout(timer)}
}
async function translateBatch(batch,options){
  const payload={items:batch.map(unit=>({key:unit.key,lines:unit.detail.context.transcript.split("\n").map(x=>x.trim()).filter(Boolean)}))};
  try{
    const result=await ollama(options.url,options.model,payload,options.timeoutMs),rows=Array.isArray(result?.items)?result.items:(batch.length===1&&Array.isArray(result?.translations)?[{key:batch[0].key,translations:result.translations}]:null);
    if(!Array.isArray(rows)||rows.length!==batch.length)throw new Error("Ollama result count mismatch");
    const rowTranslations=row=>row?.translations??row?.translation??(Array.isArray(row)?row:null);
    const map=new Map(rows.map(row=>[row?.key,rowTranslations(row)]));
    // Some local models preserve item order and line arrays but normalize a
    // slash or dash inside the opaque key. Prefer exact keys, then safely fall
    // back to the same array position; line counts and A–D labels are still
    // validated below before anything is written.
    const validated=batch.map((unit,index)=>({unit,lines:validateTranslation(unit.detail.context.transcript,map.get(unit.key)??rowTranslations(rows[index]),unit.detail.part)}));
    for(const {unit,lines} of validated){unit.detail.context.transcript_translation=lines.join("\n");unit.detail.context.transcript_translation_source={schema_version:SCHEMA,method:`ollama/${options.model}`,transcript_sha256:sha(unit.detail.context.transcript)};await atomicJson(unit.file,unit.detail)}
    console.log(`translated ${batch.length}: ${batch[0].key} … ${batch.at(-1).key}`);return [];
  }catch(error){
    if(batch.length===1)return [{key:batch[0].key,error:error.message}];
    console.warn(`retrying split batch (${batch.length}): ${error.message}`);
    const middle=Math.ceil(batch.length/2);return [...await translateBatch(batch.slice(0,middle),options),...await translateBatch(batch.slice(middle),options)];
  }
}
function batches(units,maxChars,maxUnits){const output=[];let current=[],size=0;for(const unit of units){const length=unit.detail.context.transcript.length;if(current.length&&(current.length>=maxUnits||size+length>maxChars)){output.push(current);current=[];size=0}current.push(unit);size+=length}if(current.length)output.push(current);return output}
async function mapPool(values,limit,worker){let cursor=0;const results=[];async function run(){while(true){const index=cursor++;if(index>=values.length)return;results[index]=await worker(values[index],index)}}await Promise.all(Array.from({length:Math.min(limit,values.length)},run));return results}
function args(argv){const options={dataRoot:defaultDataRoot,generate:false,check:false,force:false,url:"http://127.0.0.1:11434",model:"gemma4:latest",maxChars:9000,maxUnits:16,timeoutMs:240000,concurrency:1};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==="--generate")options.generate=true;else if(arg==="--check")options.check=true;else if(arg==="--force")options.force=true;else if(arg==="--data-root")options.dataRoot=path.resolve(argv[++i]);else if(arg==="--url")options.url=argv[++i];else if(arg==="--model")options.model=argv[++i];else if(arg==="--batch-chars")options.maxChars=Number(argv[++i]);else if(arg==="--batch-units")options.maxUnits=Number(argv[++i]);else if(arg==="--timeout-ms")options.timeoutMs=Number(argv[++i]);else if(arg==="--concurrency")options.concurrency=Number(argv[++i]);else throw new Error(`unknown argument ${arg}`)}return options}

export async function main(argv=process.argv.slice(2)){
  const options=args(argv),units=await collect(options.dataRoot),valid=units.filter(unit=>isCurrentTranslation(unit.detail)),pending=units.filter(unit=>options.force||!isCurrentTranslation(unit.detail));
  console.log(JSON.stringify({units:units.length,valid:valid.length,pending:pending.length},null,2));
  if(options.check){if(pending.length)process.exitCode=1;return}
  if(!options.generate)return;
  const translated=await mapPool(batches(pending,options.maxChars,options.maxUnits),options.concurrency,batch=>translateBatch(batch,options));
  const failures=translated.flat();
  console.log(JSON.stringify({translated:pending.length-failures.length,failures},null,2));if(failures.length)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
