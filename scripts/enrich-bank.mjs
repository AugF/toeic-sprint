import fs from "node:fs";

const source=new URL("../../toeic_listening_reading_banks/official_11/test_1/question.json",import.meta.url);
const target=new URL("../public/bank/question.json",import.meta.url);
const data=JSON.parse(fs.readFileSync(source,"utf8"));
const typeOf=(part,q="",topic="")=>{
 const s=(q+" "+topic).toLowerCase();
 if(part===2){if(/where|location|destination/.test(s))return "地点疑问句";if(/when|what time|how long/.test(s))return "时间疑问句";if(/who|whose/.test(s))return "人物疑问句";if(/why/.test(s))return "原因疑问句";if(/how/.test(s))return "方式 / 状态疑问句";if(/do |did |are |is |have |can |could |would |will /.test(s))return "一般疑问句";return "特殊疑问句"}
 if(part===5)return /grammar|agreement|tense|voice|pronoun|preposition|conjunction|clause|participle|主谓|时态|语态|代词|介词|连词|从句|分词|词性/.test(s)?"语法题":"词汇题";
 if(/main|mainly|purpose|most likely|advertised|about|why.*write|where.*take place/.test(s))return "主旨 / 场景题";
 if(/mean by|closest in meaning|word/.test(s))return "词义 / 短语题";
 if(/imply|suggested|inferred/.test(s))return "推断题";
 if(/not mentioned|not stated|not indicated/.test(s))return "否定事实题";
 return "细节题";
};
const evidence=(text="",q="")=>{const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return "根据题干的语法结构、固定搭配及上下文判断。";const words=q.toLowerCase().match(/[a-z]{5,}/g)||[];let n=lines.findIndex(l=>words.some(w=>l.toLowerCase().includes(w)));if(n<0)n=0;return `参考原文第 ${n+1} 段第 1 句：${lines[n]}`};
const zhSummary=(g,part)=>part<=4?`本段听力围绕“${g.topic||"日常商务场景"}”展开。请先听清人物关系和对话目的，再抓取时间、地点、原因、行动等关键信息。`:`本文围绕“${g.topic||"商务与日常信息"}”展开。阅读时先确认文体与写作目的，再定位题干关键词所在句。`;
const part1Translations={
 1:["他正在把纸钉到墙上。","他正在整理桌上的物品。","他正在清空纸盘。","他正在使用一台机器。"],
 2:["一些人正在清洁窗户。","一些人正在登上一辆公共汽车。","一个路标被撞倒了。","一个轮胎被放在路缘旁。"],
 3:["一些男子正站在船上。","一些男子正搬运一捆捆绳索。","一些男子正在修理屋顶。","一些男子正在爬楼梯。"],
 4:["她正弯腰检查汽车轮胎。","她正在铲除路上的积雪。","她正在扫掉汽车上的雪。","她正在调整夹克的兜帽。"],
 5:["一架梯子斜靠在后墙上。","她正在咬一口新鲜番茄。","桌上的番茄正被切进沙拉里。","她正把一个物品扔进编织篮里。"],
 6:["盆栽植物正在被浇水。","一些灯具正在被安装。","盆栽植物陈列在商店门前。","商店的门已经打开了。"],
};
for(const p of data.parts){p.section_type=p.part<=4?"听力":"阅读";for(const g of p.questions){
 g.content_translation ||= zhSummary(g,p.part);
 if(p.part===1){g.transcript_translation ||= part1Translations[g.id].map((x,i)=>`${"ABCD"[i]}. ${x}`).join("\n");g.choice_translations ||= part1Translations[g.id];}
 const items=g.items||[g];
 for(const item of items){item.question_type=typeOf(p.part,item.question||g.question||"",g.topic||"");item.evidence=evidence(g.transcript||g.passage||item.question||g.question||"",item.question||g.question||"");
  item.choice_translations ||= (item.choices||g.choices||[]).map((x,i)=>`${"ABCD"[i]}：${x}`);
  if(p.part===2){item.response_style=/yes|no|do |did |are |is |have |can |could |would |will /i.test(g.question||"")?"可直接回答，也常用补充信息间接回答":"应直接提供疑问词所要求的信息，也要留意自然的间接回答";item.strategy=`先判断为${item.question_type}，锁定问句真正索取的信息；${item.response_style}。排除只重复问句词汇、答非所问或语义冲突的选项。`;}
  else if(p.part===5)item.strategy=`本题属于${item.question_type}。先判断空格在句中的成分，再检查词性、主谓一致、时态语态、固定搭配和句意。`;
  else item.strategy=`本题属于${item.question_type}。先读题干并标出关键词，再回到原文定位同义改写，避免仅凭个别相同单词作答。`;
  item.explanation_structured={answer:item.answer||g.answer,question_type:item.question_type,evidence:item.evidence,strategy:item.strategy,analysis:item.answer_explain||g.answer_explain||""};
 }
 }}
data.schema_version="2.0";data.updated_for="grouped_exam_practice";
fs.writeFileSync(source,JSON.stringify(data,null,2)+"\n");fs.writeFileSync(target,JSON.stringify(data,null,2)+"\n");
console.log("enriched",data.parts.reduce((n,p)=>n+p.questions.reduce((m,g)=>m+(g.items?.length||1),0),0),"questions");
