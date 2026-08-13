#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const target=process.argv[2];
if(!target||!path.isAbsolute(target))throw new Error("请传入 question.json 的绝对路径");
const bank=JSON.parse(fs.readFileSync(target,"utf8"));

const officialBasis=[
  "ETS/IIBC TOEIC Listening & Reading 现行考试结构与题量",
  "ETS TOEIC Listening & Reading Abilities Measured",
  "IIBC 官方样题中的图表题、隐含义、整句填空、句子插入与多文本形式"
];
const sources=[
  "https://www.iibc-global.org/english/toeic/test/lr/about/format.html",
  "https://www.iibc-global.org/english/toeic/test/lr/guide05/guide05_01.html",
  "https://www.iibc-global.org/english/toeic/test/lr/guide05/guide05_01/score_descriptor.html",
  "https://www.iibc-global.org/toeic/support/prep/method_03.html"
];

const map=(ids,level,score,label,reason,tags)=>Object.fromEntries(ids.map(id=>[String(id),{level,score,label,reason,tags}]));
const M={
  1:{
    ...map([4,6],"P1",84,"动作与状态辨析","人物动作、进行被动与静态状态干扰并存，适合优先训练准确描述。",["人物动作","被动状态","强干扰项"]),
    ...map([1,2],"P2",67,"办公与交通动作","覆盖高频办公、交通场景，需要一般同义改写与主体核对。",["高频场景","人物动作","同义改写"]),
    ...map([3,5],"P3",48,"基础静态描述","关键信息为直接可见的静态人物或物体位置，适合作为基础查漏。",["静态描述","位置关系"])
  },
  2:{
    ...map([11,13,14,18,19,21,24,27,29,31],"P1",86,"间接与非常规应答","命中否定/反意、陈述、请求或间接回答等高分段关键能力，不能只靠问词配对。",["间接应答","语用判断","干扰项"]),
    ...map([8,10,16,17,20,22,26,28,30],"P2",68,"一般问句与改写","常见原因、一般、确认、方式或选择问句，需要结合补充信息判断自然回应。",["自然应答","功能判断","同义改写"]),
    ...map([7,9,12,15,23,25],"P3",47,"直接信息应答","答案与地点、人物或时间直接对应，适合基础问词反应训练。",["Wh问句","直接回答","基础反应"])
  },
  3:{
    ...map(["47-49","50-52","59-61","62-64","65-67","68-70"],"P1",88,"综合会话重点套题","包含话语目的、推断后续或图表联动，要求跨轮次整合与同义改写，是现行 Part 3 的高价值训练。",["跨轮次","意图/下一步","图表联动"]),
    ...map(["32-34","35-37","41-43","44-46","56-58"],"P2",68,"主旨与细节套题","覆盖职场场景、问题原因和后续行动，训练主旨加细节的稳定得分能力。",["场景主旨","原因细节","后续行动"]),
    ...map(["38-40","53-55"],"P3",49,"明示信息巩固套题","关键信息较集中且多为直接定位，适合作为基础场景和明示细节查漏。",["明示细节","基础场景"])
  },
  4:{
    ...map(["77-79","86-88","95-97","98-100"],"P1",88,"独白推断与图表套题","覆盖隐含义、话语功能、操作指令或图表联动，需要把握独白结构并连接多处信息。",["隐含义","话语功能","图表联动"]),
    ...map(["71-73","74-76","80-82","89-91"],"P2",67,"目的与关键信息套题","训练广告、演讲和公司通知中的受众、目的、原因及下一步。",["目的/受众","原因细节","下一步"]),
    ...map(["83-85","92-94"],"P3",48,"顺序细节巩固套题","信息按独白顺序直接给出，适合训练快速抓取明示事实。",["顺序定位","明示细节"])
  },
  5:{
    ...map(["101-105","106-110","111-115"],"P1",84,"高频语法基本盘套题","集中训练词性、动词体系、介词/连词和固定搭配等 Part 5 高频得分点。",["词性词形","动词体系","介词连词","固定搭配"]),
    ...map(["116-120","126-130"],"P2",66,"语法词汇巩固套题","覆盖时间介词、代词、连接和职场语境词汇，用于巩固常考规则并提升速度。",["介词搭配","代词连接","语境词汇"]),
    ...map(["121-125"],"P3",49,"中阶词汇查漏套题","侧重抽象名词、程度与数量表达，作为核心语法之后的补充覆盖。",["抽象名词","程度副词","数量表达"])
  },
  6:{
    ...map(["139-142","143-146"],"P1",90,"语篇衔接重点套题","包含整句填入、逻辑连接、指代或跨句时态判断，直接命中 Part 6 的篇章连贯核心。",["整句填入","逻辑连接","指代","跨句时态"]),
    ...map(["131-134"],"P2",69,"语境语法综合套题","兼有整句填入、代词指代和语境词汇，需要结合上下文判断。",["整句填入","指代","语境词汇"]),
    ...map(["135-138"],"P3",50,"局部词形查漏套题","多数题可通过局部词义与词形判断，保留一题整句衔接作为补充训练。",["词形","局部语境","整句填入"])
  },
  7:{
    ...map(["176-180","181-185","186-190","191-195","196-200"],"P1",91,"多文本整合重点套题","需要跨文档连接人物、时间、观点或事件，是 Part 7 最高训练杠杆。",["跨文本","推断","信息整合"]),
    ...map(["155-157","158-160","164-167","168-171","172-175"],"P2",69,"单篇推断重点套题","覆盖词义、话语含义、句子插入和一般推断，训练语境理解与同义改写。",["主旨目的","推断","句子插入","同义改写"]),
    ...map(["147-148","149-150","151-152","153-154","161-163"],"P3",48,"短材料定位巩固套题","以短网页、表格、短信或通知中的直接信息为主，适合限时定位热身。",["短文本","明示细节","快速定位"])
  }
};

