import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {hasCurrentPart5Review} from "./apply-part5-reviewed-aids.mjs";

// Reviewed against each complete English sentence, not a word-for-word fill
// of the previous Chinese cloze. Exact source matching prevents stale reuse.
const official11 = [
  [101,"Starlight Noodle House ---- to open its first North American restaurant early next year.","plans","星光面馆**计划**于明年初在北美开设其第一家餐厅。"],
  [102,"For a small fee, Marvin's Fine Furniture will ---- items to customers' homes within two days of purchase.","deliver","只需支付少量费用，马文精品家具公司便会在购买后两天内将商品**送到**顾客家中。"],
  [103,"There is no price ---- among Kalteco's three refrigerator models.","difference","Kalteco 的三款冰箱型号之间没有价格**差异**。"],
  [104,"McAlvey's Rental will provide the tents and seating needed ---- the upcoming festival.","for","麦卡尔维租赁公司将提供**用于**即将举行的节庆活动的帐篷和座椅。"],
  [105,"Mr. Sorva handles all purchase orders ---- unless special approvals are needed.","himself","除非需要特别批准，否则所有采购订单都由索尔瓦先生**亲自**处理。"],
  [106,"We appreciate your patience ---- our technology team works to restore the connection.","while","**在**技术团队努力恢复连接**期间**，感谢您的耐心等待。"],
  [107,"Davison Avionics' sales department is ---- recruiting additional team members.","actively","戴维森航空电子公司的销售部门正在**积极**招聘更多团队成员。"],
  [108,"It has been six months ---- Mr. Payne became president of Thornton Machinery.","since","**自从**佩恩先生出任桑顿机械公司总裁以来，已经过去六个月了。"],
  [109,"The company has stayed profitable ---- by keeping operating costs low.","mainly","该公司**主要**通过控制运营成本来保持盈利。"],
  [110,"Clients of Elise Salon receive text messages asking them to confirm their ----.","appointments","Elise 沙龙的顾客会收到短信，要求他们确认自己的**预约**。"],
  [111,"According to a Consumer Now poll, Bricktown Realty provides the ---- efficient real estate services in the area.","most","据《Consumer Now》的一项调查，Bricktown 房地产公司提供该地区**最**高效的房地产服务。"],
  [112,"Tolle Accounting's employee manual states that constructive disagreements are part of an ---- office culture.","effective","托尔会计公司的员工手册指出，建设性的不同意见是**富有成效的**办公室文化的一部分。"],
  [113,"Marketing team members may work from home ---- they have their manager's permission.","as long as","营销团队成员**只要**得到经理许可，便可以居家办公。"],
  [114,"The Petsonk Group is ---- to providing outstanding insurance at an affordable cost.","committed","佩特松克集团**致力于**以实惠的价格提供优质保险。"],
  [115,"The board of directors decided last night that Tina Chau should ---- as head of the legal department.","continue","董事会昨晚决定，蒂娜·周应当**继续**担任法务部门负责人。"],
  [116,"A large collection of bird fossils will be on display at the museum from May 15 ---- July 31.","until","从 5 月 15 日**到**7 月 31 日，博物馆将展出一大批鸟类化石。"],
  [117,"Because so many members of the editorial staff use the printer, the office manager ---- has to order extra paper.","frequently","由于编辑部很多员工都使用这台打印机，办公室经理**经常**不得不额外订购纸张。"],
  [118,"Mr. Rhee thinks that the missing file is ---- in the archives.","somewhere","李先生认为丢失的文件在档案库的**某个地方**。"],
  [119,"Halle Theft Protection notifies customers immediately whenever there is a ---- of data security.","breach","每当数据安全受到**侵犯**时，Halle 防盗保护公司都会立即通知客户。"],
  [120,"The assembly instructions for the desk must be written very ---- to ensure that customers understand them.","clearly","书桌的组装说明必须写得非常**清楚**，以确保顾客能够看懂。"],
  [121,"According to the Baker Financial Journal, investors' ---- for technology stocks rose sharply this quarter.","enthusiasm","据《贝克财经期刊》报道，本季度投资者对科技股的**热情**大幅上升。"],
  [122,"All outerwear made by Arctic Hare is designed to withstand ---- cold temperatures.","extremely","Arctic Hare 制造的所有外套都旨在抵御**极其**寒冷的气温。"],
  [123,"---- scheduling an examination at Central Wellness Clinic, clients will be asked a few health-related questions.","When","客户**在**中央健康诊所预约检查**时**，会被问到几个与健康相关的问题。"],
  [124,"Owing to staff relocations, the company now has a ---- of office space at its headquarters.","surplus","由于员工调动，公司总部如今有**过剩的**办公空间。"],
  [125,"Having participated in ---- interviews during her job search, Ms. McKray expects that she will be hired soon.","countless","求职期间参加过**无数次**面试后，麦克雷女士预计自己很快会被录用。"],
  [126,"Two prototypes of Viesso's mountain bike underwent user testing, and ---- were found to perform exceptionally well.","both","Viesso 的两款山地自行车原型接受了用户测试，结果发现**两款都**表现格外出色。"],
  [127,"---- Ms. Uribe was promoted to director of development at Cranhurst International, she served in many other capacities.","Before","乌里韦女士在晋升为 Cranhurst International 的开发总监**之前**，曾担任过许多其他职务。"],
  [128,"Landscape designers usually present several renderings to clients to help them ---- the completed project.","visualize","景观设计师通常会向客户展示多份效果图，帮助他们**想象**项目完工后的样子。"],
  [129,"---- silk will be imported from Japan for our evening-wear fashion designs next season.","Luxurious","我们将从日本进口**奢华的**丝绸，用于下一季的晚装设计。"],
  [130,"If its advertising revenue declines further, the magazine's future prospects are ----.","uncertain","如果广告收入进一步下降，该杂志的未来前景将变得**不确定**。"],
];

