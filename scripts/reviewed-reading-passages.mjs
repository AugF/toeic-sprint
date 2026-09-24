import {createHash} from "node:crypto";
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const hashText = value => createHash("sha256").update(value).digest("hex");

// These transcriptions and translations were checked against the complete
// original pages. Image hashes prevent applying them to a replacement scan.
// Part 6 stores bare blank numbers because the UI supplies the visible blanks.
export const reviewedPassages = [
  {
    bank_id: "official-1-test-1",
    unit_id: "p6-131-134",
    part: 6,
    image_path: "reading-layout/p6-131-134-1.jpg",
    image_sha256: "7b60ae2f76b3c64ca78971a4973929b4536c18da8f6062fb90224dda5bf0e635",
    item_ids: [131, 132, 133, 134],
    choice_cleanups: [
      {item_id: 131, index: 0, expected: "garments ;", corrected: "garments"},
      {item_id: 132, index: 1, expected: "keep ;", corrected: "keep"},
      {item_id: 134, index: 3, expected: "both (0) (RS - BRBC)HA(O)", corrected: "both"},
    ],
    passage: "There is no better time to visit beautiful Nova Scotia, and Nova Scotia Tours can help! With over 25 years in business, we know how to plan 131 tailored to our clients’ specifications. You and your family can enjoy everything from our Gaelic fiddle music and Ukrainian heritage festivals to the fresh, salty air and delicious seafood.\n\nFor adventure seekers, there are many activities 132 you busy. 133\n\nOr, 134 you prefer, relax and dine at any of our world-class restaurants. But don’t wait. Call us today at 902-555-0166!",
    passage_translation: "现在正是游览美丽的新斯科舍省的最佳时机，新斯科舍旅行社可以为您提供帮助！我们拥有超过 25 年的经营经验，知道如何根据客户的具体要求规划【131】。您和家人既可以欣赏盖尔传统小提琴音乐、参加乌克兰传统文化节庆，也可以享受清新而略带咸味的空气和美味的海鲜。\n\n对于热爱探险的游客，这里有许多活动【132】您忙个不停。【133】\n\n或者，【134】您愿意，也可以到我们任意一家世界一流的餐厅放松身心、享用美食。不要再等了，今天就拨打 902-555-0166 联系我们吧！",
  },
  {
    bank_id: "official-1-test-1",
    unit_id: "p7-147-148",
    part: 7,
    image_path: "reading-layout/p7-147-148-1.jpg",
    image_sha256: "42071355f294c9fff90257adaa8d5b3bf7d860b5853d60a0e80fe8565f2b1686",
    item_ids: [147, 148],
    passage: "Welcome to\nMoon Bay Department Store\n\nPlease use this temporary directory to navigate our store while it is under renovation. We are expanding Level 2, which previously held our shoe department, in order to build a food court for our valued customers.\n\nLevel 1\nElectronics and Technology\nHome Furnishings\n\nLevel 2\nClosed for Renovations until June 4\n\nLevel 3\nChildren’s Clothing\nAthletic Equipment\n\nLevel 4\nWomen’s Clothing\nMen’s Clothing\nShoes",
    passage_translation: "欢迎光临月湾百货商店\n\n本店装修期间，请使用这份临时楼层指南寻找您要去的区域。我们正在扩建原先设有鞋类部门的二楼，以便为尊贵的顾客打造一个美食广场。\n\n一楼\n电子与科技产品\n家居用品\n\n二楼\n因装修暂停开放，至 6 月 4 日\n\n三楼\n儿童服装\n运动器材\n\n四楼\n女装\n男装\n鞋类",
    choice_patch: {item_id: 148, index: 3, expected: "On Level 4", translation: "D：四楼"},
  },
];

