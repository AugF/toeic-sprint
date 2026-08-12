import fs from "node:fs";
import path from "node:path";

const sourcePath = process.argv[2];
if (!sourcePath || !path.isAbsolute(sourcePath)) {
  throw new Error("Usage: node knowledge-part5.mjs <absolute-path-to-question.json>");
}

const k = (term1, meaning1, term2, meaning2, phrase, phraseMeaning) => ({
  vocabulary: [
    { term: term1, meaning: meaning1 },
    { term: term2, meaning: meaning2 },
  ],
  collocations: [{ phrase, meaning: phraseMeaning }],
});

// Official TOEIC 11, Test 1, Part 5. Each entry reinforces the tested answer,
// a useful word family, or a high-frequency business-English collocation.
const knowledgeById = {
  101: k(
    "plan",
    "计划；打算；第三人称单数为 plans",
    "restaurant",
    "餐馆；餐厅",
    "plan to do something",
    "计划做某事",
  ),
  102: k(
    "deliver",
    "递送；交付；名词为 delivery（配送）",
    "purchase",
    "购买；购得的物品",
    "deliver items to someone's home",
    "把商品送到某人家中",
  ),
  103: k(
    "difference",
    "差异；不同（名词）；动词为 differ，形容词为 different",
    "model",
    "型号；款式；模型",
    "price difference",
    "价格差异",
  ),
  104: k(
    "rental",
    "租赁；出租服务",
    "upcoming",
    "即将到来的",
    "be needed for something",
    "为某事所需要",
  ),
  105: k(
    "handle",
    "处理；负责；应对",
    "approval",
    "批准；许可；动词为 approve",
    "handle purchase orders oneself",
    "亲自处理采购订单",
  ),
  106: k(
    "patience",
    "耐心；形容词为 patient",
    "restore",
    "恢复；修复；使复原",
    "restore the connection",
    "恢复连接",
  ),
  107: k(
    "actively",
    "积极地；主动地；形容词为 active",
    "recruit",
    "招聘；招募；名词为 recruitment",
    "actively recruit team members",
    "积极招聘团队成员",
  ),
  108: k(
    "president",
    "总裁；负责人；会长",
    "machinery",
    "机械；机器设备（不可数名词）",
    "It has been + time + since ...",
    "自从……以来已经过了多长时间",
  ),
  109: k(
    "profitable",
    "盈利的；有利润的；名词为 profit",
    "operating cost",
    "运营成本",
    "keep operating costs low",
    "把运营成本维持在较低水平",
  ),
  110: k(
    "appointment",
    "预约；约会；动词为 appoint（任命）",
    "confirm",
    "确认；证实；名词为 confirmation",
    "confirm an appointment",
    "确认预约",
  ),
  111: k(
    "efficient",
    "高效的；名词为 efficiency，副词为 efficiently",
    "realty",
    "房地产；不动产",
    "the most efficient service",
    "最高效的服务",
  ),
  112: k(
    "constructive",
    "建设性的；有助益的",
    "effective",
    "有效的；起作用的；副词为 effectively",
    "constructive disagreement",
    "建设性的意见分歧",
  ),
  113: k(
    "permission",
    "许可；准许；动词为 permit",
    "manager",
    "经理；管理者",
    "as long as + clause",
    "只要……（引导条件状语从句）",
  ),
  114: k(
    "committed",
    "尽心尽力的；坚定投入的；动词为 commit",
    "affordable",
    "价格合理的；负担得起的",
    "be committed to doing something",
    "致力于做某事（to 为介词）",
  ),
  115: k(
    "continue",
    "继续；持续；名词为 continuation",
    "legal department",
    "法务部门",
    "continue as head of a department",
    "继续担任部门负责人",
  ),
  116: k(
    "fossil",
    "化石",
    "collection",
    "收藏品；一批物品；收集",
    "from A until B",
    "从 A 持续到 B",
  ),
  117: k(
    "frequently",
    "频繁地；经常；形容词为 frequent，名词为 frequency",
    "editorial",
    "编辑的；社论的",
    "order extra supplies",
    "额外订购用品",
  ),
  118: k(
    "archive",
    "档案；档案库；常用复数 archives",
    "missing",
    "丢失的；找不到的",
    "somewhere in the archives",
    "档案库中的某处",
  ),
  119: k(
    "breach",
    "破坏；违背；（安全）漏洞或泄露事件",
    "notify",
    "通知；告知；名词为 notification",
    "a breach of data security",
    "数据安全漏洞；数据泄露事件",
  ),
  120: k(
    "assembly",
    "组装；集合；动词为 assemble",
    "clearly",
    "清楚地；明确地；形容词为 clear",
    "write instructions clearly",
    "把说明写得清楚明白",
  ),
  121: k(
    "enthusiasm",
    "热情；浓厚兴趣；形容词为 enthusiastic",
    "investor",
    "投资者；动词为 invest，名词 investment 指投资",
    "enthusiasm for something",
    "对某事物的热情",
  ),
  122: k(
    "withstand",
    "经受住；承受（过去式、过去分词均为 withstood）",
    "extremely",
    "极其；非常；形容词为 extreme",
    "withstand extremely cold temperatures",
    "经受住极低的温度",
  ),
  123: k(
    "schedule",
    "安排；预定；也可作名词表示日程",
    "examination",
    "检查；考试；动词为 examine",
    "when doing something",
    "当做某事时（状语从句的省略形式）",
  ),
  124: k(
    "surplus",
    "剩余；过剩；盈余",
    "relocation",
    "搬迁；调动；动词为 relocate",
    "a surplus of something",
    "某物的过剩量；有多余的某物",
  ),
  125: k(
    "countless",
    "无数的；数不清的",
    "participate",
    "参加；参与；名词为 participation",
    "participate in an interview",
    "参加面试",
  ),
  126: k(
    "prototype",
    "原型；样品；试制品",
    "undergo",
    "经历；接受（测试、治疗等）；过去式为 underwent",
    "both of the prototypes",
    "两个原型（样品）都",
  ),
  127: k(
    "promote",
    "晋升；推广；名词为 promotion",
    "capacity",
    "职位；身份；能力；容量",
    "be promoted to director",
    "被晋升为主管",
  ),
  128: k(
    "visualize",
    "设想；使形象化；名词为 visualization",
    "rendering",
    "效果图；渲染图；描绘",
    "help someone visualize a project",
    "帮助某人设想项目完成后的样子",
  ),
  129: k(
    "luxurious",
    "奢华的；华贵的；名词为 luxury",
    "import",
    "进口；引进；名词重音通常在前，动词重音通常在后",
    "import something from a country",
    "从某国进口某物",
  ),
  130: k(
    "revenue",
    "收入；收益；营业收入",
    "uncertain",
    "不确定的；无把握的；反义词为 certain",
    "future prospects are uncertain",
    "未来前景不明朗",
  ),
};

