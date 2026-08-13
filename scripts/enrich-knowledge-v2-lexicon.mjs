#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

/**
 * Deterministic knowledge_v2 enrichment.
 *
 * A deliberately small, reviewed TOEIC lexicon is matched against the complete
 * visible exercise context.  Unlike the former model pass, this never infers
 * from an answer, explanation, translation or metadata: no match simply emits
 * two empty arrays.  Part 3/4/6/7 notes live once on their shared group.
 *
 * Usage:
 *   node scripts/enrich-knowledge-v2-lexicon.mjs --force
 *   node scripts/enrich-knowledge-v2-lexicon.mjs --only official_11/test_1
 *   node scripts/enrich-knowledge-v2-lexicon.mjs --validate-only
 */

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT=path.resolve(scriptDir,"../../toeic_listening_reading_banks");
const MATERIAL_PARTS=new Set([3,4,6,7]);
const MAX_PER_KIND=2;

const entry=(value,meaning,why,rank=50)=>({value,meaning,why,rank});
const V=(term,meaning,why,rank)=>entry(term,meaning,why,rank);
const C=(phrase,meaning,why,rank)=>entry(phrase,meaning,why,rank);

// Only workplace words with a clear TOEIC transfer value are included.  Basic
// objects and generic test words are intentionally absent; this is a quality
// gate, not a coverage target.
const VOCABULARY=[
  V("acquisition","收购；购置","常见于公司扩张、采购与资产类商务文本。",91),
  V("adhere","遵守；坚持","常用于制度、流程和安全要求的正式表达。",87),
  V("allocation","分配；拨款","财务预算、资源配置场景的核心名词。",89),
  V("amend","修订；修改","合同、政策和文件变更的高频正式动词。",87),
  V("applicant","申请人；求职者","招聘、人事和申请表文本的高频词。",90),
  V("appraisal","评估；考核","人事绩效和资产评价场景常用。",85),
  V("authorize","授权；批准","审批、付款和权限流程的正式动词。",91),
  V("budgetary","预算的","财务限制和经费计划语境常见。",88),
  V("commence","开始；着手","公告、合同和正式通知中的书面动词。",86),
  V("compliance","合规；遵从","制度、安全和监管类商务文本的高价值词。",93),
  V("confidential","机密的；保密的","人事、客户资料和内部文件场景常见。",91),
  V("consolidate","合并；整合","公司运营、报表和资源整合语境常见。",86),
  V("contingency","意外情况；应急预案","项目、预算和风险管理中的正式词。",86),
  V("courteous","有礼貌的；周到的","客户服务与招聘评价中的常见形容词。",82),
  V("discrepancy","差异；不符之处","账单、库存和记录核对的核心词。",92),
  V("discontinue","停止；终止","产品、服务或流程调整通知中常用。",86),
  V("distribution","分发；配送；分销","物流、营销和文件发放场景常见。",88),
  V("eligible","有资格的；符合条件的","福利、优惠和申请说明中的高频词。",94),
  V("enrollment","登记；注册","培训、会员和福利计划场景常见。",84),
  V("expedite","加快；促成","物流、审批和项目进度语境的高价值动词。",93),
  V("feasibility","可行性","项目提案、预算与决策分析中常见。",88),
  V("fiscal","财政的；会计年度的","预算和财务报表文本的重要词。",90),
  V("fluctuate","波动","价格、销售额和市场数据描述中常见。",82),
  V("freight","货运；货物","物流运输和报价场景的专业词。",87),
  V("guarantee","保证；担保","售后、合同和产品服务说明常见。",84),
  V("incentive","激励；奖励措施","销售、员工福利和营销活动高频。",91),
  V("incumbent","现任者；在职者","招聘和职位公告的正式词。",80),
  V("inventory","库存","采购、仓储和零售运营的核心词。",94),
  V("itinerary","行程安排","商务旅行、活动和客户接待场景常见。",88),
  V("logistics","物流；后勤","供应链、配送和活动筹备的核心词。",94),
  V("maintenance","维护；保养","设施、设备和运营通知的高频词。",88),
  V("mandatory","强制的；必须的","政策、培训和安全规定说明常见。",89),
  V("negotiate","谈判；协商","合同、采购和商务合作语境高频。",91),
  V("notification","通知","系统、预约和服务变更的正式名词。",82),
  V("obligation","义务；责任","合同条款和工作职责场景常用。",87),
  V("oversee","监督；管理","主管职责和项目管理的正式动词。",87),
  V("participant","参与者","会议、培训、活动及调查语境常见。",82),
  V("payroll","工资单；薪资总额","人事和财务行政的专业词。",89),
  V("preliminary","初步的；预备的","报告、日程和项目阶段说明常见。",84),
  V("procurement","采购","供应商、订单和企业采购的核心词。",95),
  V("prospective","潜在的；未来的","客户、员工或买方描述中的正式词。",85),
  V("reimbursement","报销；偿还","差旅、费用和客户服务场景常见。",93),
  V("renovation","翻修；改造","办公设施和场地维护通知高频。",86),
  V("reservation","预订","酒店、餐饮、会议室与出行场景常见。",83),
  V("retention","保留；留存","员工、人事和客户管理语境的正式词。",84),
  V("revenue","收入；营收","销售、财报和公司业绩文本的核心词。",93),
  V("shipment","装运；货运批次","订单、交付和物流跟踪场景高频。",92),
  V("solicitation","征集；招揽","招标、公益和商业书面通知中的正式词。",82),
  V("specification","规格；说明","产品、设备和采购要求中的专业词。",90),
  V("stationery","文具","行政采购与办公用品场景的易混高频词。",80),
  V("supervise","监督；指导","岗位职责和人员管理的高频动词。",84),
  V("surplus","剩余；盈余","库存、预算和供应调配文本中常见。",86),
  V("tentative","暂定的；初步的","会议、日程和项目计划说明常见。",86),
  V("terminate","终止","合同、服务和雇佣关系的正式动词。",91),
  V("turnover","人员流动率；营业额","人事与经营数据文本的高价值词。",87),
  V("transaction","交易；业务处理","支付、银行和客户服务场景常见。",88),
  V("vacancy","空缺职位；空房","招聘、酒店和租赁广告中常见。",87),
  V("vendor","供应商；摊贩","采购、活动和供应链场景的核心词。",90),
  V("warranty","保修；质保","产品售后和服务条款中的高频词。",88),
  V("wholesale","批发的；批发","零售、价格和供应商场景常见。",82),
  V("withdraw","撤回；提取","申请、银行交易和公告通知中常见。",85)
];