export function applyReviewedPassage(detail, reviewed, imageSha256) {
  if (detail.bank_id !== reviewed.bank_id || detail.unit_id !== reviewed.unit_id || detail.part !== reviewed.part) throw new Error("Reviewed passage identity mismatch");
  if (imageSha256 !== reviewed.image_sha256) throw new Error("Reviewed source image hash mismatch");
  if (!detail.context.reading_layout_images?.some(image => image.path === reviewed.image_path)) throw new Error("Reviewed source image is not associated with this passage");
  if (JSON.stringify(detail.items.map(item => Number(item.item_id))) !== JSON.stringify(reviewed.item_ids)) throw new Error("Reviewed passage question range mismatch");
  const patch = reviewed.choice_patch;
  const optionItem = patch ? detail.items.find(item => Number(item.item_id) === patch.item_id) : null;
  if (patch && optionItem?.choices?.[patch.index] !== patch.expected) throw new Error("Reviewed option no longer matches its English source");
  const cleanups = (reviewed.choice_cleanups || []).map(cleanup => {
    const item = detail.items.find(item => Number(item.item_id) === cleanup.item_id);
    if (![cleanup.expected, cleanup.corrected].includes(item?.choices?.[cleanup.index])) throw new Error("Reviewed choice cleanup no longer matches its exact source");
    return {item, cleanup};
  });

  const before = JSON.stringify(detail);
  const passageSha256 = hashText(reviewed.passage);
  const source = {
    schema_version: "reviewed_reading_passage_v1",
    method: "original_image_visual_review",
    reviewed_at: "2026-09-24",
    image_path: `${reviewed.bank_id}/${reviewed.image_path}`,
    image_sha256: imageSha256,
    passage_sha256: passageSha256,
  };
  detail.context.passage = reviewed.passage;
  detail.context.passage_source = source;
  detail.context.passage_translation = reviewed.passage_translation;
  detail.context.passage_translation_source = {
    ...source,
    method: "reviewed_full_passage_translation",
    translation_sha256: hashText(reviewed.passage_translation),
    language: "zh-CN",
    ...(reviewed.part === 6 ? {cloze_policy: "preserve_numbered_blanks_without_answers"} : {}),
  };
  detail.context.study_aid_status = {...detail.context.study_aid_status, passage_translation: "ready"};
  for (const {item, cleanup} of cleanups) item.choices[cleanup.index] = cleanup.corrected;
  if (patch) {
    const translations = Array.from({length: optionItem.choices.length}, (_, index) => optionItem.choice_translations?.[index] || "");
    translations[patch.index] = patch.translation;
    optionItem.choice_translations = translations;
    optionItem.study_aid_status = {...optionItem.study_aid_status, choice_translations: translations.every(value => value.trim()) ? "ready" : "partial"};
    optionItem.study_aid_source = {
      ...optionItem.study_aid_source,
      reviewed_choice_translations: {
        method: "exact_option_visual_review",
        image_sha256: imageSha256,
        reviewed_options: [{index: patch.index, source: patch.expected, source_sha256: hashText(patch.expected), translation: patch.translation}],
      },
    };
  }
  return JSON.stringify(detail) !== before;
}

export async function repairReviewedPassages({root = fileURLToPath(new URL("../", import.meta.url)), write = false} = {}) {
  const result = {changed: [], unchanged: [], write};
  for (const reviewed of reviewedPassages) {
    const unitPath = path.join(root, "public/data/banks", reviewed.bank_id, "units", `${reviewed.unit_id}.json`);
    const imagePath = path.join(root, "public/assets", reviewed.bank_id, reviewed.image_path);
    const [content, image] = await Promise.all([readFile(unitPath, "utf8"), readFile(imagePath)]);
    const detail = JSON.parse(content);
    const changed = applyReviewedPassage(detail, reviewed, hashText(image));
    result[changed ? "changed" : "unchanged"].push(`${reviewed.bank_id}/${reviewed.unit_id}`);
    if (write && changed) await writeFile(unitPath, `${JSON.stringify(detail, null, 2)}\n`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await repairReviewedPassages({write: process.argv.includes("--write")}), null, 2));
}
