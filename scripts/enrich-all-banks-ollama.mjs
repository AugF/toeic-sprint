#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const args=process.argv.slice(2);
const get=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const banksRoot=path.resolve(get("--source",path.join(scriptDir,"../../toeic_listening_reading_banks")));
const model=get("--model","gemma4:latest");
const only=get("--only","");
const from=get("--from","");
const to=get("--to","");
const onlyPart=Number(get("--part","0"));
const endpoint=get("--endpoint","http://127.0.0.1:11434/api/chat");
const letters="ABCD";

const files=[];
for(const volume of fs.readdirSync(banksRoot,{withFileTypes:true}).filter(x=>x.isDirectory()&&/^off?icial_\d+$/.test(x.name)).sort(natural)){
  for(const test of fs.readdirSync(path.join(banksRoot,volume.name),{withFileTypes:true}).filter(x=>x.isDirectory()&&/^test_\d+$/.test(x.name)).sort(natural)){
    const rel=`${volume.name}/${test.name}`;
    const source=path.join(banksRoot,rel,"question.json");
    if(fs.existsSync(source)&&(!only||rel===only))files.push({rel,source,target:path.join(banksRoot,rel,"question.enriched.json")});
  }
}
if(!files.length)throw new Error(`没有找到匹配题库：${only||banksRoot}`);

for(const file of files.filter(file=>(!from||compareBankId(file.rel,from)>=0)&&(!to||compareBankId(file.rel,to)<=0)))await enrichBank(file);

async function enrichBank(file){
  const raw=JSON.parse(fs.readFileSync(file.source,"utf8"));
  const bank=fs.existsSync(file.target)?JSON.parse(fs.readFileSync(file.target,"utf8")):structuredClone(raw);
  if(!Array.isArray(bank.parts)||bank.parts.length!==7)throw new Error(`${file.rel} 不是完整 7 Part 题库`);
  console.log(`\n[${file.rel}]`);
  for(const part of bank.parts){
    if(onlyPart&&part.part!==onlyPart)continue;
    const missing=part.questions.filter(group=>!translationComplete(part.part,group));
    if(!missing.length){console.log(`  Part ${part.part}: 已完成`);continue}
    const chunks=chunkGroups(missing,18000);
    for(let index=0;index<chunks.length;index++){
      const patch=await translateChunk(file.rel,part.part,chunks[index]);
      mergeChunk(part.part,chunks[index],patch);
      finishDeterministicFields(part.part,chunks[index]);
      bank.schema_version="2.2";
      bank.updated_for="multibank_priority_drills";
      bank.enrichment={translation_model:model,translation_source:"local_ollama",generated_at:new Date().toISOString(),source_file:"question.json"};
      writeAtomic(file.target,bank);
      console.log(`  Part ${part.part}: ${index+1}/${chunks.length} 批完成（${chunks[index].length} 组）`);
    }
  }
  for(const part of bank.parts){part.section_type=part.part<=4?"听力":"阅读";finishDeterministicFields(part.part,part.questions)}
  const all=bank.parts.flatMap(p=>p.questions.flatMap(g=>g.items||[g]));
  if(all.length!==200)throw new Error(`${file.rel} 题数异常：${all.length}`);
  writeAtomic(file.target,bank);
}

