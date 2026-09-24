import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";
import {applyReviewedPassage, hashText, reviewedPassages} from "../scripts/reviewed-reading-passages.mjs";

const root = new URL("../", import.meta.url);
const readDetail = async reviewed => JSON.parse(await readFile(new URL(`public/data/banks/${reviewed.bank_id}/units/${reviewed.unit_id}.json`, root), "utf8"));

test("both reviewed passages match actual source images and preserve question/answer contents", async () => {
  for (const reviewed of reviewedPassages) {
    const detail = await readDetail(reviewed);
    const questionsBefore = structuredClone(detail.items.map(({item_id, item_key, question, choices, answer}) => ({item_id, item_key, question, choices, answer})));
    for (const cleanup of reviewed.choice_cleanups || []) questionsBefore.find(item => Number(item.item_id) === cleanup.item_id).choices[cleanup.index] = cleanup.corrected;
    const image = await readFile(new URL(`public/assets/${reviewed.bank_id}/${reviewed.image_path}`, root));
    applyReviewedPassage(detail, reviewed, hashText(image));
    assert.equal(detail.context.study_aid_status.passage_translation, "ready");
    assert.equal(detail.context.passage_translation_source.passage_sha256, hashText(detail.context.passage));
    assert.equal(detail.context.passage_source.image_sha256, hashText(image));
    assert.deepEqual(detail.items.map(({item_id, item_key, question, choices, answer}) => ({item_id, item_key, question, choices, answer})), questionsBefore);
    assert.equal(applyReviewedPassage(detail, reviewed, hashText(image)), false, "repeated review is idempotent");
  }
});

test("Part 6 cleans only the three image-verified option suffixes and preserves translations", async () => {
  const reviewed = reviewedPassages.find(value => value.part === 6);
  const detail = await readDetail(reviewed);
  for (const cleanup of reviewed.choice_cleanups) detail.items.find(item => Number(item.item_id) === cleanup.item_id).choices[cleanup.index] = cleanup.expected;
  const translations = detail.items.map(item => item.choice_translations);
  applyReviewedPassage(detail, reviewed, reviewed.image_sha256);
  assert.equal(detail.items[0].choices[0], "garments");
  assert.equal(detail.items[1].choices[1], "keep");
  assert.equal(detail.items[3].choices[3], "both");
  assert.deepEqual(detail.items.map(item => item.choice_translations), translations);
  assert.equal(applyReviewedPassage(detail, reviewed, reviewed.image_sha256), false);
  detail.items[0].choices[0] = "different word";
  const before = JSON.stringify(detail);
  assert.throws(() => applyReviewedPassage(detail, reviewed, reviewed.image_sha256), /choice cleanup no longer matches/);
  assert.equal(JSON.stringify(detail), before);
});

test("Part 6 keeps four single blank markers and does not reveal completed answers", () => {
  const reviewed = reviewedPassages.find(value => value.part === 6);
  const rendered = reviewed.passage.replace(/[“\"]?\b(1(?:3[1-9]|4[0-6]))\b\.?/g, "【$1】 ______ ");
  for (const id of reviewed.item_ids) {
    assert.equal([...rendered.matchAll(new RegExp(`【${id}】`, "g"))].length, 1);
    assert.equal([...reviewed.passage_translation.matchAll(new RegExp(`【${id}】`, "g"))].length, 1);
  }
  assert.equal([...rendered.matchAll(/______/g)].length, 4);
  assert.doesNotMatch(rendered, /【【|_{7,}|_{2,}\s+_{2,}/);
  assert.doesNotMatch(reviewed.passage, /vacations|to keep|Try whale watching|Or, if you prefer/);
  assert.doesNotMatch(reviewed.passage_translation, /观鲸|皮划艇|骑行|度假|如果/);
});

test("Part 7 retains the complete directory without OCR residue and repairs only option D", async () => {
  const reviewed = reviewedPassages.find(value => value.part === 7);
  const detail = await readDetail(reviewed);
  const item = detail.items.find(item => Number(item.item_id) === 148);
  const earlierOptions = item.choice_translations.slice(0, 3);
  applyReviewedPassage(detail, reviewed, reviewed.image_sha256);
  assert.deepEqual(item.choice_translations.slice(0, 3), earlierOptions);
  assert.equal(item.choice_translations[3], "D：四楼");
  assert.equal(item.study_aid_status.choice_translations, "ready");
  assert.match(detail.context.passage, /Athletic Equipment/);
  assert.doesNotMatch(detail.context.passage, /A thletic|LS3|147\.|148\./);
  for (const phrase of ["一楼", "二楼", "三楼", "四楼", "6 月 4 日", "美食广场", "运动器材"]) assert.ok(detail.context.passage_translation.includes(phrase));
});

test("source-image and option mismatches fail before any data is changed", async () => {
  const reviewed = reviewedPassages.find(value => value.part === 7);
  const detail = await readDetail(reviewed);
  const original = JSON.stringify(detail);
  assert.throws(() => applyReviewedPassage(detail, reviewed, "different-image"), /image hash mismatch/);
  assert.equal(JSON.stringify(detail), original);
  detail.items.find(item => Number(item.item_id) === 148).choices[3] = "On Level 5";
  const changedSource = JSON.stringify(detail);
  assert.throws(() => applyReviewedPassage(detail, reviewed, reviewed.image_sha256), /option no longer matches/);
  assert.equal(JSON.stringify(detail), changedSource);
});