const COLLOCATIONS=[
  C("adhere to the policy","遵守该政策","制度、合规和员工通知中可直接迁移的正式搭配。",95),
  C("allocate funds","拨付资金","预算制定和资源分配场景的核心搭配。",95),
  C("annual budget","年度预算","财务计划和部门经费文本的高频搭配。",90),
  C("assess performance","评估绩效","人事考核与项目复盘中常用。",89),
  C("at no additional charge","无需额外收费","报价、服务条款和促销信息中的固定表达。",94),
  C("be eligible for","有资格获得","福利、折扣和申请资格说明的高频结构。",96),
  C("be responsible for","负责……","岗位职责和工作分工文本的核心结构。",91),
  C("carry out an inspection","实施检查","设施、安全和质量管理场景的正式搭配。",91),
  C("comply with regulations","遵守规定","合规、安全和行业规范文本的核心搭配。",96),
  C("conduct an interview","进行面试","招聘流程与人事沟通的高频搭配。",90),
  C("confirm a reservation","确认预订","酒店、餐饮和会议安排场景常用。",89),
  C("cost-effective solution","成本效益高的方案","采购、提案和运营优化文本的高价值搭配。",92),
  C("customer satisfaction","客户满意度","客户服务、营销与质量评价的核心搭配。",92),
  C("delivery schedule","交付进度表","物流、采购和项目协调的高频搭配。",90),
  C("due to unforeseen circumstances","由于不可预见的情况","延期、取消和正式通知中的固定书面表达。",94),
  C("extend the deadline","延长截止日期","项目、申请和工作安排场景常见。",89),
  C("file a claim","提出索赔","保险、运输损坏和客户服务文本的高频搭配。",90),
  C("financial statement","财务报表","会计、预算和企业运营信息中的核心搭配。",93),
  C("follow up on","跟进；追踪处理","客户服务、项目管理和邮件沟通的高频短语动词。",94),
  C("free of charge","免费","促销、服务与费用说明中的固定表达。",89),
  C("full refund","全额退款","退货、取消和客户服务场景的高频搭配。",89),
  C("hiring process","招聘流程","人事和职位申请场景的核心搭配。",90),
  C("implementation plan","实施计划","项目提案与运营变更文本的高价值搭配。",91),
  C("in accordance with","按照；依据","政策、合同和正式说明中的核心固定结构。",96),
  C("in advance","提前","预约、付款和活动安排场景的高频表达。",86),
  C("in response to","回应；针对","邮件、公告和客户沟通中的正式连接表达。",91),
  C("keep track of","跟踪；掌握……情况","库存、进度与客户记录场景的常用短语动词。",91),
  C("maintenance work","维护工作","设施检修、停用通知和运营文本常见。",86),
  C("marketing strategy","营销策略","市场推广、销售计划和商业提案的核心搭配。",92),
  C("meet the requirements","符合要求","申请、采购和岗位说明中的高频结构。",93),
  C("operating expenses","运营费用","预算、财务和企业经营文本的核心搭配。",91),
  C("out of stock","缺货","零售、订单和库存管理场景的固定表达。",87),
  C("payment terms","付款条件","合同、发票和采购订单中的高频搭配。",91),
  C("place an order","下订单","采购、零售和客户服务场景的核心搭配。",91),
  C("product line","产品线","营销、零售和公司介绍文本常见。",85),
  C("promotional campaign","促销活动","广告、营销和销售计划的高价值搭配。",91),
  C("provide a quote","提供报价","采购、服务询价和商务往来的常用搭配。",93),
  C("purchase order","采购订单","供应商、发票和物流流程的核心搭配。",95),
  C("quality control","质量控制","生产、服务和运营管理文本的核心搭配。",92),
  C("reach an agreement","达成协议","谈判、合同和商务合作场景常见。",90),
  C("reduce costs","降低成本","预算、经营和项目提案中的高频搭配。",89),
  C("renew a contract","续签合同","人事、租赁和供应商管理文本常见。",91),
  C("review an application","审核申请","招聘、会员和行政审批场景的高频搭配。",89),
  C("safety regulations","安全规定","设施、制造和员工培训场景的核心搭配。",91),
  C("sales representative","销售代表","客户沟通、招聘与商务联系信息常见。",86),
  C("schedule an appointment","安排预约","医疗、客户服务和商务会面场景的高频搭配。",90),
  C("submit a proposal","提交提案","项目竞标、会议和业务拓展文本常用。",92),
  C("submit an application","提交申请","求职、注册和资格申请场景的核心搭配。",91),
  C("supplier contract","供应商合同","采购与供应链管理中的高价值搭配。",90),
  C("technical support","技术支持","软件、设备和客户服务文本常见。",86),
  C("travel arrangements","出行安排","商务旅行、活动筹备和行政沟通常见。",89),
  C("under construction","施工中","设施通知、交通和场地信息中的固定表达。",86),
  C("up to date","最新的；已更新的","资料、记录和软件服务场景的常用表达。",86),
  C("warranty period","保修期","产品、设备和售后服务说明的高频搭配。",88),
  C("work order","维修工单；工作指令单","设施维护和运营管理文本的专业搭配。",88),
  C("work overtime","加班","排班、项目进度和人事沟通场景常见。",83),
  C("arrange for delivery","安排配送","采购、零售和客户服务场景的实用搭配。",89),
  C("be scheduled to","计划于；定于","日程、公告和项目安排中的高频结构。",88),
  C("call for proposals","征集提案","招标、活动和项目公告中的正式搭配。",91),
  C("customer feedback","客户反馈","服务改进、市场调研和质量管理的核心搭配。",90),
  C("delivery confirmation","交付确认","物流、订单跟踪和客户服务场景常见。",87),
  C("employee benefits","员工福利","招聘、人事和公司政策文本常见。",88),
  C("estimated arrival time","预计到达时间","物流、出行和调度信息的实用搭配。",86),
  C("fill a vacancy","填补空缺职位","招聘和人事安排场景常用。",88),
  C("issue a refund","办理退款","客户服务与付款处理场景的正式搭配。",89),
  C("make arrangements","作出安排","会议、差旅和活动筹备中的高频搭配。",84),
  C("meet a deadline","赶上截止日期","项目管理和工作安排中的核心表达。",91),
  C("on behalf of","代表……","邮件、公告和商务沟通中的正式固定结构。",90),
  C("provide an estimate","提供估价；预估","维修、服务和项目报价场景常见。",89),
  C("take into account","考虑到","决策、提案和政策说明中的高频短语。",91),
  C("terms and conditions","条款与条件","合同、服务说明和网站文本的核心搭配。",92),
  C("training session","培训课程","员工培训和活动通知中的常用搭配。",80),
  C("update the records","更新记录","行政、客户和库存管理中的实用搭配。",86)
];

