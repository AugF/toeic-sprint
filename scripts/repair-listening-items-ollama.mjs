#!/usr/bin/env node

/** Repair OCR-polluted Part 1–4 questions and choices.
 *
 * Part 1/2 are rebuilt deterministically from the audio-verified transcript.
 * Part 3/4 use the transcript and existing Chinese aids only as constraints for
 * repairing printed English OCR; answer letters and choice order never change.
 */

import {readFile,readdir,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const defaultDataRoot=path.join(projectRoot,"public/data/banks");
const SCHEMA="listening_item_text_v1";
// Count independent question starts only. A wh-word can also be a conjunction
// inside one valid question (for example, “What … when she says …?”).
const QUESTION_START=/(?:^|[?!.]\s+)(?:What|Where|Why|Who|Whom|When|Which|How)\b/gi;
const QUESTION_NUMBER=/(?:^|\s)(?:3[2-9]|[4-9]\d|100)\.(?=\s|$)/;
const UNSAFE=/[\\|©®™_=¢]|[\u0400-\u04ff\u4e00-\u9fff]/;
const AID_UNSAFE=/[\\|©®™_=¢]|[\u0400-\u04ff]|(?:^|\s)(?:3[2-9]|[4-9]\d|100)[.。](?=\s|$)/;
const TRAILING_NOISE=/\s[();,:=¢©®™\\|]+$/;
const LEGITIMATE_A_WORDS=new Set(`Abdel About Above Absent Absolutely Access Accountant Accountants Accounting Achievement Act Acting Actually Add Adding Additional Adjust Adjustable Adjusting Administering Administrative Admission Advanced Advertise Advertising Advise Advised After Agency Airplanes Airport Airports Airline Airlines Aisle Alex All Allow Allowing Almost Along Amazon Amy An Analyzing Andrew Animal Announce Annual Another Answer Any Apartment Appliance Appliances Apply Applying Approve April Architect Are Area Areas Around Arrange Arrangement Arranging Arrive Arriving Art Artist Artists As Ask Asking Asphalt Assemble Assembly Assigning Assist Association At Attend Attendance Attendees Attending Attorney Attorneys Attracting Audio August Author Authorize Automobiles Automotive Available Avenue Award Awards`.split(" "));

const cleanSpace=value=>String(value||"").normalize("NFKC").replace(/\s+/g," ").trim();
const stripLabel=value=>cleanSpace(value).replace(/^[A-D][.：:]\s*/,"");
const spokenLines=value=>String(value||"").split("\n").map(cleanSpace).filter(Boolean);
const questionStarts=value=>[...String(value||"").matchAll(QUESTION_START)].length;
const articleJoin=value=>{const word=cleanSpace(value).match(/^([A-Z][a-z]+)/)?.[1];return Boolean(word?.startsWith("A")&&!LEGITIMATE_A_WORDS.has(word))};
const suspiciousQuestion=value=>{const text=cleanSpace(value);return !text||text.length>220||!/[?][\"'’”)]?$/.test(text)||QUESTION_NUMBER.test(text)||UNSAFE.test(text)||TRAILING_NOISE.test(text)||questionStarts(text)>1||/\b(?:TEM|TER|EM|Tl|nm)\b|\b(?:broadca|onlir)\s*$/i.test(text)};
const suspiciousChoice=value=>{const text=cleanSpace(value);return !text||text.length>150||QUESTION_NUMBER.test(text)||UNSAFE.test(text)||TRAILING_NOISE.test(text)||articleJoin(text)||/[A-Z]{5,}|\[[^\]]*$/.test(text)};

function cleanupObvious(value,{question=false}={}){
  let text=cleanSpace(value)
    .replace(/(^|[\s“\"'‘])\|(?=\s*(?:am|have|need|know|saw|think|always|will|can|would|did|want|was|guess|hope|remember|believe|just|really|should|could)\b)/gi,"$1I")
    .replace(/(^|[\s“\"'‘])l(?=\s+(?:am|have|need|know|saw|think|always|will|can|would|did|want|was|guess|hope|remember|believe|just|really|should|could)\b)/g,"$1I")
    .replace(/[\\|©®_=¢]/g," ")
    .replace(/\s+/g," ").trim();
  if(question){
    text=text.replace(/^(?:3[2-9]|[4-9]\d|100)\.\s*/,"").replace(/\?\s+(?:3[2-9]|[4-9]\d|100)\.?\s*$/,"?").trim();
  }else{
    text=text.replace(/^Ata\s+/,"At a ");
    const first=text.match(/^([A-Z][a-z]+)/)?.[1];
    if(first?.startsWith("A")&&!LEGITIMATE_A_WORDS.has(first))text=`A ${first.slice(1)}${text.slice(first.length)}`;
    text=text.replace(/\s+(?:3[2-9]|[4-9]\d|100)\.\s*$/," ").replace(/[\s(;,=¢©®™\\|]+$/g,"").trim();
  }
  return text;
}

function cleanAid(value,{question=false}={}){
  let text=cleanupObvious(value,{question});
  text=text.replace(/[\\|©®™_=¢]|[\u0400-\u04ff]/g," ").replace(/(?:^|\s)(?:3[2-9]|[4-9]\d|100)[.。](?=\s|$)/g," ").replace(/\s+/g," ").trim();
  if(question)text=text.replace(/\s+(?:3[2-9]|[4-9]\d|100)\.\s*$/," ").trim();
  return text;
}

function replaceDerived(value,replacements){
  if(typeof value==="string"){let output=value;for(const [before,after] of replacements)if(before&&before!==after)output=output.split(before).join(after);return output}
  if(Array.isArray(value))return value.map(entry=>replaceDerived(entry,replacements));
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,replaceDerived(entry,replacements)]));
  return value;
}

function applyItemText(item,question,choices){
  const oldQuestion=String(item.question||""),oldChoices=[...(item.choices||[])];
  const replacements=[[oldQuestion,question],...oldChoices.map((choice,index)=>[choice,choices[index]])];
  const updated=replaceDerived(item,replacements);
  updated.question=question;
  updated.choices=choices;
  if(updated.question_translation)updated.question_translation=cleanAid(updated.question_translation,{question:true});
  if(Array.isArray(updated.choice_translations))updated.choice_translations=updated.choice_translations.map(value=>cleanAid(value));
  Object.assign(item,updated);
}

function rebuildPart12(unit){
  const item=unit.detail.items[0],lines=spokenLines(unit.detail.context?.transcript);
  if(!item||lines.length!==4)throw new Error(`${unit.key}: expected four transcript lines`);
  const question=unit.detail.part===1?cleanSpace(item.question||"Look at the picture."):cleanSpace(lines[0]);
  const choices=(unit.detail.part===1?lines:lines.slice(1)).map(stripLabel);
  if(choices.length!==(item.choices||[]).length)throw new Error(`${unit.key}: transcript choice count mismatch`);
  applyItemText(item,question,choices);
  const translated=spokenLines(unit.detail.context?.transcript_translation);
  if(unit.detail.part===1)item.question_translation="请看图片。";
  if(translated.length===4){
    if(unit.detail.part===2)item.question_translation=stripLabel(translated[0]);
    item.choice_translations=(unit.detail.part===1?translated:translated.slice(1)).map((value,index)=>`${"ABCD"[index]}：${stripLabel(value)}`);
  }
  unit.detail.context.item_text_source={schema_version:SCHEMA,method:"audio_transcript",items:1};
}

function cleanPart34(unit){
  for(const item of unit.detail.items){
    const question=cleanupObvious(item.question,{question:true});
    const choices=(item.choices||[]).map(value=>cleanupObvious(value));
    applyItemText(item,question,choices);
  }
  unit.detail.context.item_text_source={schema_version:SCHEMA,method:"deterministic_ocr_cleanup",items:unit.detail.items.length};
}

const EVIDENCE_STOP=new Set("a an the is are was were be been being do does did to of in on at for from with and or but this that these those it its he she they we you i what where why who when which how speaker man woman say says said according look graphic most likely probably".split(" "));
function evidenceTokens(value){return (String(value||"").toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g)||[]).filter(token=>token.length>2&&!EVIDENCE_STOP.has(token))}
function bestEvidence(item,transcript){
  const lines=String(transcript||"").split("\n").map(cleanSpace).filter(Boolean),answerIndex="ABCD".indexOf(String(item.answer||"").toUpperCase());
  const query=new Set(evidenceTokens(`${item.question||""} ${(item.choices||[])[answerIndex]||""}`));
  let best=lines[0]||"",score=-1;
  for(const line of lines){const tokens=evidenceTokens(line),overlap=tokens.filter(token=>query.has(token)).length,rank=overlap*10+Math.min(tokens.length,24)/100;if(rank>score){score=rank;best=line}}
  return best;
}
function refreshPart34Explanations(unit){
  for(const item of unit.detail.items){
    const answer=String(item.answer||"").toUpperCase(),index="ABCD".indexOf(answer),choice=(item.choices||[])[index]||"",line=bestEvidence(item,unit.detail.context?.transcript||"");
    const evidence=line?`参考听力原文：“${line}”`:"请结合听力原文定位题干关键词。";
    const analysis=`正确答案：${answer}${choice?`（${choice}）`:""}。先定位题干关键词，再核对原文中的直接信息或同义改写。`;
    item.evidence=evidence;
    item.answer_explain=analysis;
    if(item.explanation_structured&&typeof item.explanation_structured==="object"){
      item.explanation_structured.evidence=evidence;
      item.explanation_structured.analysis=analysis;
    }
  }
}

async function collect(dataRoot){
  const values=[];
  for(const bank of (await readdir(dataRoot)).sort()){
    const root=path.join(dataRoot,bank,"units");
    for(const name of (await readdir(root)).filter(value=>value.endsWith(".json")).sort()){
      const file=path.join(root,name),detail=JSON.parse(await readFile(file,"utf8"));
      if(detail.part>=1&&detail.part<=4)values.push({key:`${bank}/${detail.unit_id}`,file,detail});
    }
  }
  return values;
}

async function atomicJson(file,value){const temporary=`${file}.tmp-${process.pid}-${Date.now()}`;await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`);await rename(temporary,file)}
function parseJson(value){return JSON.parse(String(value||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/," ").trim())}

async function ollama(url,model,payload,timeoutMs){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const prompt=`你是 TOEIC Listening & Reading 英文题面校对员。只修复 Part 3/4 题干和选项中的 OCR 错误：误插入的下一题题号或邻栏问句、孤立括号/反斜杠/竖线/乱码、丢失空格、明显被截断的末尾。必须参考 audio_transcript、中文辅助和选项语义做最小修复，不得改题意、不得改变选项顺序或数量、不得根据正确答案把错误选项改成正确含义。所有 question 必须是完整英文问句并以问号结束；所有 choices 不得带 A/B/C/D 标签。只返回 JSON：{"units":[{"key":"...","items":[{"item_key":"...","question":"...","choices":["...","...","...","..."]}]}]}。输入：${JSON.stringify(payload)}`;
    const response=await fetch(`${url}/api/generate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model,prompt,stream:false,format:"json",options:{temperature:0,num_ctx:16384}}),signal:controller.signal});
    if(!response.ok)throw new Error(`Ollama HTTP ${response.status}`);
    const result=await response.json();return parseJson(result.response||result.thinking);
  }finally{clearTimeout(timer)}
}

function validateRepair(unit,row){
  if(!row||!Array.isArray(row.items)||!row.items.length)throw new Error("item count mismatch");
  const byKey=new Map(row.items.map(item=>[item.item_key,item]));
  return unit.detail.items.map((source,index)=>{
    const repaired=byKey.get(source.item_key)??(row.items.length===unit.detail.items.length?row.items[index]:null)??{question:cleanupObvious(source.question,{question:true}),choices:(source.choices||[]).map(value=>cleanupObvious(value))};
    const question=cleanSpace(repaired?.question),choices=(repaired?.choices||[]).map(cleanSpace);
    if(!question||suspiciousQuestion(question))throw new Error(`${source.item_key}: unsafe repaired question: ${question}`);
    if(choices.length!==(source.choices||[]).length||choices.some(suspiciousChoice))throw new Error(`${source.item_key}: unsafe repaired choices`);
    return {source,question,choices};
  });
}

async function repairBatch(batch,options){
  const payload={units:batch.map(unit=>({key:unit.key,audio_transcript:unit.detail.context?.transcript||"",items:unit.detail.items.map(item=>({item_key:item.item_key,question:cleanupObvious(item.question,{question:true}),choices:(item.choices||[]).map(value=>cleanupObvious(value)),answer:item.answer,question_translation:item.question_translation||"",choice_translations:item.choice_translations||[]}))}))};
  try{
    const result=await ollama(options.url,options.model,payload,options.timeoutMs),rows=Array.isArray(result?.units)?result.units:(batch.length===1&&Array.isArray(result?.items)?[{key:batch[0].key,items:result.items}]:null);
    if(!Array.isArray(rows)||rows.length!==batch.length)throw new Error("Ollama unit count mismatch");
    const byKey=new Map(rows.map(row=>[row.key,row]));
    const validated=batch.map((unit,index)=>({unit,items:validateRepair(unit,byKey.get(unit.key)??rows[index])}));
    for(const {unit,items} of validated){
      for(const {source,question,choices} of items)applyItemText(source,question,choices);
      unit.detail.context.item_text_source={schema_version:SCHEMA,method:`ollama/${options.model}+audio_context`,items:items.length};
      await atomicJson(unit.file,unit.detail);
    }
    console.log(`repaired ${batch.length}: ${batch[0].key} … ${batch.at(-1).key}`);return [];
  }catch(error){
    if(batch.length===1)return [{key:batch[0].key,error:error.message}];
    console.warn(`retrying split batch (${batch.length}): ${error.message}`);
    const middle=Math.ceil(batch.length/2);return [...await repairBatch(batch.slice(0,middle),options),...await repairBatch(batch.slice(middle),options)];
  }
}

function isSuspiciousUnit(unit){return unit.detail.part>=3&&unit.detail.items.some(item=>suspiciousQuestion(cleanupObvious(item.question,{question:true}))||(item.choices||[]).some(value=>suspiciousChoice(cleanupObvious(value))))}
function batches(values,size){const output=[];for(let index=0;index<values.length;index+=size)output.push(values.slice(index,index+size));return output}
async function mapPool(values,limit,worker){let cursor=0;const results=[];async function run(){while(true){const index=cursor++;if(index>=values.length)return;results[index]=await worker(values[index])}}await Promise.all(Array.from({length:Math.min(limit,values.length)},run));return results}

function validatePublished(unit){
  const {detail}=unit;
  if(detail.context?.item_text_source?.schema_version!==SCHEMA)throw new Error("missing item text provenance");
  if(detail.part<=2){
    const lines=spokenLines(detail.context?.transcript),item=detail.items[0];
    const expected=(detail.part===1?lines:lines.slice(1)).map(stripLabel);
    if(detail.part===2&&cleanSpace(item.question)!==cleanSpace(lines[0]))throw new Error("Part 2 question differs from audio transcript");
    if(JSON.stringify(item.choices)!==JSON.stringify(expected))throw new Error(`Part ${detail.part} choices differ from audio transcript`);
  }
  for(const item of detail.items){
    if(detail.part>=3&&suspiciousQuestion(item.question))throw new Error(`${item.item_key}: unsafe question`);
    if(detail.part>=3&&(item.choices||[]).some(suspiciousChoice))throw new Error(`${item.item_key}: unsafe choice`);
    if([item.question_translation,...(item.choice_translations||[])].some(value=>AID_UNSAFE.test(String(value||""))))throw new Error(`${item.item_key}: unsafe translation aid`);
  }
}

function args(argv){const options={dataRoot:defaultDataRoot,write:false,generate:false,check:false,url:"http://127.0.0.1:11434",model:"gemma4:latest",batchUnits:4,concurrency:4,timeoutMs:300000};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==="--write")options.write=true;else if(arg==="--generate")options.generate=true;else if(arg==="--check")options.check=true;else if(arg==="--data-root")options.dataRoot=path.resolve(argv[++i]);else if(arg==="--url")options.url=argv[++i];else if(arg==="--model")options.model=argv[++i];else if(arg==="--batch-units")options.batchUnits=Number(argv[++i]);else if(arg==="--concurrency")options.concurrency=Number(argv[++i]);else if(arg==="--timeout-ms")options.timeoutMs=Number(argv[++i]);else throw new Error(`unknown argument ${arg}`)}return options}

