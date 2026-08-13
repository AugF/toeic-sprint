#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

/**
 * Build the read-only, lazily loadable data layer used by the multi-bank UI.
 *
 * Usage:
 *   node scripts/build-multi-bank.mjs [banks-root] [output-root]
 *
 * The source tree is never modified. Media are deliberately not copied: every
 * media reference is emitted as a bank-relative path plus a stable asset key.
 */

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const defaultBanksRoot=path.resolve(scriptDir,"../../toeic_listening_reading_banks");
const defaultOutputRoot=path.resolve(scriptDir,"../public/data");
const banksRoot=path.resolve(process.argv[2]||defaultBanksRoot);
const outputRoot=path.resolve(process.argv[3]||defaultOutputRoot);

const SCHEMA_VERSION="3.0";
const PRIORITY_MODEL="toeic_priority_v2";
const EXPECTED_PART_COUNTS={1:6,2:25,3:39,4:30,5:30,6:16,7:54};
const CONTEXT_FIELDS=[
  "audio_path","question_audio_path","picture_path","picture_paths",
  "transcript","transcript_translation","passage","passage_translation",
  "content_translation"
];
const MEDIA_FIELDS=new Set(["audio_path","question_audio_path","picture_path","picture_paths"]);
const ITEM_OMIT=new Set(["items","training_unit","priority_methodology",...CONTEXT_FIELDS]);

function fail(message){throw new Error(message)}
function readJson(file){return JSON.parse(fs.readFileSync(file,"utf8"))}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+"\n")}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex")}
function posix(value){return value.split(path.sep).join("/")}
function cleanPath(value){
  if(typeof value!=="string"||!value.trim())return undefined;
  const clean=posix(value.trim()).replace(/^\.\//,"");
  if(path.posix.isAbsolute(clean)||clean.split("/").includes(".."))fail(`不安全的资源路径：${value}`);
  return clean;
}
function asArray(value){return Array.isArray(value)?value:value==null?[]:[value]}
function slugPart(part,id){return `p${part}-${String(id).replace(/[^a-zA-Z0-9-]+/g,"-").replace(/^-|-$/g,"").toLowerCase()}`}
function itemKey(bankId,unitId,id){return `${bankId}/${unitId}/${id}`}

function discoverBanks(root){
  if(!fs.existsSync(root))fail(`题库根目录不存在：${root}`);
  const found=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const match=/^official_(\d+)$/.exec(entry.name);
    if(!entry.isDirectory()||!match)continue;
    for(const testEntry of fs.readdirSync(path.join(root,entry.name),{withFileTypes:true})){
      const tm=/^test_(\d+)$/.exec(testEntry.name);
      if(!testEntry.isDirectory()||!tm)continue;
      const dir=path.join(root,entry.name,testEntry.name);
      const enriched=path.join(dir,"question.enriched.json");
      const plain=path.join(dir,"question.json");
      const source=fs.existsSync(enriched)?enriched:plain;
      if(!fs.existsSync(source))continue;
      const volume=Number(match[1]),test=Number(tm[1]);
      found.push({volume,test,dir,source,enriched:source===enriched,bank_id:`official-${volume}-test-${test}`});
    }
  }
  return found.sort((a,b)=>a.volume-b.volume||a.test-b.test);
}

function flattenPart(part){
  return part.questions.flatMap(group=>group.items?.length?group.items:[group]);
}

// question.enriched.json currently packs Part 5 into artificial groups of five.
// Canonical multi-bank output restores the formal independent-question shape.
function canonicalGroups(part){
  if(part.part===5)return flattenPart(part).map(item=>({id:item.id,...item}));
  return part.questions;
}

