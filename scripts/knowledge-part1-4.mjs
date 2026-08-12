#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];

if (!inputPath || !path.isAbsolute(inputPath)) {
  throw new Error(
    "Usage: node knowledge-part1-4.mjs <absolute-path-to-question.json>",
  );
}

const knowledge = (vocabulary, collocations) => ({
  vocabulary: vocabulary.map(([term, meaning]) => ({ term, meaning })),
  collocations: collocations.map(([phrase, meaning]) => ({ phrase, meaning })),
});

// Official TOEIC Listening & Reading 11, Test 1, Parts 1–4.
// Each entry is tied to the transcript, prompt, choices, or graphic inference for
// that question. Question IDs in this test are globally unique.
const entries = {
  // Part 1: Photographs
  1: knowledge(
    [
      ["machine", "机器；此处指复印机一类的办公设备"],
      ["paper tray", "送纸盘；纸盒"],
    ],
    [["use a machine", "操作机器；使用设备"]],
  ),
  2: knowledge(
    [
      ["board", "登上（公共汽车、飞机等）"],
      ["curb", "路缘；马路牙子"],
    ],
    [["board a bus", "登上公共汽车"]],
  ),
  3: knowledge(
    [
      ["boat", "小船；船只"],
      ["bundle", "捆；束"],
    ],
    [["stand on a boat", "站在船上"]],
  ),
  4: knowledge(
    [
      ["shovel", "用铲子铲；铁铲"],
      ["brush", "刷去；掸掉"],
    ],
    [["brush snow off a car", "把汽车上的雪扫掉"]],
  ),
  5: knowledge(
    [
      ["ladder", "梯子"],
      ["woven", "编织的"],
    ],
    [["lean against a wall", "斜靠在墙上"]],
  ),
  6: knowledge(
    [
      ["potted plant", "盆栽植物"],
      ["light fixture", "灯具；照明装置"],
    ],
    [["be displayed in front of a store", "陈列在商店门前"]],
  ),

  // Part 2: Question–Response
  7: knowledge(
    [
      ["destination", "目的地"],
      ["final", "最终的；最后的"],
    ],
    [["final destination", "最终目的地"]],
  ),
  8: knowledge(
    [
      ["usual", "通常使用的；惯常的"],
      ["locked", "锁着的"],
    ],
    [["move a meeting to the third floor", "把会议改到三楼"]],
  ),
  9: knowledge(
    [
      ["tire", "轮胎"],
      ["registered", "已登记的；已注册的"],
    ],
    [["buy new tires", "购买新轮胎"]],
  ),
  10: knowledge(
    [
      ["electrician", "电工"],
      ["safety process", "安全操作流程"],
    ],
    [["recommend hiring an electrician", "建议雇用一名电工"]],
  ),
  11: knowledge(
    [
      ["inspection", "检查；检验"],
      ["laboratory", "实验室（常缩写为 lab）"],
    ],
    [["start an inspection", "开始检查"]],
  ),
  12: knowledge(
    [
      ["factory", "工厂"],
      ["out of date", "过时的；信息已不准确的"],
    ],
    [["leave for the factory", "动身前往工厂"]],
  ),
  13: knowledge(
    [
      ["arrive", "到达"],
      ["business trip", "出差；商务旅行"],
    ],
    [["arrive by seven o'clock", "最迟七点到达"]],
  ),
  14: knowledge(
    [
      ["attend", "参加；出席"],
      ["training session", "培训课；培训场次"],
    ],
    [["plan to attend", "打算参加"]],
  ),
  15: knowledge(
    [
      ["refund", "退款；退还款项"],
      ["available", "有空的；可以提供帮助的"],
    ],
    [["get a refund", "获得退款；办理退款"]],
  ),
  16: knowledge(
    [
      ["report", "报告"],
      ["data", "数据；资料"],
    ],
    [["be missing some data", "缺少一些数据"]],
  ),
  17: knowledge(
    [
      ["repair shop", "修理店；维修厂"],
      ["fill the tank", "给油箱加满油"],
    ],
    [["have a car fixed", "请人把汽车修好"]],
  ),
  18: knowledge(
    [
      ["theater", "剧院"],
      ["play", "戏剧；剧本"],
    ],
    [["be on the left", "位于左侧"]],
  ),
  19: knowledge(
    [
      ["supply order", "用品订单"],
      ["ready", "准备好的；可供使用的"],
    ],
    [["be ready this afternoon", "今天下午准备好"]],
  ),
  20: knowledge(
    [
      ["coffeemaker", "咖啡机"],
      ["bottom", "底部；最下方"],
    ],
    [["start a coffeemaker", "启动咖啡机"]],
  ),
  21: knowledge(
    [
      ["organize", "整理；归档"],
      ["filing cabinet", "文件柜"],
    ],
    [["organize the files by oneself", "独自整理文件"]],
  ),
  22: knowledge(
    [
      ["client", "客户；委托人"],
      ["contract", "合同；协议"],
    ],
    [["have a report sent", "让人把报告寄出"]],
  ),
  23: knowledge(
    [
      ["invitation", "邀请函；请柬"],
      ["banquet", "宴会；正式宴席"],
    ],
    [["the date on the invitation", "邀请函上标注的日期"]],
  ),
  24: knowledge(
    [
      ["presence", "影响力；存在感"],
      ["social media", "社交媒体"],
    ],
    [["increase an online presence", "提升网络影响力"]],
  ),
  25: knowledge(
    [
      ["inspector", "检查员；检验员"],
      ["revised", "修订后的"],
    ],
    [["do the scheduling", "负责安排日程"]],
  ),
  26: knowledge(
    [
      ["lawyer", "律师"],
      ["agreement", "协议；合同"],
    ],
    [["provide a paper copy", "提供纸质副本"]],
  ),
  27: knowledge(
    [
      ["restaurant", "餐厅"],
      ["avenue", "大街；林荫大道"],
    ],
    [["open on Fifth Avenue", "在第五大道开业"]],
  ),
  28: knowledge(
    [
      ["satisfied", "满意的"],
      ["renew", "续签；更新"],
    ],
    [["renew a contract", "续签合同"]],
  ),
  29: knowledge(
    [
      ["accounting department", "会计部"],
      ["monthly", "每月一次地；每月的"],
    ],
    [["send out weekly reports", "每周发出报告"]],
  ),
  30: knowledge(
    [
      ["mandatory", "强制性的；必须参加的"],
      ["agenda", "议程；日程表"],
    ],
    [["attend a mandatory training session", "参加必修培训课"]],
  ),
  31: knowledge(
    [
      ["production", "生产；产量"],
      ["outdoor furniture", "户外家具"],
    ],
    [["be behind schedule", "落后于进度；延期"]],
  ),

  // Part 3: Conversations
  32: knowledge(
    [
      ["server", "餐厅服务员"],
      ["menu", "菜单"],
    ],
    [["be ready to order", "准备好点餐"]],
  ),
  33: knowledge(
    [
      ["delay", "延误；耽搁"],
      ["repave", "重新铺设（路面）"],
    ],
    [["road construction", "道路施工"]],
  ),
  34: knowledge(
    [
      ["unavailable", "无法供应的；不可用的"],
      ["daily special", "每日特餐；当日特色菜"],
    ],
    [["be offered only on weekends", "只在周末供应"]],
  ),
  35: knowledge(
    [
      ["proofread", "校对"],
      ["newsletter", "通讯；简报"],
    ],
    [["prepare a company newsletter", "准备公司通讯"]],
  ),
  36: knowledge(
    [
      ["inaccurate", "不准确的"],
      ["anniversary", "周年纪念日"],
    ],
    [["catch an error", "发现错误"]],
  ),
  37: knowledge(
    [
      ["translator", "译员；翻译人员"],
      ["submit", "提交"],
    ],
    [["submit a translation request", "提交翻译申请"]],
  ),
  38: knowledge(
    [
      ["oil change", "更换机油"],
      ["brake pad", "刹车片"],
    ],
    [["have an appointment for an oil change", "预约了更换机油"]],
  ),
  39: knowledge(
    [
      ["specialist", "专业人员；专门技师"],
      ["employee", "员工"],
    ],
    [["have a lot of work", "工作很多；十分忙碌"]],
  ),
  40: knowledge(
    [
      ["password", "密码"],
      ["wireless network", "无线网络"],
    ],
    [["be posted on the wall", "张贴在墙上"]],
  ),
  41: knowledge(
    [
      ["packaging", "包装；包装材料"],
      ["biscuit", "饼干"],
    ],
    [["new product packaging", "新产品包装"]],
  ),
  42: knowledge(
    [
      ["fresh", "新鲜的"],
      ["shelf life", "保质期；货架期"],
    ],
    [["keep a product fresh", "使产品保持新鲜"]],
  ),
  43: knowledge(
    [
      ["investor", "投资者"],
      ["support", "支持；资助"],
    ],
    [["commit to continuing support", "承诺继续提供支持"]],
  ),
  44: knowledge(
    [
      ["unavailable", "无法到场的；没有空的"],
      ["sick", "生病的；身体不适的"],
    ],
    [["cover for a colleague", "替同事代班"]],
  ),
  45: knowledge(
    [
      ["photographer", "摄影师"],
      ["portrait", "肖像照；人像"],
    ],
    [["photograph a corporate event", "拍摄企业活动"]],
  ),
  46: knowledge(
    [
      ["formal", "正式的；礼仪性的"],
      ["dress code", "着装要求"],
    ],
    [["wear a suit", "穿西装"]],
  ),
  47: knowledge(
    [
      ["board of directors", "董事会"],
      ["staff member", "员工；职员"],
    ],
    [["hire more staff", "招聘更多员工"]],
  ),
  48: knowledge(
    [
      ["logo", "标志；徽标"],
      ["art department", "美术部；设计部门"],
    ],
    [["receive some logo designs", "收到几款标志设计"]],
  ),
  49: knowledge(
    [
      ["decline", "婉拒；谢绝"],
      ["invitation", "邀请"],
    ],
    [["go to another meeting", "去参加另一场会议"]],
  ),
  50: knowledge(
    [
      ["apartment", "公寓；套房"],
      ["houseplant", "室内盆栽植物"],
    ],
    [["move into a new apartment", "搬进一套新公寓"]],
  ),
  51: knowledge(
    [
      ["flowerpot", "花盆"],
      ["replant", "移栽；换盆"],
    ],
    [["replant it in a larger pot", "把它移栽到更大的花盆里"]],
  ),
  52: knowledge(
    [
      ["workshop", "专题讲习班；工作坊"],
      ["indoor", "室内的"],
    ],
    [["attend a workshop", "参加工作坊"]],
  ),
  53: knowledge(
    [
      ["financial planner", "理财规划师"],
      ["investment", "投资；投资项目"],
    ],
    [["work in finance", "从事金融行业"]],
  ),
  54: knowledge(
    [
      ["volunteer", "自愿参加；志愿者"],
      ["advise", "向……提供建议"],
    ],
    [["advise community members", "为社区居民提供建议"]],
  ),
  55: knowledge(
    [
      ["session", "场次；时段"],
      ["commitment", "已安排的事务；必须履行的约定"],
    ],
    [["sign up for a morning session", "报名参加上午场"]],
  ),
  56: knowledge(
    [
      ["assistant", "助理；助手"],
      ["farm", "农场"],
    ],
    [["help run a farm", "协助经营农场"]],
  ),
  57: knowledge(
    [
      ["qualification", "资历；资格条件"],
      ["experience", "经验；经历"],
    ],
    [["have experience growing vegetables", "有种植蔬菜的经验"]],
  ),
  58: knowledge(
    [
      ["training", "培训"],
      ["spreadsheet", "电子表格"],
    ],
    [["provide on-the-job training", "提供在职培训"]],
  ),
  59: knowledge(
    [
      ["quarterly", "每季度的"],
      ["organize", "组织；筹办"],
    ],
    [["organize a managers' meeting", "组织经理会议"]],
  ),
  60: knowledge(
    [
      ["nearby", "在附近；附近的"],
      ["available", "有空位的；可预订的"],
    ],
    [["look into a restaurant", "了解并考虑一家餐厅"]],
  ),
  61: knowledge(
    [
      ["print shop", "印刷店"],
      ["program", "会议手册；活动安排表"],
    ],
    [["send an updated schedule", "发送更新后的日程表"]],
  ),
  62: knowledge(
    [
      ["begin", "开始；着手"],
      ["new job", "新工作；新职位"],
    ],
    [["start a new job", "开始一份新工作；入职"]],
  ),
  63: knowledge(
    [
      ["material", "面料；材料"],
      ["quality", "质量；品质"],
    ],
    [["like the fabric of a shirt", "喜欢衬衫的面料"]],
  ),
  64: knowledge(
    [
      ["discount", "折扣"],
      ["promotion", "促销活动"],
    ],
    [["run a promotion on men's shirts", "开展男士衬衫促销"]],
  ),
  65: knowledge(
    [
      ["landscape designer", "景观设计师"],
      ["public park", "公共公园"],
    ],
    [["design a public park", "设计公共公园"]],
  ),
  66: knowledge(
    [
      ["pond", "池塘"],
      ["fountain", "喷泉"],
    ],
    [["add a fountain to the pond", "在池塘中加建喷泉"]],
  ),
  67: knowledge(
    [
      ["supplier", "供应商"],
      ["estimate", "费用估算；报价"],
    ],
    [["get estimates for materials", "获取材料报价"]],
  ),
  68: knowledge(
    [
      ["salary increase", "加薪；工资上调"],
      ["roofing", "屋面材料；屋面工程"],
    ],
    [["receive a pay raise", "获得加薪"]],
  ),
  69: knowledge(
    [
      ["crew", "施工队；工作班组"],
      ["project", "工程；项目"],
    ],
    [["begin around the end of the month", "大约在月底开工"]],
  ),
  70: knowledge(
    [
      ["maintenance", "维护；保养"],
      ["clay", "黏土；陶土（此处指陶土屋面材料）"],
    ],
    [["require little maintenance", "几乎不需要维护"]],
  ),

  // Part 4: Talks
  71: knowledge(
    [
      ["belongings", "个人物品；随身财物"],
      ["moving truck", "搬家卡车"],
    ],
    [["pack up all your belongings", "打包全部个人物品"]],
  ),
  72: knowledge(
    [
      ["reliable", "可靠的；值得信赖的"],
      ["experience", "经验；从业经历"],
    ],
    [["be proud of ten years of experience", "为十年从业经验感到自豪"]],
  ),
  73: knowledge(
    [
      ["waive", "免除；放弃收取"],
      ["supply", "用品；物资"],
    ],
    [["waive the cost of supplies", "免收用品费用"]],
  ),
  74: knowledge(
    [
      ["publication", "出版物；著作"],
      ["historian", "历史学家"],
    ],
    [["give a presentation about a publication", "就一部著作作介绍"]],
  ),
  75: knowledge(
    [
      ["pottery", "陶器；制陶业"],
      ["tableware", "餐具"],
    ],
    [["pottery manufacturing", "陶器制造业"]],
  ),
  76: knowledge(
    [
      ["antique", "古董；古老而珍贵的"],
      ["podium", "讲台"],
    ],
    [["take a closer look", "走近仔细观看"]],
  ),
  77: knowledge(
    [
      ["software development", "软件开发"],
      ["keynote speech", "主题演讲"],
    ],
    [["attend an annual conference", "参加年度大会"]],
  ),
  78: knowledge(
    [
      ["launch", "发布；推出（产品）"],
      ["user", "用户"],
    ],
    [["be launched six months ago", "于六个月前发布"]],
  ),
  79: knowledge(
    [
      ["paper-free", "无纸化的"],
      ["QR code", "二维码"],
    ],
    [["access the schedule with a QR code", "通过二维码查看日程"]],
  ),
  80: knowledge(
    [
      ["chief operating officer", "首席运营官"],
      ["consolidate", "合并；整合"],
    ],
    [["look for ways to reduce costs", "寻找降低成本的方法"]],
  ),
  81: knowledge(
    [
      ["location", "办公地点；场所"],
      ["sell", "出售"],
    ],
    [["consolidate two locations into one", "把两个办公地点整合为一个"]],
  ),
  82: knowledge(
    [
      ["hybrid", "混合模式的；线上线下结合的"],
      ["productivity", "生产效率；工作效率"],
    ],
    [["discuss a schedule with a manager", "与经理讨论工作安排"]],
  ),
  83: knowledge(
    [
      ["clearance", "清仓促销"],
      ["sleeping bag", "睡袋"],
    ],
    [["camping supplies", "露营用品"]],
  ),
  84: knowledge(
    [
      ["proceeds", "销售收入；收益"],
      ["nature center", "自然中心"],
    ],
    [["a portion of the proceeds", "部分销售收入"]],
  ),
  85: knowledge(
    [
      ["renovation", "翻修；整修"],
      ["exclusively", "仅仅；专门地"],
    ],
    [["be closed for renovations", "因翻修而暂停营业"]],
  ),
  86: knowledge(
    [
      ["forklift", "叉车"],
      ["certified", "持证的；经过认证的"],
    ],
    [["certified forklift operator", "持证叉车操作员"]],
  ),
  87: knowledge(
    [
      ["shift", "轮班；班次"],
      ["inspection", "检查；检验"],
    ],
    [["at the beginning of every shift", "在每个班次开始时"]],
  ),
  88: knowledge(
    [
      ["logbook", "日志；记录簿"],
      ["malfunction", "机械故障；失灵"],
    ],
    [["document a mechanical issue", "记录机械故障"]],
  ),
  89: knowledge(
    [
      ["architect", "建筑师"],
      ["renovate", "翻修；整修"],
    ],
    [["renovate the city hall", "翻修市政厅"]],
  ),
  90: knowledge(
    [
      ["dedication", "投入；奉献精神"],
      ["preparation", "准备工作"],
    ],
    [["pay attention to detail", "注重细节"]],
  ),
  91: knowledge(
    [
      ["slide", "幻灯片"],
      ["document", "用文字或照片记录"],
    ],
    [["look at before-and-after slides", "观看前后对比幻灯片"]],
  ),
  92: knowledge(
    [
      ["recipe", "食谱；烹饪方法"],
      ["baking", "烘焙"],
    ],
    [["a cake-designing lesson", "蛋糕装饰课程"]],
  ),
  93: knowledge(
    [
      ["newsletter", "电子简报；通讯"],
      ["inbox", "电子邮箱收件箱"],
    ],
    [["sign up for a newsletter", "订阅电子简报"]],
  ),
  94: knowledge(
    [
      ["publish", "出版；发表"],
      ["competition", "比赛；竞赛"],
    ],
    [["publish one's first book", "出版个人第一本书"]],
  ),
  95: knowledge(
    [
      ["agency", "代理公司；经销机构"],
      ["industry award", "行业奖项"],
    ],
    [["win an industry award", "获得行业奖项"]],
  ),
  96: knowledge(
    [
      ["retirement", "退休；退休生活"],
      ["insight", "见解；洞察力"],
    ],
    [["embark on one's retirement", "开始退休生活"]],
  ),
  97: knowledge(
    [
      ["expertise", "专业知识；专长"],
      ["account", "客户；客户项目"],
    ],
    [["be assigned to an additional team", "被分派到另一个团队"]],
  ),
  98: knowledge(
    [
      ["championship", "锦标赛；冠军赛"],
      ["hometown", "家乡的；本地的"],
    ],
    [["play in a championship game", "参加冠军赛"]],
  ),
  99: knowledge(
    [
      ["attendee", "出席者；到场观众"],
      ["seat", "座位；座位号"],
    ],
    [["be seated in a section", "坐在某个区域"]],
  ),
  100: knowledge(
    [
      ["fireworks", "烟花"],
      ["display", "表演；展示"],
    ],
    [["stay after the game", "赛后留下来"]],
  ),
};