const official1 = [
  [101,"Ms. Iwata handed out copies of the agenda that ------- had printed for the meeting.","she","岩田女士分发了**她**为会议打印的议程副本。","代词主格","关系代词 that 作 printed 的宾语，空格处缺少从句主语，因此用主格 she。hers 是名词性物主代词，her 是宾格或形容词性物主代词，herself 是反身代词，都不能在此作普通主语。",["她的（名词性物主代词）","她／她的（宾格或形容词性物主代词）","她（主格）","她自己（反身代词）"]],
  [103,"The product review says that the Cozy Days space heater is ------- to warm up than similar products.","slower","产品评论指出，Cozy Days 电暖器升温比同类产品**更慢**。","形容词比较级","than 引出比较对象，is 后需要形容词比较级 slower。slowest 是最高级；slowed 和 slowing 是动词形式。",["最慢的","更慢的","减慢了的／被减慢的","正在减慢"]],
  [104,"Employees from San Jose International will arrive in Alajuela tomorrow for ------- first training session.","their","San Jose International 的员工将于明天抵达阿拉胡埃拉，参加**他们的**第一次培训。","形容词性物主代词","空格修饰名词短语 first training session，且所属者是复数 employees，因此选 their。theirs 不能放在名词前；they 和 them 不是物主限定词。",["他们（主格）","他们的（形容词性物主代词）","他们（宾格）","他们的（名词性物主代词）"]],
  [106,"Sales of Seviana Cosmetics have ------- improved since the new marketing campaign began last quarter.","steadily","自新的营销活动于上季度开始以来，Seviana Cosmetics 的销量一直在**稳步**增长。","副词修饰动词","空格修饰动词 improved，需要副词 steadily。steady、steadiest 是形容词形式，steadied 是动词过去式或过去分词。",["稳定的","稳步地","最稳定的","使稳定（过去式／过去分词）"]],
  [107,"Most applicants to Shim Accounting Services have completed a ------- internship at the company headquarters.","paid","Shim 会计服务公司的大多数求职者都曾在公司总部完成**带薪**实习。","词汇与搭配","paid internship 表示“带薪实习”，符合求职与工作经历的语境。其他选项不能组成这里所需的自然搭配。",["清楚的","目前的／在场的","被拿走的／已被占用的","带薪的"]],
  [108,"Each Beehive Crafts Supply customer may redeem ------- coupon per visit.","one","Beehive Crafts Supply 的每位顾客每次到店可使用**一张**优惠券。","数量词","单数可数名词 coupon 前需要表示数量的 one。alone 是形容词或副词，once 表示“一次”，first 表示顺序，均不符合本句数量限制的意思。",["独自的／独自地","一","第一","一次"]],
  [109,"Dietrich Dentistry asks patients to provide 24-hour notice to cancel a scheduled -------.","appointment","Dietrich 牙科诊所要求患者取消已安排的**预约**时，提前 24 小时通知。","名词搭配","cancel a scheduled appointment 表示“取消已安排的预约”，与牙科患者提前通知的语境一致。",["预约","参与","要求","投资"]],
  [110,"The building inspection has been postponed until next week ------- that the electrical work can be completed.","so","建筑检查已推迟到下周，**以便**电气工程能够完工。","目的状语从句","so that 后接完整从句，表示推迟检查的目的“以便电气工程完工”。其余选项不能在此与 that 构成目的连接结构。",["也","当……时","比","以便（so that）"]],
  [111,"Mr. Carson ------- all the arrangements for the company retreat next month.","will make","卡森先生**将作出**下个月公司外出团建的全部安排。","谓语动词","主语 Mr. Carson 后需要谓语。will make 是完整谓语；having made、to make、making 均为非谓语形式，不能独立充当本句谓语。",["已作出（分词完成式）","去作出（不定式）","作出（动名词／现在分词）","将作出"]],
  [112,"The cafeteria in Morris Hall offers ------- breakfast and lunch for Arai and Ramos associates.","complimentary","Morris Hall 的食堂为 Arai and Ramos 的员工提供**免费**早餐和午餐。","形容词词义","complimentary 在餐饮服务语境中意为“免费的”，修饰 breakfast and lunch。不要与 complementary（互补的）混淆。",["免费的；赞美的","负责的","被更换的","已获得的／有保障的"]],
  [113,"Visitors to Kensington Corporation must obtain guest passes ------- the security office prior to entering the facility.","from","Kensington 公司的访客进入场所前，必须**从**安保办公室领取访客通行证。","介词搭配","obtain something from someone/somewhere 表示“从某人／某处取得某物”，from 标明通行证来源。",["在……上／一……就","从","朝向","在两者之间"]],
  [114,"Tachibana Pharmaceuticals’ new method of ------- chemical solutions will increase efficiency in the laboratory.","combining","Tachibana 制药公司**混合**化学溶液的新方法将提高实验室的工作效率。","介词后接动名词","介词 of 后需要名词性成分，且后面有宾语 chemical solutions，因此选动名词 combining；combinations 不能直接带这个宾语。",["混合（动词原形）","组合（复数名词）","混合（动名词）","混合（第三人称单数）"]],
  [115,"Lexino Publisher's dictionary database allows users to search for entries in ------- languages.","multiple","Lexino 出版社的词典数据库允许用户检索**多种**语言的词条。","形容词修饰名词","空格修饰复数名词 languages，multiple 是形容词，表示“多个的／多种的”。其余选项为动词形式或复数名词。",["相乘了的／增加了的","正在增加的","倍数（复数名词）","多个的／多种的"]],
  [116,"No one is permitted on the factory floor ------- proper safety gear.","without","**未穿戴**适当安全装备的人员一律不得进入工厂车间。","介词与条件语义","without 后接名词短语 proper safety gear，表示“没有适当的安全装备”。unless 通常引导从句，不能在本句直接接这个名词短语。",["在……之后","关于","除非","没有／未穿戴"]],
  [119,"The convention center is located on Market Street, directly ------- Glenview Shopping Center.","opposite","会展中心位于 Market Street，正好在 Glenview 购物中心**对面**。","方位介词","opposite 可作介词直接接地点；directly opposite 表示“正对面”。nearby 通常不直接接名词宾语，among 表示在多个对象之中，apart 通常与 from 连用。",["在……对面","在……之中","分开地","在附近"]],
  [129,"Geneto Technology uses three ------- of laboratory accuracy to ensure consistent results.","indicators","Geneto Technology 使用三项实验室准确性**指标**来确保结果一致。","数词后接复数名词","three 后需要复数可数名词，indicators 表示“指标”。indicate、indicating 和 indicated 都不是此处所需的复数名词。",["指标（复数名词）","表明（动词原形）","正在表明（现在分词）","已表明（过去式／过去分词）"]],
];

