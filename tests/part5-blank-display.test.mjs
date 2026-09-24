import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {after, before, test} from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createServer} from "vite";
import react from "@vitejs/plugin-react";

let server, components;
before(async () => {
  server = await createServer({configFile: false, plugins: [react()], server: {middlewareMode: true, ws: false}, appType: "custom", optimizeDeps: {noDiscovery: true}});
  components = await server.ssrLoadModule("/app/page.tsx");
});
after(async () => {await server?.close();});

function renderQuestion(part, question) {
  const item = Object.freeze({item_key: "bank/p5-101/101", item_id: 101, question, choices: ["review", "reviewed", "reviewing", "reviews"], answer: "B", priority: {level: "P1", score: 90}});
  const html = renderToStaticMarkup(React.createElement(components.QuestionBlock, {bankId: "official-1-test-1", item, part, chosen: "A", showAnswer: false, showAnalysis: false, choose() {}}));
  assert.equal(item.question, question, "rendering must not change canonical source markers");
  return html;
}

test("Part 5 uses accessible fixed-width continuous underlines instead of visible marker runs", () => {
  for (const marker of ["-------", "--", "___", "__", "__________", "——", "—-", "_-—_"]) {
    const html = renderQuestion(5, `The manager ${marker} the report.`);
    assert.match(html, /The manager <span class="part5Blank" role="img" aria-label="填空"><\/span> the report\./);
    assert.doesNotMatch(html, /[-_—]{2,}/);
    assert.match(html, /class="selected"/);
    assert.doesNotMatch(html, /正确答案|class="correct"|class="incorrect"/);
    assert.match(html, />reviewed<\/p>/, "answer options remain unchanged");
  }
  const css = readFileSync(new URL("../app/priority.css", import.meta.url), "utf8");
  const blankRule = css.match(/\.questionBlock \.part5Blank\{([^}]+)\}/)?.[1];
  assert.ok(blankRule, "the blank must have a dedicated display rule");
  assert.match(blankRule, /display:inline-block;/);
  assert.match(blankRule, /(?:^|;)width:4ch;/);
  assert.match(blankRule, /border-bottom:1px solid currentColor;/);
  assert.match(blankRule, /color:inherit;/);
  assert.doesNotMatch(blankRule, /dashed|dotted/, "the underline must be continuous");
});

test("leading and multiple blanks render without changing real hyphens or punctuation", () => {
  const html = renderQuestion(5, "------- a well-known company, Ulrich-Ahn offers ___ services—not products.");
  assert.equal((html.match(/aria-label="填空"/g) || []).length, 2);
  assert.match(html, /a well-known company, Ulrich-Ahn offers/);
  assert.match(html, /services—not products\./);
});

test("other parts keep their literal markers and punctuation", () => {
  for (const part of [3, 4, 6, 7]) {
    const html = renderQuestion(part, "What does the notice mean by -------, --, —— or ___?");
    assert.match(html, /notice mean by -------, --, —— or ___\?/);
    assert.doesNotMatch(html, /class="part5Blank"/);
  }
});

test("all current Part 5 stems hide every supported source blank marker", () => {
  const root = new URL("../public/data/banks/", import.meta.url);
  let reviewedItems = 0, reviewedMarkers = 0;
  for (const bank of readdirSync(root, {withFileTypes: true}).filter(entry => entry.isDirectory())) {
    const units = new URL(`${bank.name}/units/`, root);
    for (const file of readdirSync(units).filter(name => /^p5-\d+\.json$/.test(name))) {
      const detail = JSON.parse(readFileSync(new URL(file, units), "utf8"));
      for (const item of detail.items) {
        const text = item.question || "";
        const markers = text.match(/[-_—]{2,}/g) || [];
        const html = renderToStaticMarkup(React.createElement(components.Part5QuestionText, {text}));
        assert.doesNotMatch(html, /[-_—]{2,}/, `${bank.name}/${file} leaks a source marker`);
        assert.equal((html.match(/aria-label="填空"/g) || []).length, markers.length, `${bank.name}/${file} blank count`);
        reviewedItems++;
        reviewedMarkers += markers.length;
      }
    }
  }
  assert.ok(reviewedItems >= 720, `expected the current 720-question Part 5 corpus, reviewed ${reviewedItems}`);
  assert.ok(reviewedMarkers > 0);
});

test("ordinary sentences and untrusted text are never treated as HTML", () => {
  const ordinary = renderQuestion(5, "A well-known store offers after-sales service.");
  assert.doesNotMatch(ordinary, /class="part5Blank"/);
  const html = renderQuestion(5, "The value ------- is <script>alert(1)</script>.");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
