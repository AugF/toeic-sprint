import fs from "node:fs";
import path from "node:path";

const sourcePath = process.argv[2];
if (!sourcePath || !path.isAbsolute(sourcePath)) {
  throw new Error("Usage: node knowledge-part6-7.mjs <absolute-path-to-question.json>");
}

const k = (term1, meaning1, term2, meaning2, phrase, phraseMeaning) => ({
  vocabulary: [
    { term: term1, meaning: meaning1 },
    { term: term2, meaning: meaning2 },
  ],
  collocations: [{ phrase, meaning: phraseMeaning }],
});

// Official TOEIC 11, Test 1, Parts 6–7. Entries are question-specific even when
// several questions share a passage, so each review card reinforces the clue or
// business-reading skill used by that particular question.
const knowledgeById = {
  131: k("celebrate", "庆祝；举行庆祝活动", "occasion", "重要时刻；特殊场合", "celebrate an anniversary", "庆祝周年纪念日"),
  132: k("gallery", "画廊；展厅", "handmade", "手工制作的", "visit our gallery", "参观我们的画廊"),
  133: k("purchase", "购买的商品；购买行为", "ship", "运送；发货", "ship to any address", "寄送到任何地址"),
  134: k("convenient", "方便的；便利的", "denomination", "（礼品卡、货币的）面额", "whichever is more convenient", "选择更方便的那一种"),
  135: k("praise", "表扬；称赞", "delivery", "配送；交付", "praise a delivery service", "称赞配送服务"),
  136: k("expectation", "期待；预期", "outstanding", "出色的；杰出的", "exceed expectations", "超出预期"),
  137: k("hallway", "走廊", "staircase", "楼梯间；楼梯", "avoid damaging the walls", "避免损坏墙壁"),
  138: k("historic", "有历史意义的", "preservation", "保护；保存", "a historic building", "一栋有历史意义的建筑"),
  139: k("implement", "实施；启用（系统或政策）", "billing", "计费；账单处理", "implement a billing system", "启用计费系统"),
  140: k("process", "过程；流程", "complete", "完成", "during system setup", "在系统设置期间"),
  141: k("still", "仍然；依旧", "contact", "联系；联络", "still be able to contact", "仍然能够联系"),
  142: k("representative", "客服代表；公司代表", "online chat", "在线聊天功能", "speak directly with a representative", "直接与客服代表交谈"),
  143: k("deal", "交易；协议", "finalize", "最终敲定", "finalize a deal", "敲定一笔交易"),
  144: k("pursue", "寻求；积极争取", "distribution", "分销；经销", "pursue an acquisition", "寻求进行收购"),
  145: k("presence", "业务布局；市场影响力", "need", "需求；需要", "meet customers' needs", "满足客户需求"),
  146: k("transaction", "交易；商业买卖", "analyst", "分析师", "disclose the transaction amount", "披露交易金额"),

  147: k("characteristic", "特征；特点", "texture", "质地；手感", "a characteristic of wool", "羊毛的一项特征"),
  148: k("yarn", "毛线；纱线", "process", "加工；处理", "be used to make products", "被用于制作产品"),
  149: k("exhibitor", "参展商", "assignment", "分配；指定结果", "booth location assignment", "展位位置分配"),
  150: k("representative", "代表；工作人员", "requirement", "要求；必要条件", "maintain a presence at the booth", "确保展位一直有人值守"),
  151: k("accountant", "会计师", "recommendation", "推荐；介绍", "provide a professional recommendation", "提供职业推荐"),
  152: k("expertise", "专业知识；专长", "reliable", "可靠的；值得信赖的", "provide good advice", "提供有用的建议"),
  153: k("apply", "申请；应聘", "position", "职位；岗位", "apply to work at a company", "申请到某公司工作"),
  154: k("employment", "工作；雇用", "conclude", "推断；得出结论", "hold a job in Singapore", "曾在新加坡任职"),
  155: k("release", "发布；公布（报告或产品）", "report", "报告；调研报告", "release a report", "发布一份报告"),
  156: k("financial", "财务的；资金方面的", "fund", "资助；为……提供资金", "provide financial support", "提供资金支持"),
  157: k("waste", "废料；废弃物", "stuffing", "填充物", "use as mattress stuffing", "用作床垫填充物"),
  158: k("subscriber", "订阅者；订户", "intended", "面向的；预定的", "be intended for subscribers", "面向订阅者"),
  159: k("acceptable", "可接受的；符合要求的", "conservation", "自然保护；资源保护", "an acceptable contest subject", "符合比赛要求的主题"),
  160: k("moreover", "此外；而且", "cover", "封面", "appear on the magazine's cover", "刊登在杂志封面上"),
  161: k("prefer", "更喜欢；更倾向于", "consistent", "一致的；统一的", "prefer one program over another", "相比另一个程序更偏好某程序"),
  162: k("migrate", "迁移（数据或系统）", "record", "记录；数据记录", "migrate data from one program to another", "把数据从一个程序迁移到另一个程序"),
  163: k("access", "访问权限；进入", "discontinue", "停止使用；终止提供", "no longer have access to", "不再有权访问"),
  164: k("venue", "活动场地；演出场馆", "upcoming", "即将到来的", "the first venue on a tour", "巡演的首个场地"),
  165: k("album", "音乐专辑", "record", "录制（音乐）", "record and release an album", "录制并发行专辑"),
  166: k("schedule", "安排；排定", "concert", "演唱会；音乐会", "schedule concerts for a band", "为乐队安排演唱会"),
  167: k("perform", "表演；演出", "live", "现场地；以现场方式", "share new songs live", "现场演唱新歌"),
  168: k("item", "项目；清单中的一项", "list", "清单；列表", "add an item to a list", "把一项内容加入清单"),
  169: k("aisle", "（商店内的）过道", "variety", "种类；品种", "pick up food for a meeting", "为会议取购食物"),
  170: k("survey", "调查；问卷调查", "preference", "偏好；选择倾向", "ask coworkers about their preferences", "询问同事的偏好"),
  171: k("imply", "暗示；意味着", "taste", "味道；尝起来", "know what something tastes like", "知道某物是什么味道"),
  172: k("client", "客户；委托人", "machinery", "机械设备（总称）", "keep a production line running", "维持生产线运转"),
  173: k("headquarters", "总部", "service area", "服务区域", "be headquartered in Massachusetts", "总部设在马萨诸塞州"),
  174: k("advertisement", "广告", "service", "服务；业务项目", "offer a range of services", "提供多种服务"),
  175: k("manufacture", "制造；生产", "expertise", "专业知识；专长", "equipment manufactured in several countries", "在多个国家制造的设备"),
  176: k("gratitude", "感谢；感激", "feedback", "反馈；意见", "request customer feedback", "征求客户反馈"),
  177: k("supervisor", "主管；负责人", "customer assistance", "客户协助；客户支持", "supervise a customer service team", "管理客服团队"),
  178: k("impression", "印象；看法", "reaction", "反应；感受", "form an impression of a service", "对一项服务形成印象"),
  179: k("relocate", "调动；迁居至新地点", "insurer", "保险公司；承保人", "relocate to Australia", "迁居或被调往澳大利亚"),
  180: k("coverage", "保险保障范围；保额", "term", "条款；条件", "verify coverage limits", "核实保险保额上限"),
  181: k("declaration", "申报；声明", "prohibited", "违禁的；被禁止的", "clear customs", "通过海关清关"),
  182: k("shipment", "货件；运输", "expedited", "加急的；快速办理的", "arrange expedited delivery", "安排加急配送"),
  183: k("praise", "表扬；赞扬", "action", "行动；处理措施", "praise an employee's actions", "称赞员工采取的行动"),
  184: k("depart", "出发；离开", "destination", "目的地", "leave for the Northwest Territories", "启程前往西北地区"),
  185: k("standard", "标准；水准", "quality", "质量；品质", "meet high quality standards", "达到高质量标准"),
  186: k("organizer", "组织者；主办方人员", "reservation", "预订；预约", "confirm a dinner reservation", "确认晚宴预订"),
  187: k("vegetarian", "素食者；素食的", "accommodate", "容纳；满足特殊需求", "offer vegetarian options", "提供素食选择"),
  188: k("screening", "电影放映；筛选", "venue", "活动场所；会场", "be shown at the same theater", "在同一家电影院放映"),
  189: k("journalist", "记者；新闻工作者", "translator", "翻译人员", "be indicated on a registration form", "在报名表上注明"),
  190: k("filming location", "拍摄地点；取景地", "attend", "参加；出席", "take a tour of filming locations", "参加取景地参观活动"),
  191: k("attachment", "电子邮件附件", "agenda", "议程；日程", "attach a list of presentations", "附上一份演讲主题清单"),
  192: k("orthopedics", "骨科；整形外科", "conference", "会议；行业大会", "work in the health-care field", "从事医疗保健行业"),
  193: k("coordinate", "协调；统筹", "attendance", "出席；参会", "create a sign-up document", "制作报名登记文件"),
  194: k("ligament", "韧带", "injury", "损伤；伤害", "attend a session on ligament injuries", "参加有关韧带损伤的专题讲座"),
  195: k("discount", "折扣；优惠", "expense", "费用；开支", "reserve rooms at a group rate", "以团体优惠价预订房间"),
  196: k("cookbook", "食谱书；烹饪书", "genre", "体裁；类型", "differ from previous books", "与以前的书不同"),
  197: k("debut", "首次亮相的；处女作的", "novel", "小说", "a debut novel", "第一部小说；小说处女作"),
  198: k("photographer", "摄影师", "foreword", "前言；序言", "feature photographs by an artist", "收录某位艺术家拍摄的照片"),
  199: k("proficient", "熟练的；精通的", "technique", "技巧；技术", "be proficient in cooking techniques", "熟练掌握烹饪技巧"),
  200: k("exorbitant", "过高的；贵得离谱的", "price tag", "价格；标价签", "a hefty price tag", "高昂的价格"),
};

