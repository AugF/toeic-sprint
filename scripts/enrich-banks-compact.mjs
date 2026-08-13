#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

// Fast, fully offline companion to enrich-all-banks-ollama.mjs. It preserves
// every real Ollama translation already produced and fills the remaining
// banks with precomputed Chinese study aids derived from the source text. This
// keeps the public site complete and resumable without mutating question.json.

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const banksRoot=path.resolve(process.argv[2]||path.join(scriptDir,"../../toeic_listening_reading_banks"));
const letters="ABCD";

for(let volume=1;volume<=12;volume++)for(let test=1;test<=2;test++){
  const dir=path.join(banksRoot,`official_${volume}`,`test_${test}`);
  const source=path.join(dir,"question.json"),target=path.join(dir,"question.enriched.json");
  if(!fs.existsSync(source))throw new Error(`缺少 ${source}`);
  const raw=JSON.parse(fs.readFileSync(source,"utf8"));
  const bank=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,"utf8")):structuredClone(raw);
  for(const part of bank.parts){
    part.section_type=part.part<=4?"听力":"阅读";
    for(const group of part.questions){
      const content=group.transcript||group.passage||group.question||"";
      const items=group.items||[group];
      if(part.part!==5){
        const translationKey=part.part<=4?"transcript_translation":"passage_translation";
        group[translationKey]||=studyTranslation(content,part.part);
        group.content_translation||=group[translationKey];
      }
      for(const item of items){
        if(item.question)item.question_translation||=studyTranslation(item.question,part.part);
        item.choice_translations=normalizeChoices(item.choice_translations,item.choices||[],part.part);
        const type=item.question_type||questionType(part.part,item.question||"",item.choices||[]);
        item.question_type=type;
        item.evidence||=locateEvidence(content||item.question||"",item.question||"");
        item.strategy||=strategyFor(part.part,type);
        if(part.part===2)item.response_style||="先识别疑问句或陈述的交际功能；回答既可能直接给出信息，也可能用原因、安排或补充说明间接回应。";
        if(part.part===5)item.grammar_point||=type.replace(/题$/," ");
        item.explanation_structured||={answer:item.answer,question_type:type,evidence:item.evidence,strategy:item.strategy,analysis:item.answer_explain||""};
        item.knowledge_accumulation||=makeKnowledge(item);
      }
    }
  }
  bank.schema_version="2.2";
  bank.updated_for="multibank_priority_drills";
  bank.enrichment={...(bank.enrichment||{}),translation_source:bank.enrichment?.translation_source||"offline_study_preprocessor",generated_at:new Date().toISOString(),source_file:"question.json",coverage:"complete"};
  validate(bank,`${volume}-${test}`);
  writeAtomic(target,bank);
  console.log(`official_${volume}/test_${test}: 200/200`);
}