const settings=parseArgs(process.argv.slice(2));
const banks=discoverBanks(settings.source).filter(bank=>!settings.only.size||settings.only.has(bank.rel));
if(!banks.length)throw new Error("没有找到符合条件的 question.enriched.json");
const totals={banks:0,units:0,written:0,skipped:0,empty:0,vocabulary:0,collocations:0,invalid:0,missing:0};
for(const bank of banks)processBank(bank,settings,totals);
const action=settings.validateOnly?"校验":"生成";
console.log(`${action}完成：${totals.banks} 套、${totals.units} 个 unit；写入 ${totals.written}，跳过 ${totals.skipped}，空积累 ${totals.empty}，词汇 ${totals.vocabulary}，搭配 ${totals.collocations}，缺失 ${totals.missing}，无效 ${totals.invalid}。`);
if(settings.validateOnly&&(totals.missing||totals.invalid))process.exitCode=1;

function parseArgs(argv){
  const values=new Map(),flags=new Set();
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(["--force","--validate-only","--help","-h"].includes(arg)){flags.add(arg);continue}
    if(!["--source","--only"].includes(arg)||i+1>=argv.length)throw new Error(`未知或不完整参数：${arg}`);
    values.set(arg,argv[++i]);
  }
  if(flags.has("--help")||flags.has("-h")){console.log("Usage: node scripts/enrich-knowledge-v2-lexicon.mjs [--force] [--validate-only] [--only official_11/test_1] [--source path]");process.exit(0)}
  return {source:path.resolve(values.get("--source")||DEFAULT_ROOT),only:new Set((values.get("--only")||"").split(",").filter(Boolean)),force:flags.has("--force"),validateOnly:flags.has("--validate-only")};
}

