import test from "node:test";
import assert from "node:assert/strict";
import {invalidateChangedReadingAids, supportedEvidence, usableTranslation, usableAnalysis} from "../scripts/reading-study-aids.mjs";
import {restoreReadingAids} from "../scripts/restore-reading-study-aids.mjs";

const unit = () => ({context: {passage: "Visit our store on Friday.", passage_translation: "请周五来店。"}, items: [{item_id: 147, question: "When should customers visit?", question_translation: "顾客应该何时来店？", choices: ["Friday", "Monday", "Tuesday", "Wednesday"], choice_translations: ["周五", "周一", "周二", "周三"], answer: "A", answer_explain: "通知明确邀请顾客在周五到店，因此应选择 A。", evidence: "参考原文第 1 段：Visit our store on Friday."}]});

test("a repeated OCR run and whitespace-only wrapping preserve all aids", () => {
  const previous = unit(), current = structuredClone(previous);
  current.context.passage = "Visit our store\non Friday.";
  invalidateChangedReadingAids(current, previous);
  assert.equal(current.context.passage_translation, previous.context.passage_translation);
  assert.equal(current.items[0].answer_explain, previous.items[0].answer_explain);
});

test("a changed passage invalidates analysis but preserves independent question and choice translations", () => {
  const previous = unit(), current = structuredClone(previous);
  current.context.passage = "Visit our store on Monday.";
  invalidateChangedReadingAids(current, previous);
  assert.equal(current.context.passage_translation, undefined);
  assert.equal(current.items[0].answer_explain, undefined);
  assert.equal(current.items[0].question_translation, previous.items[0].question_translation);
  assert.deepEqual(current.items[0].choice_translations, previous.items[0].choice_translations);
});

test("reordered choices do not inherit a translation from the previous index", () => {
  const previous = unit(), current = structuredClone(previous);
  current.items[0].choices = ["Monday", "Friday", "Tuesday", "Wednesday"];
  invalidateChangedReadingAids(current, previous);
  assert.deepEqual(current.items[0].choice_translations, ["", "", "周二", "周三"]);
  assert.equal(current.items[0].answer_explain, undefined);
});

test("restoration matches fields independently and refuses changed-choice analyses", () => {
  const previous = unit(), current = unit();
  delete current.items[0].question_translation;
  delete current.items[0].choice_translations;
  delete current.items[0].answer_explain;
  current.items[0].choices[3] = "Saturday";
  const counts = restoreReadingAids(current, previous);
  assert.equal(counts.question_translations, 1);
  assert.equal(counts.choice_translations, 3);
  assert.deepEqual(current.items[0].choice_translations, ["周五", "周一", "周二", ""]);
  assert.equal(current.items[0].study_aid_status.analysis, "pending");
  assert.equal(current.items[0].answer_explain, undefined);
});

test("analysis restoration requires the passage and answer as well as the question and choices", () => {
  for (const change of [current => current.context.passage = "Visit our store on Monday.", current => current.items[0].answer = "B"]) {
    const previous = unit(), current = unit();
    delete current.items[0].answer_explain;
    change(current);
    assert.equal(restoreReadingAids(current, previous).analyses, 0);
  }
  const previous = unit(), current = unit();
  delete current.items[0].answer_explain;
  assert.equal(restoreReadingAids(current, previous).analyses, 1);
});

test("glossed English, OCR placeholders, mismatched answer claims and generic rationales are not complete aids", () => {
  assert.equal(usableTranslation("中文辅助（离线预处理）：where（哪里）"), false);
  assert.equal(usableTranslation("顾客 customer（顾客）"), false);
  assert.equal(usableTranslation("[原文 OCR 不清]"), false);
  assert.equal(usableTranslation("请周五来店。"), true);
  assert.equal(usableAnalysis("该项既满足空格处的语法结构，也保持前后语义、指代或逻辑衔接。正确答案：A。", "A"), false);
  assert.equal(usableAnalysis("原文说明门店仅在周五开放。正确答案：B。", "A"), false);
});

test("recovery is idempotent and records pending gaps without fabricating content", () => {
  const previous = unit(), current = unit();
  delete current.items[0].question_translation;
  restoreReadingAids(current, previous);
  const first = structuredClone(current);
  const second = restoreReadingAids(current, previous);
  assert.deepEqual(current, first);
  assert.equal(second.question_translations, 0);
});

test("header and URL matches are not evidence for an unrelated explanation", () => {
  assert.equal(supportedEvidence("参考原文第 1 段第 1 句：Commemorations Gifts", "is 后接 celebrating 构成现在进行时。", "Commemorations Gifts\nIs someone you know celebrating an important birthday?"), "");
  assert.equal(supportedEvidence("参考原文第 2 段第 1 句：Visit our store on Friday.", "Visit our store on Friday 表示周五来店。", "Visit our store on Friday."), "原文片段：Visit our store on Friday.");
});