const expectedIds = Array.from({ length: 70 }, (_, index) => index + 131);
const mappedIds = Object.keys(knowledgeById).map(Number).sort((a, b) => a - b);
const mapFailures = [];

for (const id of expectedIds) {
  const entry = knowledgeById[id];
  if (!entry) {
    mapFailures.push(`missing knowledge mapping for question ${id}`);
    continue;
  }
  if (!Array.isArray(entry.vocabulary) || entry.vocabulary.length < 2) {
    mapFailures.push(`question ${id} must have at least two vocabulary entries`);
  }
  if (!Array.isArray(entry.collocations) || entry.collocations.length < 1) {
    mapFailures.push(`question ${id} must have at least one collocation entry`);
  }
  for (const vocabulary of entry.vocabulary ?? []) {
    if (!vocabulary.term?.trim() || !vocabulary.meaning?.trim()) {
      mapFailures.push(`question ${id} has an incomplete vocabulary entry`);
    }
  }
  for (const collocation of entry.collocations ?? []) {
    if (!collocation.phrase?.trim() || !collocation.meaning?.trim()) {
      mapFailures.push(`question ${id} has an incomplete collocation entry`);
    }
  }
}

for (const id of mappedIds) {
  if (!expectedIds.includes(id)) mapFailures.push(`unexpected knowledge mapping for question ${id}`);
}