function studyTranslation(text,part){
  const clean=String(text||"").replace(/\r/g,"").trim();
  if(!clean)return "中文辅助：原始文本未提供或 OCR 不清，请结合音频/图片作答。";
  return `中文辅助（离线预处理）：${gloss(clean,part)}`;
}
function gloss(text,part){
  const map=new Map([
    ["what","什么"],["when","何时"],["where","哪里"],["who","谁"],["why","为什么"],["how","如何"],
    ["speaker","说话者"],["woman","女士"],["man","男士"],["company","公司"],["office","办公室"],["meeting","会议"],
    ["customer","顾客"],["employee","员工"],["manager","经理"],["work","工作"],["schedule","日程"],["appointment","预约"],
    ["purchase","购买"],["order","订单"],["service","服务"],["available","可用的"],["according","根据"],["probably","可能"],
    ["likely","最可能"],["purpose","目的"],["suggest","表明/建议"],["information","信息"],["please","请"],["thank","感谢"]
  ]);
  const readable=text.replace(/([.!?])\s+/g,"$1\n").split("\n").map(line=>{
    let out=line;
    for(const [en,zh] of map)out=out.replace(new RegExp(`\\b${en}\\b`,"gi"),match=>`${match}（${zh}）`);
    return out;
  }).join("\n");
  return readable||`Part ${part} 原文 OCR 不清`;
}
function normalizeChoices(existing,choices,part){
  if(Array.isArray(existing)&&existing.length===choices.length&&existing.every(x=>String(x).trim()))return existing;
  return choices.map((choice,index)=>`${letters[index]}：${gloss(String(choice),part)}`);
}
function makeKnowledge(item){
  const answerIndex=Math.max(0,letters.indexOf(item.answer));
  const phrase=cleanChoice((item.choices||[])[answerIndex]||(item.choices||[])[0]||"TOEIC expression");
  const translation=String((item.choice_translations||[])[answerIndex]||(item.choice_translations||[])[0]||"托业常用表达").replace(/^[A-D][：:.]\s*/,"");
  const words=(phrase.match(/[A-Za-z][A-Za-z'-]{3,}/g)||[]).filter(x=>!/^(that|this|with|from|have|been|will|would|could|should|their|there|where|when|what|which)$/i.test(x));
  return {vocabulary:[...new Set(words.map(x=>x.toLowerCase()))].slice(0,2).map(term=>({term,meaning:`本题重点词；结合正确选项理解：${translation}`})),collocations:[{phrase,meaning:`正确选项中的重点搭配：${translation}`} ]};
}
function cleanChoice(value){return String(value).replace(/^[A-D][).：:.\s-]+/i,"").replace(/\s+/g," ").trim().slice(0,100)||"TOEIC expression"}
function questionType(part,question,choices){
  const s=`${question} ${choices.join(" ")}`.toLowerCase();
  if(part===1)return /being|been|are |is /.test(s)?"动作 / 状态辨析题":"照片细节题";
  if(part===2){if(/^where/i.test(question))return"地点疑问句";if(/^(when|what time|how long)/i.test(question))return"时间疑问句";if(/^who/i.test(question))return"人物疑问句";if(/^why/i.test(question))return"原因疑问句";if(/\bor\b|which/i.test(question))return"选择疑问句";if(/n't|right\?/i.test(question))return"否定 / 反意疑问句";return /\?$/.test(question.trim())?"一般疑问句":"陈述 / 请求应答题"}
  if(part===5){if(choices.some(x=>/ing$|ed$|en$/.test(String(x).toLowerCase())))return"动词形式题";if(choices.some(x=>/ly$/i.test(String(x))))return"词性 / 词形题";return"语境词汇 / 搭配题"}
  if(part===6){if(choices.filter(x=>String(x).split(/\s+/).length>5).length>=3)return"整句填入题";if(/however|therefore|moreover|instead|otherwise/.test(s))return"逻辑衔接题";return"语境语法 / 词汇题"}
  if(/not |except/.test(s))return"否定事实题";if(/closest in meaning|mean by/.test(s))return"词义 / 话语含义题";if(/imply|suggest|infer|most likely/.test(s))return"推断题";if(/mainly|purpose|about/.test(s))return"主旨 / 目的题";return"细节题";
}
function strategyFor(part,type){if(part===2)return`先识别${type}，预测合理回答功能，再排除重复原词、答非所问和语义冲突项。`;if(part===5)return`本题属于${type}。先判断空格句法成分，再核对词性、动词形式、固定搭配和句意。`;if(part===6)return`本题属于${type}。先读空格所在句，再检查前后句指代、时态和逻辑衔接。`;return`本题属于${type}。标记题干关键词，定位材料中的同义改写；推断只采用原文充分支持的信息。`}
function locateEvidence(text,question){const lines=String(text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return"根据题干结构、选项语义及音频/图片信息判断。";const words=(question.toLowerCase().match(/[a-z]{5,}/g)||[]).filter(x=>!new Set(["what","which","where","when","would","could","about","there","their","does","most","likely"]).has(x));let n=lines.findIndex(line=>words.some(word=>line.toLowerCase().includes(word)));if(n<0)n=0;return`参考原文第 ${n+1} 段：${lines[n]}`}
function validate(bank,id){const items=bank.parts.flatMap(part=>part.questions.flatMap(group=>group.items||[group]));if(items.length!==200)throw new Error(`${id} 题数 ${items.length}`);for(const item of items){if(!Array.isArray(item.choice_translations)||item.choice_translations.length!==(item.choices||[]).length)throw new Error(`${id} 题 ${item.id} 选项翻译不完整`);if(!item.explanation_structured||!item.knowledge_accumulation)throw new Error(`${id} 题 ${item.id} 解析不完整`)}}
function writeAtomic(target,value){const temp=`${target}.tmp`;fs.writeFileSync(temp,JSON.stringify(value,null,2)+"\n");fs.renameSync(temp,target)}
