import assert from "node:assert/strict";
import {after, before, test} from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createServer} from "vite";
import react from "@vitejs/plugin-react";
import {answerLabel, emphasisSegments, revealAnswers} from "../app/review-state.ts";

const q1 = {item_key: "bank/one/101", item_id: 101, question: "The old damaged OCR sentence.", choices: ["open", "opened", "opening", "opens"], answer: "B", priority: {level: "P1", score: 90}};
const q2 = {...q1, item_key: "bank/two/102", item_id: 102, answer: "D"};
let server, components;
before(async () => {
  server = await createServer({configFile: false, plugins: [react()], server: {middlewareMode: true, ws: false}, appType: "custom", optimizeDeps: {noDiscovery: true}});
  components = await server.ssrLoadModule("/app/page.tsx");
});
after(async () => {await server?.close();});

test("batch reveal grades the latest selections and leaves other pages unchanged", () => {
  const saved = {answers: {[q1.item_key]: "A", [q2.item_key]: "D", elsewhere: "A"}, wrong: [q2.item_key, "elsewhere"], stars: ["elsewhere"], revealed: ["elsewhere"]};
  const next = revealAnswers(saved, [q1, q2], true);
  assert.deepEqual(next.wrong.sort(), [q1.item_key, "elsewhere"].sort());
  assert.deepEqual(new Set(next.revealed), new Set(["elsewhere", q1.item_key, q2.item_key]));
  assert.deepEqual(next.answers, saved.answers);
  assert.deepEqual(next.stars, ["elsewhere"]);
  assert.deepEqual(saved.revealed, ["elsewhere"]);
  assert.deepEqual(revealAnswers(next, [q1], false).revealed, ["elsewhere", q2.item_key]);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next, "state survives browser storage serialization");
});

test("missing answers and unattempted questions do not get marked wrong", () => {
  const saved = {answers: {[q1.item_key]: "A"}, wrong: [], stars: [], revealed: []};
  assert.deepEqual(revealAnswers(saved, [{...q1, answer: ""}, q2], true).wrong, []);
  assert.equal(answerLabel({...q1, answer: " b "}), "B");
  assert.equal(answerLabel({...q1, choices: ["one", "two"], answer: "D"}), "");
});

test("known mismatched question and choices do not grade or expose an unreliable answer", () => {
  const item = {...q1, answer_review_status: "pending", study_aid_status: {analysis: "pending"}};
  assert.equal(answerLabel(item), "");
  const saved = {answers: {[item.item_key]: "A"}, wrong: [item.item_key], stars: [], revealed: []};
  assert.deepEqual(revealAnswers(saved, [item], true).wrong, []);
  const html = renderToStaticMarkup(React.createElement(components.QuestionBlock, {bankId: "official-5-test-1", item, part: 4, chosen: "A", showAnswer: true, showAnalysis: true, choose() {}}));
  assert.match(html, /题目与选项待原始材料核对/);
  assert.doesNotMatch(html, /正确答案：B|class="correct"|class="incorrect"|explain bad/);
});

test("answer emphasis is rendered as bold text without treating HTML as markup", () => {
  assert.deepEqual(emphasisSegments("已**完成**登记。"), [{text: "已", strong: false}, {text: "完成", strong: true}, {text: "登记。", strong: false}]);
  const html = renderToStaticMarkup(React.createElement(components.EmphasizedText, {text: "已**完成**登记 <img src=x onerror=alert(1)>"}));
  assert.match(html, /<strong>完成<\/strong>/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|onerror="/);
});

test("Part 5 can replace a damaged stem with its source image while retaining choices", () => {
  const item = {...q1, prefer_source_image: true, source_images: [{path: "part5-source/101.webp", exists: true}]};
  const html = renderToStaticMarkup(React.createElement(components.QuestionBlock, {bankId: "official-1-test-1", item, part: 5, chosen: "A", showAnswer: false, showAnalysis: false, choose() {}}));
  assert.match(html, /原题图片/);
  assert.match(html, /assets\/official-1-test-1\/part5-source\/101.webp/);
  assert.doesNotMatch(html, /old damaged OCR sentence/);
  assert.match(html, /class="selected"/);
  assert.doesNotMatch(html, /class="correct"|class="incorrect"|正确答案/);
  assert.match(html, /翻译题干/);
});

test("revealed answers are explicit even when explanations are closed", () => {
  const html = renderToStaticMarkup(React.createElement(components.QuestionBlock, {bankId: "official-1-test-1", item: q1, part: 5, chosen: "A", showAnswer: true, showAnalysis: false, choose() {}}));
  assert.match(html, /正确答案：B/);
  assert.match(html, /你的选择：A · 错误/);
  assert.match(html, /class="correct"/);
  assert.match(html, /class="incorrect"/);
});

test("missing analysis has a clear notice and partial translations retain labels", () => {
  const item = {...q1, answer_explain: "unverified placeholder", study_aid_status: {analysis: "pending", choice_translations: "partial"}, choice_translations: ["", "已开业", "", "营业"]};
  const html = renderToStaticMarkup(React.createElement(components.AnswerAnalysis, {item, part: 6, chosen: "A", answerVisible: true}));
  assert.match(html, /该题解析尚未补齐/);
  assert.doesNotMatch(html, /unverified placeholder/);
  assert.match(html, /B\. 已开业/);
  assert.match(html, /D\. 营业/);
  assert.doesNotMatch(html, /A\. 已开业/);
});

test("source-required questions without a local image give an explicit notice", () => {
  const html = renderToStaticMarkup(React.createElement(components.QuestionBlock, {bankId: "official-1-test-1", item: {...q1, content_review_status: "source_required"}, part: 5, showAnswer: false, showAnalysis: false, choose() {}}));
  assert.match(html, /题干存在识别问题，等待补齐原图/);
});

test("Part 6 cloze choices without a separate question have no question-translation button", () => {
  const html = renderToStaticMarkup(React.createElement(components.QuestionBlock, {bankId: "official-1-test-1", item: {...q1, question: ""}, part: 6, showAnswer: false, showAnalysis: false, choose() {}}));
  assert.doesNotMatch(html, /翻译题干/);
  assert.match(html, /<p>opened<\/p>/);
});

test("reading text view includes its own translation control and toggles the current translation only", () => {
  const props = {part: 7, text: "Staff meeting at noon.", translation: "员工会议于中午举行。", toggleTranslation() {}};
  const closed = renderToStaticMarkup(React.createElement(components.ReadingPassage, {...props, showTranslation: false}));
  assert.match(closed, /原文文字版/);
  assert.match(closed, /翻译原文/);
  assert.match(closed, /Staff meeting at noon/);
  assert.doesNotMatch(closed, /员工会议/);
  const open = renderToStaticMarkup(React.createElement(components.ReadingPassage, {...props, showTranslation: true}));
  assert.match(open, /隐藏中文/);
  assert.match(open, /员工会议于中午举行/);
  const missing = renderToStaticMarkup(React.createElement(components.ReadingPassage, {...props, translation: "", showTranslation: true}));
  assert.match(missing, /该篇原文翻译尚未补齐/);
  assert.doesNotMatch(missing, /员工会议/);
});