function discoverBanks(root){
  const banks=[];
  for(const volume of fs.readdirSync(root,{withFileTypes:true})){
    if(!volume.isDirectory()||!/^official_\d+$/.test(volume.name))continue;
    const volumePath=path.join(root,volume.name);
    for(const test of fs.readdirSync(volumePath,{withFileTypes:true})){
      const file=path.join(volumePath,test.name,"question.enriched.json");
      if(test.isDirectory()&&/^test_\d+$/.test(test.name)&&fs.existsSync(file))banks.push({rel:`${volume.name}/${test.name}`,file,volume:Number(volume.name.match(/\d+/)[0]),test:Number(test.name.match(/\d+/)[0])});
    }
  }
  return banks.sort((a,b)=>a.volume-b.volume||a.test-b.test);
}

function processBank(bank,options,totals){
  const document=JSON.parse(fs.readFileSync(bank.file,"utf8")); let changed=false;totals.banks++;
  for(const part of document.parts||[])for(const group of part.questions||[]){
    const items=Array.isArray(group.items)&&group.items.length?group.items:[group];
    const units=MATERIAL_PARTS.has(part.part)?[{part:part.part,group,items,target:group,scope:"material",id:group.id}]:items.map(item=>({part:part.part,group,item,items:[item],target:item,scope:"question_context",id:item.id}));
    for(const unit of units){
      totals.units++;
      if(options.validateOnly){const result=validate(unit.target.knowledge_v2,unit);if(result==="missing")totals.missing++;else if(result!=="valid")totals.invalid++;continue}
      if(!options.force&&validate(unit.target.knowledge_v2,unit)==="valid"){totals.skipped++;continue}
      const knowledge=extract(unit);unit.target.knowledge_v2=knowledge;changed=true;totals.written++;
      totals.vocabulary+=knowledge.vocabulary.length;totals.collocations+=knowledge.collocations.length;
      if(!knowledge.vocabulary.length&&!knowledge.collocations.length)totals.empty++;
    }
  }
  if(changed)writeAtomic(bank.file,document);
}