const itemOverrides={
  64:["P1",91,"图表联动"],66:["P1",92,"图表联动"],70:["P1",92,"图表联动"],
  78:["P1",92,"隐含义"],87:["P1",86,"话语功能"],90:["P1",86,"话语功能"],97:["P1",92,"图表联动"],99:["P1",92,"图表联动"],
  133:["P1",93,"整句填入"],137:["P1",93,"整句填入"],140:["P1",94,"整句填入"],143:["P1",94,"整句填入"],
  147:["P1",82,"否定事实"],152:["P1",85,"话语含义"],160:["P1",94,"句子插入"],167:["P1",94,"句子插入"],171:["P1",92,"隐含义"],181:["P1",91,"推断"],
  149:["P3",45,"明示细节"],150:["P3",47,"明示要求"]
};
const part2Types={
  7:"地点疑问句",8:"原因疑问句",9:"人物疑问句",10:"一般疑问句",11:"否定疑问句",12:"时间疑问句",13:"陈述 / 指令应答",14:"反意疑问句",15:"地点疑问句",16:"原因疑问句",17:"一般疑问句",18:"陈述句应答",19:"请求 / 许可问句",20:"方式疑问句",21:"否定疑问句",22:"确认问句",23:"时间疑问句",24:"建议应答",25:"时间疑问句",26:"选择疑问句",27:"陈述句应答",28:"程度疑问句",29:"一般疑问句",30:"选择疑问句",31:"陈述句应答"
};
const part6Types={131:"动词形式题",132:"代词 / 指代题",133:"整句填入题",134:"语境词汇题",135:"语境词汇题",136:"词性 / 词形题",137:"整句填入题",138:"词性 / 词形题",139:"语境词汇题",140:"整句填入题",141:"逻辑衔接词题",142:"代词 / 指代题",143:"整句填入题",144:"时态语态题",145:"逻辑衔接词题",146:"语境词汇题"};

function priority(meta,scope,part,id){return{
  level:meta.level,score:meta.score,label:meta.label,reason:meta.reason,
  focus_tags:meta.tags,basis:[...officialBasis,"备考资料对高频考点的共识，仅用于训练排序，不代表 ETS 公布固定出题频率"],
  source_urls:sources,scope,part,unit_id:`part${part}-${id}`,model:"toeic_priority_v1"
}}
function itemPriority(base,part,item){
  const o=itemOverrides[item.id];
  if(o)return priority({level:o[0],score:o[1],label:o[2],reason:`本题的${o[2]}能力具有较高复现与迁移价值，应在本套中优先复盘。`,tags:[o[2],"重点单题"]},"item",part,item.id);
  return priority({...base,score:Math.max(0,base.score-2),label:item.question_type||base.label,reason:`随整套训练；本题重点为${item.question_type||base.label}，在完整语境中完成更有训练价值。`},"item",part,item.id)
}