const expectedIds = new Set(Array.from({ length: 100 }, (_, index) => index + 1));
const mappedIds = new Set(Object.keys(entries).map(Number));
const mapFailures = [];

for (const id of expectedIds) {
  if (!mappedIds.has(id)) mapFailures.push(`missing knowledge entry for q${id}`);
}
for (const id of mappedIds) {
  if (!expectedIds.has(id)) mapFailures.push(`unexpected knowledge entry for q${id}`);
}

if (mapFailures.length) {
  throw new Error(`Knowledge map is incomplete:\n${mapFailures.join("\n")}`);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const seenIds = new Set();
const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
const failures = [];

for (const part of data.parts ?? []) {
  if (![1, 2, 3, 4].includes(part.part)) continue;

  for (const group of part.questions ?? []) {
    const items = part.part <= 2 ? [group] : group.items ?? [];

    if (part.part >= 3 && items.length === 0) {
      failures.push(`Part ${part.part} group ${group.id} has no items`);
    }

    for (const item of items) {
      const id = Number(item.id);
      const entry = entries[id];

      if (!entry) {
        failures.push(`no mapped knowledge for Part ${part.part} q${item.id}`);
        continue;
      }
      if (seenIds.has(id)) {
        failures.push(`duplicate listening question ID q${id}`);
        continue;
      }
      if (
        entry.vocabulary.length < 2 ||
        entry.collocations.length < 1 ||
        [...entry.vocabulary, ...entry.collocations].some(
          (item) => !item.meaning || !(item.term || item.phrase),
        )
      ) {
        failures.push(`invalid knowledge shape for q${id}`);
        continue;
      }

      item.knowledge_accumulation = entry;
      seenIds.add(id);
      counts[part.part] += 1;
    }
  }
}

for (const id of expectedIds) {
  if (!seenIds.has(id)) failures.push(`question q${id} was not found in Parts 1–4`);
}

const expectedCounts = { 1: 6, 2: 25, 3: 39, 4: 30 };
for (const part of [1, 2, 3, 4]) {
  if (counts[part] !== expectedCounts[part]) {
    failures.push(
      `Part ${part} count mismatch: expected ${expectedCounts[part]}, found ${counts[part]}`,
    );
  }
}

if (failures.length) {
  throw new Error(`Part 1–4 knowledge update failed:\n${failures.join("\n")}`);
}

fs.writeFileSync(inputPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(
  `Knowledge added to 100 questions (Part 1: ${counts[1]}, Part 2: ${counts[2]}, Part 3: ${counts[3]}, Part 4: ${counts[4]}).`,
);
