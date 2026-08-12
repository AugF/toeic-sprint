import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultBankPath = fileURLToPath(
  new URL(
    "../../toeic_listening_reading_banks/official_11/test_1/question.json",
    import.meta.url,
  ),
);

const bankPath = path.resolve(process.argv[2] || defaultBankPath);

const translations = {
  101: {
    question_translation:
      "星光面馆 ---- 于明年初在北美开设其第一家餐厅。",
    choice_translations: [
      "A：计划（动词原形）",
      "B：计划（第三人称单数形式）",
      "C：规划者；策划人（名词）",
      "D：计划；正在计划（名词或现在分词）",
    ],
    grammar_point:
      "主谓一致：主语 Starlight Noodle House 是第三人称单数，一般现在时的谓语动词要用 plans。",
  },
  102: {
    question_translation:
      "只需支付少量费用，马文精品家具公司便会在购买后两天内将商品 ---- 到顾客家中。",
    choice_translations: [
      "A：递送；运送",
      "B：出售",
      "C：报告",
      "D：花费；度过",
    ],
    grammar_point:
      "动词词义与搭配：deliver items to someone's home 表示“把商品送到某人家中”；will 后接动词原形。",
  },
  103: {
    question_translation: "Kalteco 的三款冰箱型号之间没有价格 ----。",
    choice_translations: [
      "A：不同；有差异（动词）",
      "B：不同的（形容词）",
      "C：差异；不同（名词）",
      "D：不同地（副词）",
    ],
    grammar_point:
      "词性辨析：no 是限定词，后面需要名词；price difference 表示“价格差异”。",
  },
  104: {
    question_translation:
      "麦卡尔维租赁公司将提供即将举行的节庆活动 ---- 所需的帐篷和座椅。",
    choice_translations: [
      "A：反对；倚靠",
      "B：在……附近",
      "C：进入；到……里面",
      "D：为；给；用于",
    ],
    grammar_point:
      "介词搭配：be needed for 表示“为……所需”；for 在这里说明帐篷和座椅的用途。",
  },
  105: {
    question_translation:
      "除非需要特别批准，否则所有采购订单都由索尔瓦先生 ---- 处理。",
    choice_translations: [
      "A：他（主格）",
      "B：他（宾格）",
      "C：他的（形容词性物主代词）",
      "D：他自己；亲自（反身代词）",
    ],
    grammar_point:
      "反身代词的强调用法：himself 与主语 Mr. Sorva 呼应，放在句末表示“由他亲自处理”。",
  },
  106: {
    question_translation:
      "---- 我们的技术团队努力恢复连接，感谢您的耐心等待。",
    choice_translations: [
      "A：如果",
      "B：当……时；在……期间",
      "C：是否；不论",
      "D：但是",
    ],
    grammar_point:
      "时间状语从句：while 引导两个动作同时发生，表示“在技术团队抢修期间”。",
  },
  107: {
    question_translation:
      "戴维森航空电子公司的销售部门正在 ---- 招聘更多团队成员。",
    choice_translations: [
      "A：积极地；主动地（副词）",
      "B：积极的；活跃的（形容词）",
      "C：启动；激活（动词）",
      "D：活动（名词）",
    ],
    grammar_point:
      "词性辨析：空格修饰现在分词 recruiting，需要使用副词 actively。",
  },
  108: {
    question_translation:
      "---- 佩恩先生出任桑顿机械公司总裁，至今已经六个月了。",
    choice_translations: [
      "A：自从……以来",
      "B：从；来自",
      "C：在……的地方",
      "D：在两者之间",
    ],
    grammar_point:
      "时间句型：It has been + 一段时间 + since + 一般过去时，表示“自从……以来已经多久”。",
  },
  109: {
    question_translation:
      "该公司能保持盈利，---- 是因为将运营成本控制在较低水平。",
    choice_translations: [
      "A：不久；很快",
      "B：高度地；非常",
      "C：主要地",
      "D：大大地；非常",
    ],
    grammar_point:
      "副词词义：mainly by 表示“主要通过……方式”，说明公司保持盈利的主要手段。",
  },
  110: {
    question_translation:
      "Elise 沙龙的顾客会收到短信，要求他们确认自己的 ----。",
    choice_translations: [
      "A：任命；指定（动词）",
      "B：被任命的；约定的（形容词或过去分词）",
      "C：任命；正在指定（动名词或现在分词）",
      "D：预约（复数名词）",
    ],
    grammar_point:
      "词性与单复数：形容词性物主代词 their 后接名词；复数顾客分别确认各自的预约，因此用 appointments。",
  },
  111: {
    question_translation:
      "据《Consumer Now》的一项调查，Bricktown 房地产公司提供该地区 ---- 高效的房地产服务。",
    choice_translations: [
      "A：非常",
      "B：如此的；这样的",
      "C：相当；十分",
      "D：最",
    ],
    grammar_point:
      "形容词最高级：the most + 多音节形容词构成最高级；the most efficient 表示“最高效的”。",
  },
  112: {
    question_translation:
      "托尔会计公司的员工手册指出，建设性的意见分歧是 ---- 办公室文化的一部分。",
    choice_translations: [
      "A：效果；影响（单数名词）",
      "B：效果；影响（复数名词）",
      "C：有效的；富有成效的（形容词）",
      "D：有效地（副词）",
    ],
    grammar_point:
      "词性辨析：空格位于名词短语 office culture 前，需要形容词 effective 作定语。",
  },
  113: {
    question_translation:
      "营销团队成员 ---- 得到经理许可，便可以居家办公。",
    choice_translations: [
      "A：只要",
      "B：由于；作为……的结果",
      "C：取决于；根据",
      "D：连同；和……一起",
    ],
    grammar_point:
      "条件连词：as long as 后接完整从句，表示“只要”；许可成立是居家办公的条件。",
  },
  114: {
    question_translation:
      "佩特松克集团 ---- 以实惠的价格提供优质保险。",
    choice_translations: [
      "A：被提醒的",
      "B：被接受的",
      "C：被要求的",
      "D：致力于；承诺的",
    ],
    grammar_point:
      "固定搭配：be committed to doing 表示“致力于做某事”；to 是介词，后接动名词 providing。",
  },
  115: {
    question_translation:
      "董事会昨晚决定，蒂娜·周应当 ---- 担任法务部门负责人。",
    choice_translations: [
      "A：持续的（形容词）",
      "B：继续（动词原形）",
      "C：继续了；持续的（过去式、过去分词或形容词）",
      "D：持续不断地（副词）",
    ],
    grammar_point:
      "情态动词：should 后面接不带 to 的动词原形，因此用 continue。",
  },
  116: {
    question_translation:
      "从 5 月 15 日 ---- 7 月 31 日，博物馆将展出一大批鸟类化石。",
    choice_translations: [
      "A：在……期间",
      "B：直到；到……为止",
      "C：在……周围；大约",
      "D：贯穿；在整个……期间",
    ],
    grammar_point:
      "时间介词搭配：from + 起始时间 + until + 截止时间，表示“从……持续到……”。",
  },
  117: {
    question_translation:
      "由于编辑部很多员工都使用这台打印机，办公室经理 ---- 不得不订购额外的纸张。",
    choice_translations: [
      "A：频率（名词）",
      "B：频繁的（形容词）",
      "C：常去；经常出入（现在分词）",
      "D：频繁地；经常（副词）",
    ],
    grammar_point:
      "词性辨析：空格修饰谓语 has to order，需要频率副词 frequently。",
  },
  118: {
    question_translation: "李先生认为丢失的文件 ---- 在档案库里。",
    choice_translations: [
      "A：正在确定……的位置；正在放置",
      "B：在某处",
      "C：被移走的；已删除的",
      "D：尤其；特别",
    ],
    grammar_point:
      "副词词义：somewhere 表示“在某处”，与后面的 in the archives 一起说明文件可能所在的位置。",
  },
  119: {
    question_translation:
      "每当数据安全发生 ---- 时，Halle 防盗保护公司都会立即通知客户。",
    choice_translations: [
      "A：破坏；泄露；安全漏洞",
      "B：合同；契约",
      "C：秘密",
      "D：提醒；提示",
    ],
    grammar_point:
      "名词搭配：a breach of data security 表示“数据安全遭到破坏”或“发生数据泄露”。",
  },
  120: {
    question_translation:
      "书桌的组装说明必须写得非常 ----，以确保顾客能够看懂。",
    choice_translations: [
      "A：更清楚的；更清楚地（比较级）",
      "B：最清楚的；最清楚地（最高级）",
      "C：清除；使清楚（第三人称单数动词）",
      "D：清楚地（副词）",
    ],
    grammar_point:
      "词性辨析：空格修饰被动语态中的动词 written，需要副词 clearly；very 也可直接修饰该副词。",
  },
  121: {
    question_translation:
      "据《贝克财经期刊》报道，本季度投资者对科技股的 ---- 大幅上升。",
    choice_translations: [
      "A：热情；浓厚兴趣（名词）",
      "B：热衷者；爱好者（名词，指人）",
      "C：热情的；热衷的（形容词）",
      "D：热情地（副词）",
    ],
    grammar_point:
      "词性与搭配：所有格 investors' 后需要名词作主语中心词；enthusiasm for 表示“对……的热情”。",
  },
  122: {
    question_translation:
      "Arctic Hare 制造的所有外套都旨在抵御 ---- 严寒。",
    choice_translations: [
      "A：慷慨地；大量地",
      "B：著名地",
      "C：极其；非常",
      "D：可疑地；疑心地",
    ],
    grammar_point:
      "程度副词：extremely 修饰形容词 cold，构成 extremely cold temperatures，表示“极低的温度”。",
  },
  123: {
    question_translation:
      "---- 在中央健康诊所预约检查时，客户会被问到几个与健康相关的问题。",
    choice_translations: [
      "A：然而；而",
      "B：当……时",
      "C：尽管；虽然",
      "D：在（某个地点或时间点）",
    ],
    grammar_point:
      "省略式时间状语从句：When scheduling 相当于 When clients schedule；从句主语与主句主语一致时可省略主语和 be。",
  },
  124: {
    question_translation:
      "由于员工调动，公司总部如今有 ---- 办公空间。",
    choice_translations: [
      "A：比率；速度",
      "B：剩余；过剩",
      "C：因素；要素",
      "D：利润；收益",
    ],
    grammar_point:
      "名词词义与搭配：a surplus of 表示“有剩余的；过剩的”；员工调走后会空出办公空间。",
  },
  125: {
    question_translation:
      "求职期间参加过 ---- 面试后，麦克雷女士预计自己很快会被录用。",
    choice_translations: [
      "A：相当大的；可观的",
      "B：无数的；数不清的",
      "C：丰富的；充足的",
      "D：许多（修饰不可数名词）",
    ],
    grammar_point:
      "数量形容词与搭配：countless 可直接修饰复数可数名词 interviews，表示“参加过无数次面试”。",
  },
  126: {
    question_translation:
      "Viesso 的两款山地自行车原型接受了用户测试，结果发现 ---- 的性能都格外出色。",
    choice_translations: [
      "A：较少；较小",
      "B：谁的；其（关系代词）",
      "C：哪一个；……的那个（疑问或关系代词）",
      "D：两者都",
    ],
    grammar_point:
      "不定代词：both 指代前面的 two prototypes，并在 and 后面的分句中作主语，表示“两者都”。",
  },
  127: {
    question_translation:
      "---- 乌里韦女士被晋升为 Cranhurst International 的开发总监，她曾担任过许多其他职务。",
    choice_translations: [
      "A：在……之前",
      "B：反而；代替",
      "C：同样地；类似地",
      "D：因此；所以",
    ],
    grammar_point:
      "时间连词：Before 后接完整从句，说明她担任其他职务发生在晋升之前。",
  },
  128: {
    question_translation:
      "景观设计师通常会向客户展示多份效果图，帮助他们 ---- 项目完工后的样子。",
    choice_translations: [
      "A：出现；显得",
      "B：与……相似",
      "C：想象；直观设想",
      "D：表达；表示",
    ],
    grammar_point:
      "动词词义与句型：help + 宾语 + 动词原形；visualize the completed project 表示“设想项目完工后的样子”。",
  },
  129: {
    question_translation:
      "下一季的晚装设计将采用从日本进口的 ---- 丝绸。",
    choice_translations: [
      "A：尽情享受；沉浸于（动词）",
      "B：奢华地；豪华地（副词）",
      "C：奢侈品（复数名词）",
      "D：奢华的；华贵的（形容词）",
    ],
    grammar_point:
      "词性辨析：空格位于名词 silk 前，需要形容词 luxurious 作定语。",
  },
  130: {
    question_translation:
      "如果广告收入进一步下降，该杂志的未来前景将变得 ----。",
    choice_translations: [
      "A：被报道的",
      "B：无关紧要的；微不足道的",
      "C：不确定的；前途未卜的",
      "D：被忽视的；被遗漏的",
    ],
    grammar_point:
      "形容词词义：be uncertain 表示“不确定”；广告收入继续下降会让杂志的未来前景不明朗。",
  },
};