for(const part of bank.parts){
  if(part.part===5){
    const originals=part.questions;
    if(originals.length===6&&originals.every(q=>q.items?.length===5)){
      for(const group of originals){const base=M[5][String(group.id)];group.priority=priority(base,"set",5,group.id);group.items.forEach(item=>item.priority=itemPriority(base,5,item));group.training_unit={mode:"set",unit_id:`part5-${group.id}`,item_ids:group.items.map(x=>x.id),question_count:5,official_group:false,note:"Part 5 正式考试为独立题；本处仅按连续 5 题组成训练套题。"}}
      continue;
    }
    if(originals.length!==30||originals.some(q=>q.items))throw new Error("Part 5 预期为 30 道独立题或 6 个训练包");
    const packs=[];
    for(let i=0;i<30;i+=5){
      const items=originals.slice(i,i+5),id=`${items[0].id}-${items.at(-1).id}`,base=M[5][id];
      if(!base)throw new Error(`缺少 Part 5 套题映射 ${id}`);
      items.forEach(item=>{item.priority=itemPriority(base,5,item)});
      packs.push({id,set_title:`高频考点训练 ${i/5+1}`,topic:items.map(x=>x.topic).join(" · "),difficulty:base.level==="P1"?"medium":"easy",items,priority:priority(base,"set",5,id),training_unit:{mode:"set",unit_id:`part5-${id}`,item_ids:items.map(x=>x.id),question_count:5,official_group:false,note:"Part 5 正式考试为独立题；本处仅按连续 5 题组成训练套题。"}})
    }
    part.questions=packs;
  }else{
    for(const group of part.questions){
      const base=M[part.part]?.[String(group.id)];
      if(!base)throw new Error(`缺少 Part ${part.part} 映射 ${group.id}`);
      group.priority=priority(base,group.items?"set":"item",part.part,group.id);
      const items=group.items||[group];items.forEach(item=>{if(part.part===2)item.question_type=part2Types[item.id];if(part.part===6)item.question_type=part6Types[item.id];item.priority=itemPriority(base,part.part,item)});
      group.training_unit={mode:group.items?"set":"single",unit_id:`part${part.part}-${group.id}`,item_ids:items.map(x=>x.id),question_count:items.length,official_group:part.part!==5};
    }
  }
}

bank.schema_version="2.1";
bank.updated_for="priority_drills_and_grouped_exam_practice";
bank.priority_methodology={version:"toeic_priority_v1",levels:{P1:"优先必刷：高频核心、综合能力或新版重点题型",P2:"重点巩固：常见主旨、细节、语法与语境应用",P3:"基础查漏：直接信息、基础表达和限时定位"},score_formula:"题型复现/得分杠杆 + ETS 核心能力 + 认知难度 + 迁移价值；难度本身不能单独升为 P1。",official_basis:officialBasis,source_urls:sources,disclaimer:"P1/P2/P3 是训练优先级，不是 ETS 难度等级或官方频率排名。ETS 不公布细分考点的固定出题频率。",part5_note:"Part 5 正式考试为独立题；网站将连续 5 题整理为一套训练包，题目顺序和编号保持不变。"};

const all=bank.parts.flatMap(p=>p.questions.flatMap(g=>g.items||[g]));
if(all.length!==200)throw new Error(`题数异常：${all.length}`);
if(all.some(x=>!x.priority?.level))throw new Error("存在未定级题目");
for(const p of bank.parts)for(const g of p.questions)if(!g.priority?.level)throw new Error(`存在未定级题组 ${p.part}-${g.id}`);
fs.writeFileSync(target,JSON.stringify(bank,null,2)+"\n");
console.log(`Prioritized ${all.length} items in ${bank.parts.reduce((n,p)=>n+p.questions.length,0)} training units.`);