if (mapFailures.length) {
  throw new Error(`Invalid Parts 6–7 knowledge map:\n${mapFailures.join("\n")}`);
}

const data = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const dataFailures = [];
const seenIds = new Set();
let part6Count = 0;
let part7Count = 0;

for (const part of data.parts ?? []) {
  if (part.part !== 6 && part.part !== 7) continue;

  for (const group of part.questions ?? []) {
    for (const item of group.items ?? [group]) {
      const id = Number(item.id);
      const knowledge = knowledgeById[id];
      if (!knowledge) {
        dataFailures.push(`Part ${part.part} question ${item.id} has no knowledge mapping`);
        continue;
      }
      if (seenIds.has(id)) dataFailures.push(`duplicate question ID ${id} in Parts 6–7`);
      seenIds.add(id);
      if (part.part === 6 && (id < 131 || id > 146)) {
        dataFailures.push(`unexpected Part 6 question ID ${id}`);
      }
      if (part.part === 7 && (id < 147 || id > 200)) {
        dataFailures.push(`unexpected Part 7 question ID ${id}`);
      }
    }
  }
}

for (const id of expectedIds) {
  if (!seenIds.has(id)) dataFailures.push(`question ${id} was not found in Parts 6–7`);
}

if (dataFailures.length) {
  throw new Error(`Source bank does not match the Parts 6–7 knowledge map:\n${dataFailures.join("\n")}`);
}

// Mutate only after every map and source-coverage check has passed.
for (const part of data.parts) {
  if (part.part !== 6 && part.part !== 7) continue;
  for (const group of part.questions) {
    for (const item of group.items ?? [group]) {
      item.knowledge_accumulation = knowledgeById[Number(item.id)];
      if (part.part === 6) part6Count += 1;
      else part7Count += 1;
    }
  }
}

fs.writeFileSync(sourcePath, `${JSON.stringify(data, null, 2)}\n`);
console.log(
  `Knowledge accumulation updated: Part 6 ${part6Count} questions, Part 7 ${part7Count} questions, ${part6Count + part7Count} total.`,
);