function natural(a,b){return a.name.localeCompare(b.name,undefined,{numeric:true})}
function compareBankId(a,b){const numbers=value=>value.match(/\d+/g)?.map(Number)||[];const aa=numbers(a),bb=numbers(b);return(aa[0]||0)-(bb[0]||0)||(aa[1]||0)-(bb[1]||0)}
function chunkGroups(groups,maxChars){
  const out=[];let current=[],size=0;
  for(const group of groups){const n=JSON.stringify(group).length;if(current.length&&size+n>maxChars){out.push(current);current=[];size=0}current.push(group);size+=n}
  if(current.length)out.push(current);return out;
}
function translationComplete(part,group){
  const content=part<=4?group.transcript_translation:group.passage_translation;
  const needsContent=part!==5&&(part!==1||group.choices?.length);
  if(needsContent&&!content)return false;
  return (group.items||[group]).every(item=>Array.isArray(item.choice_translations)&&item.choice_translations.length===(item.choices||[]).length&&(!item.question||item.question_translation));
}
function compactGroup(group){return{
  id:String(group.id),
  content:group.transcript||group.passage||(group.question?`${group.question}\n${(group.choices||[]).map((x,i)=>`${letters[i]}. ${x}`).join("\n")}`:(group.choices||[]).map((x,i)=>`${letters[i]}. ${x}`).join("\n")),
  items:(group.items||[group]).map(item=>({id:Number(item.id),question:item.question||"",choices:item.choices||[]}))
}}
async function translateChunk(bankId,part,groups,attempt=1){
  const payload=groups.map(compactGroup);
  const prompt=`你是严谨的 TOEIC 英中翻译编辑。请翻译下面 Official TOEIC 第 ${part} 部分的材料。\n\n规则：\n1. 只翻译，不改写、不解题、不补充原文没有的信息；人名、公司名可保留英文。\n2. 即使 OCR 有少量噪声，也尽量根据可理解内容翻译；完全无法辨认时写“[原文 OCR 不清]”。\n3. content_translation 翻译每组 content 的全部内容并保留换行。\n4. 每道题的 question_translation 翻译题干；没有题干时返回空字符串。\n5. choice_translations 必须与 choices 等长、顺序一致，只放中文正文，不加 A/B/C/D。\n6. ID、数组数量和顺序必须与输入完全一致。\n7. 只返回合法 JSON，格式：{"groups":[{"id":"...","content_translation":"...","items":[{"id":1,"question_translation":"...","choice_translations":["..."]}]}]}。\n\n输入：${JSON.stringify(payload)}`;
  try{
    const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model,stream:false,think:false,format:"json",keep_alive:"30m",messages:[{role:"user",content:prompt}],options:{temperature:0.05,num_ctx:16384,num_predict:10000}})});
    if(!response.ok)throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
    const body=await response.json();
    const parsed=parseJson(body.message?.content||"");
    validatePatch(groups,parsed);
    return parsed;
  }catch(error){
    if(groups.length>1){
      console.warn(`  ${bankId} Part ${part} 批次校验失败，自动拆分：${error.message}`);
      const middle=Math.ceil(groups.length/2),left=await translateChunk(bankId,part,groups.slice(0,middle)),right=await translateChunk(bankId,part,groups.slice(middle));
      return {groups:[...left.groups,...right.groups]};
    }
    if(attempt<3){console.warn(`  ${bankId} Part ${part} 组 ${groups[0].id} 重试 ${attempt}/3：${error.message}`);return translateChunk(bankId,part,groups,attempt+1)}
    throw error;
  }
}
function parseJson(value){
  const clean=value.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  return JSON.parse(clean);
}
function validatePatch(groups,patch){
  if(!Array.isArray(patch?.groups)||patch.groups.length!==groups.length)throw new Error("返回组数不一致");
  for(let i=0;i<groups.length;i++){
    const source=groups[i],result=patch.groups[i],items=source.items||[source];
    if(String(result.id)!==String(source.id))throw new Error(`组 ID 不一致：${source.id}`);
    if(typeof result.content_translation!=="string")throw new Error(`组 ${source.id} 缺少原文翻译`);
    if(!Array.isArray(result.items)||result.items.length!==items.length)throw new Error(`组 ${source.id} 题数不一致`);
    for(let j=0;j<items.length;j++){
      const a=items[j],b=result.items[j];
      if(Number(b.id)!==Number(a.id))throw new Error(`题号不一致：${a.id}`);
      if(a.question&&typeof b.question_translation!=="string")throw new Error(`题 ${a.id} 缺少题干翻译`);
      if(!a.question&&typeof b.question_translation!=="string")b.question_translation="";
      if(!Array.isArray(b.choice_translations)||b.choice_translations.length!==(a.choices||[]).length||b.choice_translations.some(x=>typeof x!=="string"||!x.trim()))throw new Error(`题 ${a.id} 选项翻译数量不一致`);
    }
  }
}
function mergeChunk(part,groups,patch){
  for(let i=0;i<groups.length;i++){
    const group=groups[i],translated=patch.groups[i];
    if(part<=4)group.transcript_translation=translated.content_translation;else if(part>=6)group.passage_translation=translated.content_translation;
    group.content_translation=translated.content_translation;
    const items=group.items||[group];
    for(let j=0;j<items.length;j++){
      const item=items[j],value=translated.items[j];
      if(item.question)item.question_translation=value.question_translation;
      item.choice_translations=value.choice_translations.map((x,k)=>`${letters[k]}：${x}`);
      item.knowledge_accumulation=makeKnowledge(item,value.choice_translations);
    }
  }
}
function makeKnowledge(item,translations){
  const choices=item.choices||[],correct=Math.max(0,letters.indexOf(item.answer)),phrase=cleanEnglish(choices[correct]||choices[0]||"TOEIC expression"),meaning=(translations[correct]||translations[0]||"托业常用表达").replace(/^[A-D][：:.]\s*/,"");
  const words=(phrase.match(/[A-Za-z][A-Za-z'-]{3,}/g)||[]).filter(x=>!/^(that|this|with|from|have|been|will|would|could|should|their|there|where|when|what|which)$/i.test(x));
  const unique=[...new Set(words.map(x=>x.toLowerCase()))].slice(0,2);
  return{vocabulary:(unique.length?unique:[phrase]).map(term=>({term,meaning:`出现在本题正确表达中：${meaning}`})),collocations:[{phrase,meaning}]};
}
function cleanEnglish(value){return String(value).replace(/^[A-D][).：:.\s-]+/i,"").replace(/\s+/g," ").trim().slice(0,90)||"TOEIC expression"}
function finishDeterministicFields(part,groups){for(const group of groups)for(const item of group.items||[group]){
  const question=item.question||group.question||"",type=questionType(part,question,item.choices||[],group);
  item.question_type ||= type;
  item.evidence ||= locateEvidence(group.transcript||group.passage||question,question);
  if(part===2){item.response_style ||= /^(do|does|did|is|are|was|were|have|has|had|can|could|would|will|won't|isn't|aren't|didn't|hasn't)\b/i.test(question.trim())?"既可能直接回答，也常以原因、安排或补充信息间接回应":"先回答疑问词所索取的信息，同时留意自然的间接回应";item.strategy ||= `先判断为${type}，确认说话人真正索取的信息；再排除重复原词、答非所问和语义冲突的选项。`;}
  else if(part===5){item.grammar_point ||= type.replace(/题$/,"");item.strategy ||= `本题属于${type}。先判断空格的句法成分，再核对词性、动词形式、固定搭配与完整句意。`;}
  else if(part===6)item.strategy ||= `本题属于${type}。先看空格所在句，再检查前后句的指代、时态和逻辑衔接，避免只凭单个词作答。`;
  else item.strategy ||= `本题属于${type}。先标出题干关键词，再定位原文中的同义改写；涉及推断时只采用原文能够充分支持的结论。`;
  item.explanation_structured={answer:item.answer||group.answer,question_type:item.question_type,evidence:item.evidence,strategy:item.strategy,analysis:item.answer_explain||group.answer_explain||""};
  if(!item.knowledge_accumulation&&item.choice_translations)item.knowledge_accumulation=makeKnowledge(item,item.choice_translations.map(x=>x.replace(/^[A-D][：:.]\s*/,"")));
}}
function questionType(part,question,choices,group){
  const s=`${question} ${choices.join(" ")}`.toLowerCase();
  if(part===1)return /being|been|are |is /.test(s)?"动作 / 状态辨析题":"照片细节题";
  if(part===2){if(/^(where)/i.test(question.trim()))return"地点疑问句";if(/^(when|what time|how long)/i.test(question.trim()))return"时间疑问句";if(/^(who|whose)/i.test(question.trim()))return"人物疑问句";if(/^why/i.test(question.trim()))return"原因疑问句";if(/^how/i.test(question.trim()))return"方式 / 程度疑问句";if(/\bor\b|which/i.test(question))return"选择疑问句";if(/isn't|aren't|didn't|won't|hasn't|right\?/i.test(question))return"否定 / 反意疑问句";if(/\?$/.test(question.trim()))return"一般疑问句";return"陈述 / 请求应答题"}
  if(part===5){if(/\b(to|of|in|on|at|for|with|by|from|during|among|between)\b/.test(choices.map(String).join(" ").toLowerCase())&&choices.every(x=>String(x).split(/\s+/).length<=2))return"介词 / 连词题";if(choices.some(x=>/ing$|ed$|en$/.test(String(x).toLowerCase())))return"动词形式题";if(s.includes("ly"))return"词性 / 词形题";return"语境词汇 / 搭配题"}
  if(part===6){if(choices.some(x=>/[.!?]\s*$/.test(String(x))&&String(x).split(/\s+/).length>5))return"整句填入题";if(/however|therefore|moreover|still|instead|otherwise|meanwhile/.test(s))return"逻辑衔接题";if(/he|she|it|they|this|that|these|those/.test(s))return"代词 / 指代题";return"语境语法 / 词汇题"}
  if(/not |except|least likely/.test(question.toLowerCase()))return"否定事实题";
  if(/mean by|closest in meaning|word .* mean|phrase .* mean/.test(question.toLowerCase()))return"词义 / 话语含义题";
  if(/imply|suggest|infer|most likely/.test(question.toLowerCase()))return"推断题";
  if(/mainly|main purpose|why (?:did|does|is|was).*?(?:call|write|send|mention)|what is .* about/.test(question.toLowerCase()))return"主旨 / 目的题";
  if((group.picture_paths?.length||0)>1||group.picture_path)return"图表 / 信息联动题";
  return"细节题";
}
function locateEvidence(text,question){const lines=String(text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return"根据题干结构、选项语义和上下文判断。";const stop=new Set(["what","which","where","when","would","could","about","there","their","does","most","likely"]);const words=(question.toLowerCase().match(/[a-z]{5,}/g)||[]).filter(x=>!stop.has(x));let n=lines.findIndex(line=>words.some(word=>line.toLowerCase().includes(word)));if(n<0)n=0;return`参考原文第 ${n+1} 段：${lines[n]}`}
function writeAtomic(target,value){const temp=`${target}.tmp`;fs.writeFileSync(temp,JSON.stringify(value,null,2)+"\n");fs.renameSync(temp,target)}