function extract(unit){
  const sources=sourceRecords(unit);
  const select=(lexicon,key)=>lexicon.map(record=>findCandidate(record,sources,key)).filter(Boolean).sort((a,b)=>b.rank-a.rank||a[key].localeCompare(b[key])).slice(0,MAX_PER_KIND).map(({rank,...entry})=>entry);
  return {schema_version:"2.0",source_scope:unit.scope,extraction_basis:"full_exercise",vocabulary:select(VOCABULARY,"term"),collocations:select(COLLOCATIONS,"phrase")};
}

function sourceRecords(unit){
  const records=[];
  // Read a material paragraph as clean evidence lines/sentences rather than as
  // one huge OCR blob.  A single corrupted line therefore cannot contaminate a
  // neighbouring good sentence or make a question option look preferable.
  const add=(field,value)=>{for(const raw of Array.isArray(value)?value:[value])if(typeof raw==="string")for(const text of cleanEvidenceLines(raw))records.push({field,text})};
  if(unit.part===1)add("choice",unit.item.choices);
  else if(unit.part===2){add("question",unit.item.question);add("choice",unit.item.choices)}
  else if(unit.part===5){add("question",unit.item.question);add("choice",unit.item.choices)}
  else {add(unit.part<=4?"transcript":"passage",unit.part<=4?unit.group.transcript:unit.group.passage);for(const item of unit.items){add("question",item.question);add("choice",item.choices)}}
  return records;
}

function cleanEvidenceLines(raw){
  const lines=String(raw).replace(/\r/g,"").split(/\n+/).map(line=>line.replace(/\s+/g," ").trim()).filter(line=>line&&!looksOcr(line));
  const text=lines.join(" ");
  if(!text||looksOcr(text))return [];
  const sentences=text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/).map(line=>line.trim()).filter(line=>line&&!looksOcr(line));
  return sentences.length?sentences:[text];
}

function findCandidate(record,sources,key){
  const needle=record.value.toLowerCase();
  // Full transcript/passage first, then a prompt, finally a choice.  The sort
  // is explicit so later maintenance cannot silently turn a study note back
  // into an answer-option extraction.
  const fieldRank={transcript:0,passage:0,question:1,choice:2};
  for(const source of [...sources].sort((a,b)=>(fieldRank[a.field]??9)-(fieldRank[b.field]??9))){
    const quote=quoteContaining(source.text,needle);
    if(!quote)continue;
    return {[key]:needle,meaning:record.meaning,source_quote:quote,why:record.why,confidence:.96,rank:record.rank};
  }
  return null;
}