function textOf(...values){return values.filter(Boolean).join(" ").toLowerCase()}
function inferType(part,item,group){
  if(item.question_type)return item.question_type;
  // Explanations often contain generic boilerplate such as "detail, paraphrase,
  // inference". Classification must use the prompt and local metadata only.
  const s=textOf(item.question,item.topic,item.keywords,group.topic);
  if(part===1)return /is being|are being|been |displayed|parked|located|lined|stacked|placed/.test(s)?"物体状态 / 被动题":"人物动作 / 场景题";
  if(part===2){
    if(/\bwhy\b|原因/.test(s))return "原因疑问句";
    if(/\bwhere\b|地点|destination/.test(s))return "地点疑问句";
    if(/\bwhen\b|what time|how long|时间/.test(s))return "时间疑问句";
    if(/\bwho\b|whose|人物/.test(s))return "人物疑问句";
    if(/\bwhich\b|\bor\b|选择/.test(s))return "选择疑问句";
    if(/isn't|aren't|don't|didn't|hasn't|won't|否定|反意/.test(s))return "否定 / 反意疑问句";
    if(/^(do|does|did|is|are|was|were|have|has|can|could|will|would|should)\b/.test(s))return "一般疑问句";
    if(/\bhow\b/.test(s))return "方式 / 程度疑问句";
    return "陈述 / 请求应答";
  }
  if(part===5){
    const choices=(item.choices||[]).map(x=>String(x).trim().toLowerCase());
    const preps=new Set(["about","above","across","after","against","along","among","around","at","before","behind","below","beneath","beside","between","beyond","by","despite","during","except","for","from","in","inside","into","near","of","off","on","onto","opposite","outside","over","past","since","through","throughout","to","toward","under","until","up","upon","with","within","without"]);
    const conjunctions=new Set(["although","because","before","even if","even though","if","once","since","so that","though","unless","until","when","whenever","whereas","whether","while"]);
    if(choices.length>2&&choices.every(x=>preps.has(x)))return "介词 / 固定搭配题";
    if(choices.length>2&&choices.every(x=>conjunctions.has(x)))return "连词 / 从句题";
    if(choices.length>2&&commonPrefix(choices)>=3)return "词性 / 动词形式题";
    if(/词汇|word meaning|vocabulary|collocation|搭配|词义/.test(s))return "词汇 / 搭配题";
    if(/preposition|介词/.test(s))return "介词题";
    if(/conjunction|连接|连词|clause/.test(s))return "连词 / 从句题";
    if(/tense|voice|verb|主谓|时态|语态|动词/.test(s))return "动词体系题";
    if(/pronoun|代词/.test(s))return "代词题";
    if(/word form|词性|adverb|adjective|noun/.test(s))return "词性 / 词形题";
    return "语法 / 语境词汇题";
  }
  if(part===6){
    const choices=item.choices||[];
    const sentenceLike=choices.filter(x=>typeof x==="string"&&/[.!?]\s*$/.test(x.trim())&&x.trim().split(/\s+/).length>=4).length>=3;
    if(sentenceLike)return "整句填入题";
    if(/otherwise|however|therefore|moreover|instead|逻辑|衔接/.test(s))return "逻辑衔接词题";
    if(/pronoun|代词|指代/.test(s))return "代词 / 指代题";
    if(/tense|voice|时态|语态/.test(s))return "时态语态题";
    if(/word form|词性|词形/.test(s))return "词性 / 词形题";
    return "语境语法 / 词汇题";
  }
  if(/in which of the positions|best belong/.test(s))return "句子插入题";
  if(/look at the graphic|refer to the following|graphic/.test(s))return "图表联动题";
  if(/closest in meaning|word [“\"]|phrase [“\"]|词义/.test(s))return "词义 / 短语题";
  if(/\bnot\b.*(mentioned|stated|included|indicated|acceptable)/.test(s))return "否定事实题";
  if(/imply|suggest|infer|concluded|most likely mean/.test(s))return "推断 / 隐含义题";
  if(/mainly about|purpose|why.*write|who most likely|where most likely|type of|being advertised|intended for/.test(s))return "主旨 / 目的 / 场景题";
  return "细节定位题";
}

function genericPriority(part,type,item,group){
  // Keep item-level priority independent from group-level keywords. Shared
  // context may describe several skills that do not apply to every item.
  const s=textOf(type,item.question,item.topic,item.keywords);
  const question=textOf(item.question);
  let score=60,label=type,tags=[type],reason="该题按 TOEIC 题型复现价值、综合理解要求和迁移性自动分级。";
  if(part===1){
    const choices=textOf(...(item.choices||[]));
    if(/is being|are being|has been|have been|displayed|parked|located|lined|stacked|placed|leaning|hanging/.test(choices)){score=80;tags.push("动作与状态干扰")}else score=64;
  }else if(part===2){
    // Classify from the cleaned question as well as the fallback type. OCR
    // control prefixes frequently prevent inferType's anchored regexp from
    // seeing an otherwise ordinary WH question.
    const has=(regexp)=>regexp.test(question);
    if(/否定|反意|选择/.test(s)||/\bor\b/.test(question)||/n't\b|right\s*\?/.test(question)){score=85;tags.push("间接应答","语用判断")}
    else if(/陈述|请求|间接/.test(s)&&!has(/\b(what|where|when|who|whose|why|how)\b/)){score=85;tags.push("间接应答","语用判断")}
    else if(has(/\b(what|why|how)\b/)){score=68;tags.push("自然应答")}
    else if(has(/\b(where|when|who|whose)\b/))score=53;
    else if(/一般|原因|方式/.test(s)){score=68;tags.push("自然应答")}
    else score=53;
  }else if(part===3||part===4){
    // A group may contain a graphic, but only the item that explicitly asks the
    // learner to use it gets the graphic premium.
    if(/look at the (graphic|map|schedule|list|floor plan|coupon|form)|refer to the (graphic|map|schedule|list)|图表/.test(question)){score=93;tags.push("图表联动")}
    else if(/推断|隐含|mean|imply|下一步|意图/.test(s)){score=88;tags.push("跨句整合")}
    else if(/主旨|目的|场景/.test(s)){score=72;tags.push("主旨场景")}
    else {const answer=String((item.choices||[])["ABCD".indexOf(item.answer)]||"").toLowerCase(),transcript=String(group.transcript||"").toLowerCase();score=tokenOverlap(answer,transcript)>.72?46:61;if(score<60)tags.push("明示细节")}
  }else if(part===5){
    const choices=(item.choices||[]).map(x=>String(x).trim().toLowerCase());
    const sameStem=choices.length>2&&commonPrefix(choices)>=3;
    const verbForms=choices.filter(x=>/\b(?:to\s+)?[a-z]+(?:ed|ing|en|s)?\b/.test(x)).length===choices.length&&sameStem;
    const allShort=choices.length>2&&choices.every(x=>x.split(/\s+/).length<=2);
    const preps=new Set(["about","above","across","after","against","along","among","around","at","before","behind","below","beneath","beside","between","beyond","by","despite","during","except","for","from","in","inside","into","near","of","off","on","onto","opposite","outside","over","past","since","through","throughout","to","toward","under","until","up","upon","with","within","without"]);
    const conjunctions=new Set(["although","because","before","even if","even though","if","once","since","so that","though","unless","until","when","whenever","whereas","whether","while"]);
    if(sameStem||verbForms){score=84;tags.push("词性 / 动词体系")}
    else if(allShort&&choices.every(x=>preps.has(x)||conjunctions.has(x))){score=82;tags.push("介词 / 连词")}
    else if(/词性|词形|动词体系|介词题|连词|从句/.test(type)){score=81;tags.push("高频语法基本盘")}
    else if(/代词|语法/.test(type)){score=70}
    else if(/词汇|搭配/.test(type)){score=64;tags.push("语境词汇")}
    else score=59;
  }else if(part===6){
    if(/整句/.test(s)){score=94;tags.push("篇章衔接")}
    else if(/逻辑|指代|时态/.test(s)){score=86;tags.push("跨句判断")}
    else if(/词性|词形/.test(s)){score=68}
    else score=62;
  }else if(part===7){
    const pictures=asArray(group.picture_paths||group.picture_path).length;
    const multiDocGroup=pictures>1||/multiple|cross reference|多文档/.test(textOf(group.topic,group.keywords));
    // Multiple source images mark the context, not the cognitive demand of
    // every item. Promote only questions whose wording/answer explanation
    // actually links documents, people, dates or shared facts.
    const crossDocument=multiDocGroup&&(/according to (the )?(e-mail|email|notice|article|form|schedule|review).*(and|both)|based on .* and |what do .* (and|both)|which .* (both|also)|in the (first|second|third) .* what .* (other|another)|attachment|discounted cost|able to attend|leave for|both consider|first review.*previous|second e-mail|third review/.test(question+" "+textOf(item.answer_explain)));
    if(crossDocument){score=93;tags.push("多文本整合")}
    else if(/句子插入|图表联动/.test(s)){score=91;tags.push("语篇结构")}
    else if(/推断|隐含|否定事实|词义/.test(s)){score=83;tags.push("语境推断")}
    else if(/主旨|目的|场景/.test(s)){score=70}
    else {const answer=String((item.choices||[])["ABCD".indexOf(item.answer)]||"").toLowerCase(),content=String(group.passage||"").toLowerCase();score=tokenOverlap(answer,content)>.72?42:61;if(multiDocGroup)tags.push("多文本语境");if(score<60)tags.push("明示定位")}
  }
  if(group.difficulty==="hard")score=Math.min(97,score+3);
  const level=score>=80?"P1":score>=60?"P2":"P3";
  return {level,score,label,reason,focus_tags:[...new Set(tags)],scope:"item",model:PRIORITY_MODEL};
}

function tokens(value){return new Set(String(value).toLowerCase().match(/[a-z]{3,}|\d+/g)||[])}
function tokenOverlap(answer,content){const a=tokens(answer),b=tokens(content);if(!a.size)return 0;return [...a].filter(x=>b.has(x)).length/a.size}
function commonPrefix(values){if(!values.length)return 0;let prefix=values[0];for(const value of values.slice(1)){let i=0;while(i<prefix.length&&i<value.length&&prefix[i]===value[i])i++;prefix=prefix.slice(0,i)}return prefix.length}

function normalizeExistingPriority(value,part,type){
  if(!value||!["P1","P2","P3"].includes(value.level)||!Number.isFinite(value.score))return undefined;
  return {...value,label:value.label||type,focus_tags:value.focus_tags||value.tags||[type],scope:"item",part,model:value.model||"toeic_priority_v1"};
}

function mediaRef(bankId,sourceDir,value){
  const relative=cleanPath(value);
  if(!relative)return undefined;
  const sourcePath=path.resolve(sourceDir,...relative.split("/"));
  const inside=sourcePath===sourceDir||sourcePath.startsWith(sourceDir+path.sep);
  if(!inside)fail(`[${bankId}] 资源越过题库目录：${value}`);
  return {path:relative,asset_key:`${bankId}/${relative}`,exists:fs.existsSync(sourcePath)};
}

function buildContext(bank,group){
  const context={};
  for(const key of CONTEXT_FIELDS){
    // The drill UI renders Part 3/4 stems and choices, so their separate
    // question-reading track would be a second, unused audio copy. Publish the
    // conversation/monologue track only; retain question_audio as a fallback
    // solely for malformed source groups that have no primary audio.
    if(key==="question_audio_path"&&group.audio_path)continue;
    if(group[key]==null)continue;
    if(MEDIA_FIELDS.has(key)){
      const refs=asArray(group[key]).map(value=>mediaRef(bank.bank_id,bank.dir,value));
      context[key]=key.endsWith("s")?refs:refs[0];
    }else context[key]=group[key];
  }
  return context;
}

function copyItemFields(item){
  return Object.fromEntries(Object.entries(item).filter(([key])=>!ITEM_OMIT.has(key)&&key!=="priority"));
}

function aggregatePriority(items,existing){
  if(existing?.level&&Number.isFinite(existing.score))return {...existing,scope:"unit",model:existing.model||"toeic_priority_v1"};
  const scores=items.map(x=>x.priority.score),score=Math.round(Math.max(...scores)*.55+(scores.reduce((a,b)=>a+b,0)/scores.length)*.45);
  return {level:score>=80?"P1":score>=60?"P2":"P3",score,label:items.length>1?"共享材料综合训练":"单题训练",reason:items.length>1?"按本组题目的最高训练价值与整体平均价值综合排序，并保持官方共享材料完整。":"按该题的高频考点和能力迁移价值排序。",focus_tags:[...new Set(items.flatMap(x=>x.priority.focus_tags))].slice(0,6),scope:"unit",model:PRIORITY_MODEL};
}

function qualityOf(source,raw){
  const enriched=source.enriched;
  const all=raw.parts.flatMap(flattenPart);
  const missingGraphicGroups=raw.parts.filter(part=>part.part===3||part.part===4).flatMap(part=>part.questions).filter(group=>{
    const text=JSON.stringify(group);
    return /look at|refer to the graphic|graphic/i.test(text)&&!group.picture_path&&!asArray(group.picture_paths).length;
  }).length;
  return {
    enriched,
    translation:enriched&&all.some(x=>x.question_translation||x.transcript_translation||x.passage_translation||x.content_translation)?"available":"unavailable",
    knowledge:enriched&&all.some(x=>x.knowledge_accumulation)?"available":"unavailable",
    analysis:all.every(x=>x.answer_explain)?(enriched?"enriched":"basic"):"partial",
    ocr:"unreviewed",
    missing_graphic_groups:missingGraphicGroups
  };
}

function buildBank(source){
  const raw=readJson(source.source);
  if(!Array.isArray(raw.parts)||raw.parts.length!==7)fail(`[${source.bank_id}] 必须包含7个Part`);
  const partNumbers=raw.parts.map(x=>x.part);
  if(new Set(partNumbers).size!==7||partNumbers.some(x=>!EXPECTED_PART_COUNTS[x]))fail(`[${source.bank_id}] Part编号异常：${partNumbers.join(",")}`);

  const bankOut=path.join(outputRoot,"banks",source.bank_id);
  const unitRows=[],allKeys=new Set(),partStats={};
  let totalItems=0,missingAssets=0;

  for(const part of [...raw.parts].sort((a,b)=>a.part-b.part)){
    const groups=canonicalGroups(part);
    let partItems=0;
    for(const group of groups){
      const originalItems=group.items?.length?group.items:[group];
      const unitId=slugPart(part.part,group.id);
      const items=originalItems.map(item=>{
        const questionType=inferType(part.part,item,group);
        const priority=normalizeExistingPriority(item.priority,part.part,questionType)||genericPriority(part.part,questionType,item,group);
        const normalized={...copyItemFields(item),item_id:item.id,question_type:questionType,priority};
        delete normalized.id;
        const key=itemKey(source.bank_id,unitId,item.id);
        if(allKeys.has(key))fail(`[${source.bank_id}] 重复题目键：${key}`);
        allKeys.add(key);normalized.item_key=key;
        return normalized;
      });
      const context=buildContext(source,group);
      missingAssets+=Object.values(context).flatMap(asArray).filter(x=>x&&typeof x==="object"&&"exists" in x&&!x.exists).length;
      const unitPriority=aggregatePriority(items,group.priority);
      const detail={
        schema_version:SCHEMA_VERSION,bank_id:source.bank_id,unit_id:unitId,part:part.part,
        source_group_id:group.id,mode:items.length===1?"single":"official_set",
        title:group.set_title||group.topic||`Part ${part.part} · ${group.id}`,
        topic:group.topic,keywords:group.keywords,difficulty:group.difficulty,
        priority:unitPriority,context,items
      };
      const detailRel=`banks/${source.bank_id}/units/${unitId}.json`;
      writeJson(path.join(outputRoot,...detailRel.split("/")),detail);
      const assetRefs=Object.values(context).flatMap(asArray).filter(x=>x&&typeof x==="object"&&x.asset_key).map(x=>x.asset_key);
      unitRows.push({
        unit_id:unitId,part:part.part,source_group_id:group.id,mode:detail.mode,title:detail.title,
        item_ids:items.map(x=>x.item_id),question_count:items.length,topic:group.topic,difficulty:group.difficulty,
        item_refs:items.map(({item_id,item_key,question_type,priority})=>({item_id,item_key,question_type,priority})),
        priority:unitPriority,detail_path:detailRel,asset_refs:assetRefs
      });
      partItems+=items.length;totalItems+=items.length;
    }
    if(partItems!==EXPECTED_PART_COUNTS[part.part])fail(`[${source.bank_id}] Part ${part.part} 题数 ${partItems}，预期 ${EXPECTED_PART_COUNTS[part.part]}`);
    partStats[part.part]={part_name:part.part_name||`Part ${part.part}`,section_type:part.section_type||(part.part<=4?"听力":"阅读"),unit_count:unitRows.filter(x=>x.part===part.part).length,question_count:partItems};
  }
  if(totalItems!==200||allKeys.size!==200)fail(`[${source.bank_id}] 总题数/唯一键异常：${totalItems}/${allKeys.size}`);
  if(unitRows.length!==103)fail(`[${source.bank_id}] canonical unit数 ${unitRows.length}，预期103`);
  if(unitRows.some(x=>!x.detail_path||!x.priority?.level||x.question_count<1))fail(`[${source.bank_id}] index存在不完整unit`);

  const index={
    schema_version:SCHEMA_VERSION,bank_id:source.bank_id,content_hash:sha256(unitRows),
    source:{collection:"official",volume:source.volume,test:source.test,file:path.basename(source.source),enriched:source.enriched},
    name:raw.name||`TOEIC Official ${source.volume} Test ${source.test}`,
    author:raw.author,description:raw.description,question_count:totalItems,unit_count:unitRows.length,
    priority_methodology:raw.priority_methodology||{version:PRIORITY_MODEL,disclaimer:"P1/P2/P3为训练优先级，并非ETS官方频率或难度等级。"},
    quality:qualityOf(source,raw),parts:partStats,units:unitRows
  };
  const indexRel=`banks/${source.bank_id}/index.json`;
  writeJson(path.join(outputRoot,...indexRel.split("/")),index);
  return {source,index,indexRel,missingAssets};
}

function validateOutput(results){
  if(results.length!==24)fail(`发现 ${results.length} 套官方题库，预期24套（official_1..12 × test_1/2）`);
  const bankIds=new Set(),globalKeys=new Set();
  let questions=0,units=0;
  for(const result of results){
    const {index,indexRel}=result;
    if(bankIds.has(index.bank_id))fail(`重复bank_id：${index.bank_id}`);bankIds.add(index.bank_id);
    if(!fs.existsSync(path.join(outputRoot,...indexRel.split("/"))))fail(`缺少index：${indexRel}`);
    let bankQuestions=0;
    for(const unit of index.units){
      const detailFile=path.join(outputRoot,...unit.detail_path.split("/"));
      if(!fs.existsSync(detailFile))fail(`[${index.bank_id}] 缺少detail：${unit.detail_path}`);
      const detail=readJson(detailFile);
      if(detail.bank_id!==index.bank_id||detail.unit_id!==unit.unit_id)fail(`[${index.bank_id}] detail标识不一致：${unit.unit_id}`);
      if(detail.items.length!==unit.question_count)fail(`[${index.bank_id}] detail题数不一致：${unit.unit_id}`);
      if(!Array.isArray(unit.item_refs)||unit.item_refs.length!==detail.items.length)fail(`[${index.bank_id}] item_refs题数不一致：${unit.unit_id}`);
      for(let i=0;i<detail.items.length;i++)if(unit.item_refs[i].item_key!==detail.items[i].item_key||unit.item_refs[i].priority?.level!==detail.items[i].priority?.level)fail(`[${index.bank_id}] item_refs与detail不一致：${unit.unit_id}`);
      if([3,4,6,7].includes(unit.part)&&detail.items.length<2)fail(`[${index.bank_id}] Part ${unit.part} 共享组被拆散：${unit.unit_id}`);
      if([1,2,5].includes(unit.part)&&detail.items.length!==1)fail(`[${index.bank_id}] Part ${unit.part} 应为单题unit：${unit.unit_id}`);
      for(const item of detail.items){
        if(!item.priority?.level||!item.question_type)fail(`[${index.bank_id}] 未完成题型/优先级：${item.item_key}`);
        if(globalKeys.has(item.item_key))fail(`全局题键重复：${item.item_key}`);
        globalKeys.add(item.item_key);bankQuestions++;
      }
    }
    if(bankQuestions!==index.question_count||bankQuestions!==200)fail(`[${index.bank_id}] index/detail统计不一致：${bankQuestions}`);
    questions+=bankQuestions;units+=index.unit_count;
  }
  if(questions!==4800||globalKeys.size!==4800)fail(`全局题目校验失败：${questions}/${globalKeys.size}`);
  const priority_distribution={P1:0,P2:0,P3:0};
  const priority_by_part=Object.fromEntries(Array.from({length:7},(_,i)=>[i+1,{P1:0,P2:0,P3:0}]));
  for(const {index} of results)for(const unit of index.units){
    const detail=readJson(path.join(outputRoot,...unit.detail_path.split("/")));
    for(const item of detail.items){priority_distribution[item.priority.level]++;priority_by_part[unit.part][item.priority.level]++}
  }
  return {banks:results.length,questions,units,unique_item_keys:globalKeys.size,missing_media_references:results.reduce((n,x)=>n+x.missingAssets,0),priority_distribution,priority_by_part};
}

function warnPriorityDistribution(validation){
  const warnings=[];
  for(const [part,counts] of Object.entries(validation.priority_by_part)){
    const total=counts.P1+counts.P2+counts.P3,p1=counts.P1/total;
    if(p1>.6)warnings.push(`Part ${part} 的 P1 占比 ${(p1*100).toFixed(1)}%，请抽查分类规则`);
    if(counts.P1===0)warnings.push(`Part ${part} 没有 P1 题，请确认源数据能否识别重点题型`);
  }
  return warnings;
}

fs.rmSync(outputRoot,{recursive:true,force:true});
fs.mkdirSync(outputRoot,{recursive:true});
const discovered=discoverBanks(banksRoot);
const results=discovered.map(buildBank);
const validation=validateOutput(results);
const priorityWarnings=warnPriorityDistribution(validation);
const catalog={
  schema_version:SCHEMA_VERSION,content_version:new Date().toISOString(),priority_model:PRIORITY_MODEL,
  asset_policy:{copied:false,path_semantics:"每个资源的 path 相对其原始 bank 目录；asset_key 为 bank_id/path。运行时需配置媒体基址。"},
  totals:validation,
  warnings:[...priorityWarnings,...(results.some(result=>result.index.quality.missing_graphic_groups)?["Official 5–9 的部分 Part 3/4 图表题源目录未提供配套图表；网页保留题目与音频，并在题库质量字段中标记缺失。"]:[])],
  banks:results.map(({source,index,indexRel,missingAssets})=>({
    bank_id:index.bank_id,collection:"official",volume:source.volume,test:source.test,title:index.name,
    question_count:index.question_count,unit_count:index.unit_count,parts:index.parts,index_path:indexRel,
    source_file:path.relative(banksRoot,source.source).split(path.sep).join("/"),enriched:source.enriched,
    quality:index.quality,missing_media_references:missingAssets,
    asset_base:`assets/${index.bank_id}/`
  }))
};
writeJson(path.join(outputRoot,"catalog.json"),catalog);
// Re-open the catalog as the final serialization check and keep totals free of
// advisory diagnostics (warnings are emitted in their own catalog field).
const writtenCatalog=readJson(path.join(outputRoot,"catalog.json"));
if(writtenCatalog.banks.length!==24||writtenCatalog.totals.questions!==4800)fail("catalog最终序列化校验失败");
console.log(`Built ${validation.banks} banks, ${validation.units} units and ${validation.questions} questions in ${outputRoot}`);
console.log(`Source tree stayed read-only: ${banksRoot}`);
console.log(`Missing media references (reported, not copied): ${validation.missing_media_references}`);
for(const warning of priorityWarnings)console.warn(`Warning: ${warning}`);