const expectedIds = Array.from({ length: 30 }, (_, index) => index + 101);
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
  throw new Error(`Invalid Part 5 knowledge map:\n${mapFailures.join("\n")}`);
}

const data = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (!Array.isArray(data.parts)) {
  throw new Error("Source bank must contain a parts array");
}

const untouchedPartsBefore = JSON.stringify(data.parts.filter((part) => part.part !== 5));
const dataFailures = [];
const seenIds = new Set();
let part5Count = 0;

for (const part of data.parts) {
  if (part.part !== 5) continue;
  for (const group of part.questions ?? []) {
    for (const item of group.items ?? [group]) {
      const id = Number(item.id);
      if (!knowledgeById[id]) {
        dataFailures.push(`Part 5 question ${item.id} has no knowledge mapping`);
        continue;
      }
      if (seenIds.has(id)) dataFailures.push(`duplicate Part 5 question ID ${id}`);
      seenIds.add(id);
    }
  }
}

for (const id of expectedIds) {
  if (!seenIds.has(id)) dataFailures.push(`Part 5 question ${id} was not found`);
}

if (dataFailures.length) {
  throw new Error(`Source bank does not match the Part 5 knowledge map:\n${dataFailures.join("\n")}`);
}

// Mutate only after both the map and the source-bank coverage have been checked.
for (const part of data.parts) {
  if (part.part !== 5) continue;
  for (const group of part.questions) {
    for (const item of group.items ?? [group]) {
      item.knowledge_accumulation = knowledgeById[Number(item.id)];
      part5Count += 1;
    }
  }
}

const untouchedPartsAfter = JSON.stringify(data.parts.filter((part) => part.part !== 5));
if (untouchedPartsAfter !== untouchedPartsBefore) {
  throw new Error("Safety check failed: a part other than Part 5 was modified");
}

fs.writeFileSync(sourcePath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Knowledge accumulation updated: Part 5 ${part5Count} questions.`);