export {cleanupObvious,suspiciousChoice,suspiciousQuestion};

export async function main(argv=process.argv.slice(2)){
  const options=args(argv),units=await collect(options.dataRoot),part12=units.filter(unit=>unit.detail.part<=2),suspect=units.filter(isSuspiciousUnit);
  console.log(JSON.stringify({units:units.length,part12:part12.length,suspicious_part34_units:suspect.length,suspicious_items:suspect.reduce((sum,unit)=>sum+unit.detail.items.filter(item=>suspiciousQuestion(cleanupObvious(item.question,{question:true}))||(item.choices||[]).some(value=>suspiciousChoice(cleanupObvious(value)))).length,0)},null,2));
  if(options.check){const failures=[];for(const unit of units)try{validatePublished(unit)}catch(error){failures.push(`${unit.key}: ${error.message}`)}console.log(JSON.stringify({checked:units.length,failures:failures.length,samples:failures.slice(0,20)},null,2));if(failures.length)process.exitCode=1;return}
  if(options.write){
    for(const unit of part12){rebuildPart12(unit);await atomicJson(unit.file,unit.detail)}
    for(const unit of units.filter(unit=>unit.detail.part>=3&&!isSuspiciousUnit(unit))){
      if(unit.detail.context?.item_text_source?.schema_version!==SCHEMA)cleanPart34(unit);
      refreshPart34Explanations(unit);
      await atomicJson(unit.file,unit.detail);
    }
  }
  if(options.generate){const failures=(await mapPool(batches(suspect,options.batchUnits),options.concurrency,batch=>repairBatch(batch,options))).flat();console.log(JSON.stringify({repaired:suspect.length-failures.length,failures},null,2));if(failures.length)process.exitCode=1}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