const normalize = text => String(text).replace(/[’‘]/g,"'").replace(/[-_—]{2,}/g,"<blank>").replace(/\s+/g," ").trim();
export const sourceHash = item => createHash("sha256").update(JSON.stringify([normalize(item.question),item.choices,item.answer])).digest("hex");
export const reviewedRows = [...official11.map(row=>({bank:"official-11-test-1",row})),...official1.map(row=>({bank:"official-1-test-1",row}))];

export function applyReviewedAids(root,{write=false}={}) {
  const result={applied:[],source_mismatch:[]};
  for(const {bank,row} of reviewedRows){
    const [id,expected,answerWord,translation,type,analysis,choiceTranslations]=row;
    const file=path.join(root,bank,"units",`p5-${id}.json`),detail=JSON.parse(fs.readFileSync(file,"utf8")),item=detail.items[0];
    const answerIndex="ABCD".indexOf(item.answer);
    if(normalize(item.question)!==normalize(expected)||item.choices[answerIndex]!==answerWord){result.source_mismatch.push(`${bank}/${id}`);continue}
    if(hasCurrentPart5Review(item)){result.applied.push(`${bank}/${id}`);continue}
    item.question_translation=translation;
    item.completed_sentence=item.question.replace(/[-_—]{2,}/,answerWord);
    item.study_aid_status={...item.study_aid_status,question_translation:"ready"};
    item.study_aid_source={...item.study_aid_source,question_translation:{method:"reviewed_complete_sentence",source_sha256:sourceHash(item)}};
    if(analysis){
      item.question_type=`语法 / 词汇题 · ${type}`;
      item.grammar_point=type;item.answer_explain=analysis;
      item.choice_translations=choiceTranslations;
      delete item.evidence;delete item.strategy;
      item.explanation_structured={answer:item.answer,question_type:item.question_type,analysis};
      item.study_aid_status.analysis="ready";item.study_aid_status.choice_translations="ready";
      item.study_aid_source.analysis={method:"reviewed_sentence_and_choices",source_sha256:sourceHash(item)};
    }
    // Part 5 has no separate passage. An old context gloss must not compete
    // with the reviewed full-sentence translation.
    delete detail.context.content_translation;
    if(write)fs.writeFileSync(file,JSON.stringify(detail,null,2)+"\n");
    result.applied.push(`${bank}/${id}`);
  }
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=fileURLToPath(new URL("../public/data/banks",import.meta.url));
  console.log(JSON.stringify(applyReviewedAids(root,{write:process.argv.includes("--write")}),null,2));
}