function quoteContaining(text,needle){
  const normalized=String(text).replace(/\r/g,"").replace(/\s+/g," ").trim();
  if(looksOcr(normalized)||!isCleanQuote(normalized)||!wholePhrase(normalized,needle))return "";
  // A line is usually the cleanest evidence in the OCR-derived sources.  For
  // long lines, keep a natural sentence; fall back to a short clean line.
  const fragments=normalized.split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/).map(x=>x.trim()).filter(Boolean);
  const selected=fragments.find(fragment=>wholePhrase(fragment,needle)&&!looksOcr(fragment));
  if(selected&&selected.length<=280&&isCleanQuote(selected)&&wordCount(selected)>=3)return selected;
  const index=normalized.toLowerCase().indexOf(needle);
  if(index<0)return "";
  const start=Math.max(0,normalized.lastIndexOf(". ",index)+2,normalized.lastIndexOf("? ",index)+2,normalized.lastIndexOf("! ",index)+2);
  const ends=[normalized.indexOf(". ",index),normalized.indexOf("? ",index),normalized.indexOf("! ",index)].filter(x=>x>=0);
  const end=ends.length?Math.min(...ends)+1:Math.min(normalized.length,index+needle.length+110);
  const quote=normalized.slice(start,end).trim();
  return quote.length>=2&&quote.length<=280&&wordCount(quote)>=3&&!looksOcr(quote)&&isCleanQuote(quote)&&wholePhrase(quote,needle)?quote:"";
}

function isCleanQuote(text){
  if(/(?:--+|[\[\]_\|])/.test(text))return false;
  if((text.match(/\(/g)||[]).length!==(text.match(/\)/g)||[]).length)return false;
  if((text.match(/[“”]/g)||[]).length%2)return false;
  if(/[(:;,\-]\s*$/.test(text)||/\b[A-Za-z]\s*[.!?]?\s*$/.test(text))return false;
  if(/\b(?:nee|ye|th|thi|wee|se|alle|assignme|e-mai)\b/i.test(text))return false;
  return true;
}
function wordCount(text){return String(text).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length||0}

function wholePhrase(text,phrase){
  const escaped=phrase.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`,"i").test(text);
}

function looksOcr(text){
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]|[©®~°@]/.test(text)||/(^|\s)[-–][a-z]/i.test(text)||/\b(?:iu|gam|ew|zw|hd|bp|ae|tc|ot|lerady|figetetetinge|wholed|alamp|acoworker|iwould|assignme|nee|\bye\b|\blt\b)\b/i.test(text)||/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)||/\b\d{2,3}\.\s*[a-z]/i.test(text);
}

function validate(value,unit){
  if(!value)return "missing";
  if(value.schema_version!=="2.0"||value.source_scope!==unit.scope||value.extraction_basis!=="full_exercise"||!Array.isArray(value.vocabulary)||!Array.isArray(value.collocations)||value.vocabulary.length>2||value.collocations.length>2)return "invalid";
  const sources=sourceRecords(unit);
  for(const [key,entries] of [["term",value.vocabulary],["phrase",value.collocations]])for(const item of entries||[]){
    if(!item||typeof item[key]!=="string"||!item.meaning||!item.why||!item.source_quote||wordCount(item.source_quote)<3||!isCleanQuote(item.source_quote)||item.confidence<.78||item.confidence>1||!sources.some(source=>normalize(source.text).includes(normalize(item.source_quote)))||!wholePhrase(item.source_quote,item[key]))return "invalid";
  }
  return "valid";
}
function normalize(value){return String(value).normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase()}
function writeAtomic(file,value){const tmp=`${file}.lexicon-${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2)+"\n");fs.renameSync(tmp,file)}