if (!fs.existsSync(bankPath)) {
  throw new Error(`题库文件不存在：${bankPath}`);
}

const data = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const part5 = data.parts?.find((part) => Number(part.part) === 5);

if (!part5 || !Array.isArray(part5.questions)) {
  throw new Error("题库中没有找到 Part 5 questions 数组");
}

const expectedIds = Object.keys(translations).map(Number);
const questionsById = new Map(part5.questions.map((question) => [question.id, question]));
const missingIds = expectedIds.filter((id) => !questionsById.has(id));

if (missingIds.length > 0) {
  throw new Error(`Part 5 缺少预期题号：${missingIds.join(", ")}`);
}

let mergedQuestions = 0;
let mergedChoices = 0;

for (const id of expectedIds) {
  const question = questionsById.get(id);
  const patch = translations[id];

  if (!Array.isArray(question.choices) || question.choices.length !== 4) {
    throw new Error(`第 ${id} 题选项数量不是 4，已停止合并`);
  }

  if (patch.choice_translations.length !== question.choices.length) {
    throw new Error(`第 ${id} 题的选项翻译数量与英文选项不一致`);
  }

  Object.assign(question, patch);
  mergedQuestions += 1;
  mergedChoices += patch.choice_translations.length;
}

fs.writeFileSync(bankPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

console.log(
  `Part 5 翻译合并完成：${mergedQuestions} 道题干、${mergedChoices} 个选项；已写入 ${bankPath}`,
);
