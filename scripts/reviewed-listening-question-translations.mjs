import {createHash} from "node:crypto";
import {readFile, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

export const normalizeQuestion = value => String(value || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

// Complete, individually reviewed translations. Match only the full normalized
// question; never infer a translation by replacing individual English words.
const reviewedPairs = [
  ["Who most likely is the woman?", "这名女子最可能是什么身份？"],
  ["What does the woman say she will do?", "女子说她将做什么？"],
  ["Where do the speakers most likely work?", "对话中的人最可能在哪里工作？"],
  ["What does the woman ask the man to do?", "女子请男子做什么？"],
  ["What will the man do next?", "男子接下来会做什么？"],
  ["Where does the speaker most likely work?", "讲话者最可能在哪里工作？"],
  ["Where does the speaker work?", "讲话者在哪里工作？"],
  ["What are the speakers mainly discussing?", "对话中的人主要在讨论什么？"],
  ["Where does the man most likely work?", "男子最可能在哪里工作？"],
  ["What are the speakers discussing?", "对话中的人在讨论什么？"],
  ["What does the speaker ask the listeners to do?", "讲话者请听众做什么？"],
  ["What does the man ask the woman to do?", "男子请女子做什么？"],
  ["What does the man ask about?", "男子询问了什么事情？"],
  ["What does the man suggest the woman do?", "男子建议女子做什么？"],
  ["Who most likely is the speaker?", "讲话者最可能是什么身份？"],
  ["What problem does the woman mention?", "女子提到了什么问题？"],
  ["What will the man most likely do next?", "男子接下来最可能做什么？"],
  ["What is the speaker mainly discussing?", "讲话者主要在谈论什么？"],
  ["Where most likely are the speakers?", "对话中的人最可能在哪里？"],
  ["Where do the listeners most likely work?", "听众最可能在哪里工作？"],
  ["Where does the woman work?", "女子在哪里工作？"],
  ["What does the man offer to do?", "男子主动提出要做什么？"],
  ["What does the woman offer to do?", "女子主动提出要做什么？"],
  ["Why is the man calling?", "男子为什么打电话？"],
  ["What problem does the speaker mention?", "讲话者提到了什么问题？"],
  ["What most likely is the woman's job?", "女子最可能从事什么工作？"],
  ["What does the man suggest?", "男子提出了什么建议？"],
  ["Where is the conversation taking place?", "这段对话发生在哪里？"],
  ["Who most likely are the speakers?", "对话中的人最可能是什么身份？"],
  ["What will the woman most likely do next?", "女子接下来最可能做什么？"],
  ["What problem does the man mention?", "男子提到了什么问题？"],
  ["What are the listeners asked to do?", "听众被要求做什么？"],
  ["Where does the conversation most likely take place?", "这段对话最可能发生在哪里？"],
  ["Who most likely is the man?", "男子最可能是什么身份？"],
  ["What will the woman do next?", "女子接下来会做什么？"],
  ["What does the man ask the woman for?", "男子向女子索要什么？"],
  ["Why is the woman concerned?", "女子为什么感到担忧？"],
  ["Who most likely are the listeners?", "听众最可能是什么身份？"],
  ["What type of business do the speakers most likely work for?", "对话中的人最可能在什么类型的企业工作？"],
  ["What does the woman suggest doing?", "女子建议做什么？"],
  ["What is the broadcast mainly about?", "这段广播主要讲什么？"],
  ["What will the listeners most likely do next?", "听众接下来最可能做什么？"],
  ["Who is the speaker?", "讲话者是谁？"],
  ["What does the speaker ask the listener to do?", "讲话者请对方做什么？"],
  ["Where do the speakers work?", "对话中的人在哪里工作？"],
  ["What is the woman concerned about?", "女子在担心什么？"],
  ["Where is the conversation most likely taking place?", "这段对话最可能发生在哪里？"],
  ["What does the man say he is working on?", "男子说他正在处理什么工作？"],
  ["Why does the woman call the man?", "女子为什么给男子打电话？"],
  ["What does the woman say she will do this afternoon?", "女子说她今天下午将做什么？"],
  ["Who is the woman?", "这名女子是谁？"],
  ["What does the woman say she will do next?", "女子说她接下来会做什么？"],
  ["What does the speaker suggest?", "讲话者提出了什么建议？"],
  ["What does the speaker thank the listener for?", "讲话者因为什么事情向对方道谢？"],
  ["What is the topic of today's broadcast?", "今天的广播主题是什么？"],
  ["What is the conversation mainly about?", "这段对话主要谈论什么？"],
  ["Where does the conversation take place?", "这段对话发生在哪里？"],
  ["What does the woman ask about?", "女子询问了什么事情？"],
  ["Where is the announcement taking place?", "这则通知是在哪里播报的？"],
  ["What will the man probably do next?", "男子接下来很可能做什么？"],
  ["Why is the man calling the woman's company?", "男子为什么给女子所在的公司打电话？"],
  ["What is the woman calling about?", "女子打电话是为了什么事情？"],
  ["What will the listeners do first?", "听众首先会做什么？"],
  ["Where is the introduction taking place?", "这段介绍是在哪里进行的？"],
  ["What will the speaker most likely do next?", "讲话者接下来最可能做什么？"],
  ["What is being advertised?", "广告宣传的是什么？"],
  ["What is the topic of the workshop?", "这次培训的主题是什么？"],
  ["What does the woman ask the man about?", "女子向男子询问了什么事情？"],
  ["What does the speaker remind the listeners about?", "讲话者提醒听众注意什么事情？"],
  ["What type of product is the speaker discussing?", "讲话者在介绍哪一类产品？"],
  ["What will the listeners do next?", "听众接下来会做什么？"],
  ["What does the woman want the man to do?", "女子希望男子做什么？"],
  ["Who is the man?", "这名男子是谁？"],
  ["Why does the woman apologize?", "女子为什么道歉？"],
  ["What does the company make?", "这家公司生产什么？"],
  ["What will happen next week?", "下周将发生什么？"],
  ["What news does the man share?", "男子分享了什么消息？"],
  ["What will the speaker do next?", "讲话者接下来会做什么？"],
  ["Where does the woman most likely work?", "女子最可能在哪里工作？"],
  ["What does the woman suggest the man do?", "女子建议男子做什么？"],
  ["Who are the listeners?", "听众是谁？"],
  ["Where is the announcement being made?", "这则通知是在哪里播报的？"],
  ["What will happen next?", "接下来将发生什么？"],
  ["What does the man say he did?", "男子说他做过什么？"],
  ["What does the man agree to do?", "男子同意做什么？"],
  ["What does the speaker encourage the listeners to do?", "讲话者鼓励听众做什么？"],
  ["What does the man suggest doing?", "男子建议做什么？"],
  ["What does the man warn the woman about?", "男子提醒女子警惕什么事情？"],
  ["What is the man concerned about?", "男子在担心什么？"],
  ["Where is the speaker?", "讲话者在哪里？"],
  ["What does the speaker recommend?", "讲话者推荐什么？"],
  ["Where is the speaker reporting from?", "讲话者正在哪里进行报道？"],
  ["What does the man ask the woman about?", "男子向女子询问了什么事情？"],
  ["Why will the man be unavailable?", "男子为什么将会没有空？"],
  ["What does the woman complain about?", "女子在抱怨什么？"],
  ['What does the man imply when he says, "you\'re not leaving now, are you"?', "男子说“你现在不是要走吧？”时，暗示了什么？"],
  ["What does the man promise to send?", "男子承诺会寄送什么？"],
  ["What event are the speakers mainly talking about?", "对话中的人主要在谈论什么活动？"],
  ["Which department does the man work in?", "男子在哪个部门工作？"],
  ["What is the man asked to do?", "男子被要求做什么？"],
  ["What is the man purchasing?", "男子正在购买什么？"],
  ['Why does the man say, "I\'ve just started my business"?', "男子为什么说“我刚开始创业”？"],
  ["What is Jane concerned about?", "简在担心什么？"],
  ["Why does the man want a short-term contract?", "男子为什么想签一份短期合同？"],
  ["What will the woman do after the phone call?", "通话结束后，女子会做什么？"],
  ["According to the woman, what has happened?", "根据女子所说的话，发生了什么事情？"],
  ["What does the woman recommend doing?", "女子建议做什么？"],
  ["Where do the men work?", "这些男子在哪里工作？"],
  ["What does the woman request?", "女子提出了什么要求？"],
  ["Why will the woman be away?", "女子为什么将要离开一段时间？"],
  ["What type of event did the woman go to yesterday?", "女子昨天参加了哪一类活动？"],
  ["Why does the woman want to return a piece of clothing?", "女子为什么想退回一件衣服？"],
  ["Look at the graphic. How much will be refunded?", "请看图表。将退还多少钱？"],
  ["Why was the man late?", "男子为什么迟到了？"],
  ["Look at the graphic. Where will the speakers probably go next?", "请看图表。对话中的人接下来很可能去哪里？"],
  ["Why does the woman say she is concerned?", "女子为什么说她感到担忧？"],
  ["Where most likely are the listeners?", "听众最可能在哪里？"],
  ["According to the speaker, what can the listeners do online?", "根据讲话者所说的话，听众可以在网上做什么？"],
  ["What does Ento Industries produce?", "Ento Industries 公司生产什么？"],
  ["What does the speaker emphasize about the product?", "讲话者强调了该产品的哪一方面？"],
  ["What does the speaker say the listener can do?", "讲话者说对方可以做什么？"],
  ["What problem is the speaker discussing?", "讲话者在谈论什么问题？"],
  ["Why is the speaker calling the theater?", "讲话者为什么给剧院打电话？"],
  ["What does the speaker say he can do?", "讲话者说他能做什么？"],
  ["What is the speaker offering the listeners?", "讲话者向听众提供什么？"],
  ['What does the speaker imply when she says, "the sign-up sheet will only be there for a few days"?', "讲话者说“报名表只会在那里放几天”时，暗示了什么？"],
  ["What does the speaker invite the listener to do?", "讲话者邀请对方做什么？"],
  ['Why does the speaker say, "I have some meetings near your office building on Tuesday and Wednesday"?', "讲话者为什么说“周二和周三我在你办公楼附近有几个会议”？"],
  ["What department does the speaker most likely work in?", "讲话者最可能在哪个部门工作？"],
  ["What solution has been offered?", "已经提出了什么解决办法？"],
  ["Where is the talk taking place?", "这次讲话是在哪里进行的？"],
  ['Why does the speaker say, "This has never happened before"?', "讲话者为什么说“以前从未发生过这种情况”？"],
  ["What will be available next week?", "下周将提供什么？"],
  ["What does the speaker say about the cost of Rickson Center services?", "关于 Rickson Center 的服务费用，讲话者说了什么？"],
  ["What recently happened in Keene Township?", "基恩镇最近发生了什么事情？"],
  ["Look at the graphic. Which workshop is currently full?", "请看图表。目前哪个研讨会已经满员？"],
  ["Why are the listeners told to visit a Web site?", "为什么让听众访问一个网站？"],
  ["Look at the graphic. Which person will be interviewed?", "请看图表。哪位人士将接受采访？"],
  ["What will Dr. Patel do in March?", "帕特尔医生将在三月做什么？"],
  ["What does the man say he will do before making a decision?", "男子说他在做决定之前将做什么？"],
  ["Why will the man's work be easier next week?", "男子的工作为什么下周会变得更轻松？"],
  ['Why does the man say, "My business plan for next quarter is due in two hours"?', "男子为什么说“我下个季度的商业计划必须在两小时内提交”？"],
  ["What product are the speakers discussing?", "对话中的人在讨论什么产品？"],
  ["What does the woman inform the man about?", "女子告知男子什么事情？"],
  ["What will the man do this weekend?", "男子这个周末将做什么？"],
  ["What will the man most likely do on Monday?", "男子周一最可能做什么？"],
  ["According to the woman, what is required?", "根据女子所说的话，有什么要求？"],
  ["Why will a meeting be held?", "为什么要召开一次会议？"],
  ["What will the man create?", "男子将制作什么？"],
  ["What is the topic of tonight's meeting?", "今晚会议的主题是什么？"],
];

export const reviewedTranslations = new Map(reviewedPairs.map(([english, chinese]) => [normalizeQuestion(english), chinese]));
if (reviewedTranslations.size !== reviewedPairs.length) throw new Error("Duplicate reviewed question mapping");

// The audio concerns a data-management workshop. Q98 contains electrical-work
// choices; Q99 has a malformed construction-project question and stage choices.
// Q100 matches the instruction to turn on laptops and is not quarantined.
export const knownMismatchedItems = new Set([
  "official-5-test-1/p4-98-100/98",
  "official-5-test-1/p4-98-100/99",
]);

export function isPlaceholderTranslation(value) {
  return !String(value || "").trim() || /中文辅助|中文待补|translation pending/i.test(value) || !/[\p{Script=Han}]/u.test(value);
}

export function applyReviewedQuestionTranslation(item) {
  const source = normalizeQuestion(item.question);
  const replacement = reviewedTranslations.get(source);
  const pending = isPlaceholderTranslation(item.question_translation);
  const before = JSON.stringify(item);
  // Existing genuine Chinese is kept, even when this dictionary also covers it.
  if (pending && replacement) {
    item.question_translation = replacement;
    item.question_translation_source = {
      schema_version: "reviewed_listening_question_translation_v1",
      method: "exact_reviewed_question_mapping",
      source_sha256: createHash("sha256").update(source).digest("hex"),
      reviewed_at: "2026-09-24",
      language: "zh-CN",
    };
  }
  const status = isPlaceholderTranslation(item.question_translation) ? "pending" : "ready";
  item.study_aid_status = {...item.study_aid_status, question_translation: status};
  if (knownMismatchedItems.has(item.item_key)) {
    item.answer_review_status = "pending";
    item.content_review_status = "source_required";
    item.content_review_issues = [...new Set([...(item.content_review_issues || []), "question_choices_do_not_match_material"])];
    item.study_aid_status.analysis = "pending";
  }
  return {changed: JSON.stringify(item) !== before, translated: pending && Boolean(replacement), status};
}

export async function repairListeningQuestionTranslations({root = fileURLToPath(new URL("../", import.meta.url)), write = false} = {}) {
  const catalog = JSON.parse(await readFile(path.join(root, "public/data/catalog.json"), "utf8"));
  const counts = {reviewed_mappings: reviewedTranslations.size, questions: 0, translated: 0, ready: 0, pending: 0, changed_files: 0, write};
  for (const bank of catalog.banks) {
    const index = JSON.parse(await readFile(path.join(root, "public/data", bank.index_path), "utf8"));
    for (const unit of index.units.filter(unit => [3, 4].includes(unit.part))) {
      const file = path.join(root, "public/data", unit.detail_path);
      if (!/\/units\/p[34]-[^/]+\.json$/.test(file)) throw new Error(`Unexpected unit path: ${file}`);
      const detail = JSON.parse(await readFile(file, "utf8"));
      let changed = false;
      for (const item of detail.items) {
        const result = applyReviewedQuestionTranslation(item);
        counts.questions++;
        if (result.translated) counts.translated++;
        counts[result.status]++;
        changed ||= result.changed;
      }
      if (changed) {
        counts.changed_files++;
        if (write) await writeFile(file, `${JSON.stringify(detail, null, 2)}\n`);
      }
    }
  }
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await repairListeningQuestionTranslations({write: process.argv.includes("--write")}), null, 2));
}
