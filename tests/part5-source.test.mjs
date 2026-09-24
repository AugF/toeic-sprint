import test from "node:test";
import assert from "node:assert/strict";
import {auditPart5Item, normalizePart5Question, repairPart5Item, validateSourceEntry, sourceMediaRef, registerSourceAssets} from "../scripts/recover-part5-source.mjs";

const item = (question, choices=["slow", "slowest", "slowly", "slows"]) => ({question, choices, item_id:101, answer:"C"});

test("preserves meaningful hyphens and punctuation while recovering an existing OCR blank", () => {
  assert.equal(normalizePart5Question("The all-in-one tool is -... useful for long-term projects."), "The all-in-one tool is ------- useful for long-term projects.");
  assert.equal(normalizePart5Question("Ms. O'Neill will ---- act."), "Ms. O'Neill will ---- act.");
});

test("does not invent a missing blank or missing sentence", () => {
  const value = "Sales of the Moro Camera dropped by";
  assert.equal(normalizePart5Question(value), value);
  assert.ok(auditPart5Item(item(value), "official-2-test-1").includes("missing_blank"));
});

test("rejects a second embedded question even if four options and an answer exist", () => {
  const value = "Mr. Park ------- missed his flight because of 128. Rojo Kitchen Products is following its.. the severe traffic congestion this morning.";
  const result = repairPart5Item({...item(value), item_id:123}, "official-8-test-2");
  assert.equal(result.item.content_review_status, "source_required");
  assert.equal(result.item.study_aid_status.analysis, "pending");
  assert.equal(result.item.content_review.original_question, value);
  assert.deepEqual(result.item.choices, item(value).choices);
});

test("verified agenda repair records evidence and invalidates obsolete sentence aids", () => {
  const result = repairPart5Item(item("Ms. Iwata handed out copies of the ager that ------- had printed for the meeting."), "official-1-test-1");
  assert.match(result.item.question, /copies of the agenda that/);
  assert.equal(result.item.content_review.sources[0].location, "Example (14a), RD1_101");
  assert.equal(result.item.study_aid_status.question_translation, "pending");
});

test("source manifest requires explicit review and exact bank/question identity", () => {
  assert.throws(() => validateSourceEntry({bank_id:"official-1-test-1", item_id:101, source:"page.jpg"}, "/tmp"), /reviewed/);
  assert.throws(() => validateSourceEntry({bank_id:"official-1-test-1", item_id:101, reviewed:true, source:"../page.jpg"}, "/tmp"), /safe path/);
});

test("a clean sentence is not falsely claimed as source-verified", () => {
  const result = repairPart5Item(item("It is advisable to assign new tasks ------- to interns during the first month of training."), "official-8-test-2");
  assert.equal(result.item.content_review_status, undefined);
});

test("normalization and original OCR preservation are repeatable", () => {
  const original = {...item("Mr. Park - missed his flight because of 128. Rojo Kitchen Products is following its.. the severe traffic congestion this morning."), item_id:123};
  const once = repairPart5Item(original,"official-8-test-2").item;
  const twice = repairPart5Item(once,"official-8-test-2").item;
  assert.deepEqual(twice, once);
});

test("published crop paths resolve exactly once through the website bank prefix", () => {
  const entry = {bank_id:"official-1-test-1", item_id:101, crop:{x:50,y:100,width:800,height:400}};
  const ref = sourceMediaRef(entry, {width:2000,height:2800});
  assert.equal(`/assets/${entry.bank_id}/${ref.path}`, "/assets/official-1-test-1/part5-source/q101.jpg");
  assert.equal(ref.asset_key, "official-1-test-1/part5-source/q101.jpg");
  assert.equal(ref.exists, true);
  assert.equal(ref.width, 800);
  assert.equal(ref.source_width, 2000);
  assert.deepEqual(ref.crop, entry.crop);
});

test("source images are registered in the bank unit asset list without losing existing media", () => {
  const index = {bank_id:"official-1-test-1",units:[{unit_id:"p5-101",asset_refs:["existing.jpg"]}]};
  const ref = sourceMediaRef({bank_id:index.bank_id,item_id:101}, {width:2000,height:2800});
  registerSourceAssets(index,"p5-101",[ref]);
  registerSourceAssets(index,"p5-101",[ref]);
  assert.deepEqual(index.units[0].asset_refs,["existing.jpg","official-1-test-1/part5-source/q101.jpg"]);
  assert.throws(() => registerSourceAssets(index,"p5-102",[ref]), /Missing bank index entry/);
});
