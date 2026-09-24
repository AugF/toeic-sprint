import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {applyReviewedQuestionTranslation, normalizeQuestion, reviewedTranslations} from "../scripts/reviewed-listening-question-translations.mjs";

test("reviewed question translations require full matches and retain real existing Chinese", () => {
  const real = {question: "Who is the woman?", question_translation: "这位女士的身份是什么？"};
  assert.equal(applyReviewedQuestionTranslation(real).translated, false);
  assert.equal(real.question_translation, "这位女士的身份是什么？");
  const unrelated = {question: "Who is the woman? What does she want?", question_translation: "中文辅助: Who is the woman? What does she want?"};
  assert.equal(applyReviewedQuestionTranslation(unrelated).status, "pending");
  assert.equal(unrelated.question_translation, "中文辅助: Who is the woman? What does she want?");
});

test("reviewed mapping normalizes whitespace and quotation marks without editing the question", () => {
  const item = {question: " What   is the topic of today’s broadcast? ", question_translation: "中文辅助: What is the topic of today's broadcast?", answer: "D", choices: ["a", "b", "c", "d"]};
  const original = {question: item.question, answer: item.answer, choices: [...item.choices]};
  assert.equal(applyReviewedQuestionTranslation(item).translated, true);
  assert.equal(item.question_translation, "今天的广播主题是什么？");
  assert.equal(item.question_translation_source.source_sha256, createHash("sha256").update(normalizeQuestion(item.question)).digest("hex"));
  assert.deepEqual({question: item.question, answer: item.answer, choices: item.choices}, original);
  assert.equal(applyReviewedQuestionTranslation(item).changed, false, "rerunning should not rewrite the item");
  assert.equal(reviewedTranslations.size, 150);
});

test("two identified mismatches are quarantined without inventing replacement answers", () => {
  const item = {item_key: "official-5-test-1/p4-98-100/98", question: "What is the topic of the workshop?", question_translation: "这次培训的主题是什么？", answer: "D", choices: ["wrong source"]};
  applyReviewedQuestionTranslation(item);
  assert.equal(item.answer_review_status, "pending");
  assert.equal(item.study_aid_status.analysis, "pending");
  assert.equal(item.answer, "D");
  assert.deepEqual(item.choices, ["wrong source"]);
  const validNeighbor = {...item, item_key: "official-5-test-1/p4-98-100/100"};
  delete validNeighbor.answer_review_status;
  applyReviewedQuestionTranslation(validNeighbor);
  assert.equal(validNeighbor.answer_review_status, undefined);
});
