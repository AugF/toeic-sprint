import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {applyPart5Reviews,hasCurrentPart5Review,part5SourceHash,reviewPart5Item,SCHEMA} from "../scripts/apply-part5-reviewed-aids.mjs";
import {repairPart5Item} from "../scripts/recover-part5-source.mjs";

const root=fileURLToPath(new URL("../public/data/banks",import.meta.url));
const item={item_id:101,question:"Please visit our store for ------- information.",choices:["addition","additional","additionally","add"],answer:"B",strategy:"old template",evidence:"fake location",user_custom_note:"keep"};
const row={bank_id:"official-1-test-1",item_id:101,expected_question:item.question,expected_choices:item.choices,expected_answer:"B",translation:"如需**更多的**信息，请光临本店。",grammar_point:"形容词修饰名词",question_type:"语法题",analysis:"information 为名词，需要形容词 additional 修饰；addition 是名词，additionally 是副词，add 是动词。",choice_translations:["增加（名词）","额外的","此外","增加（动词）"]};

test("review fills and highlights the complete sentence while preserving unrelated fields",()=>{
  const result=reviewPart5Item(item,row);
  assert.equal(result.completed_sentence,"Please visit our store for additional information.");
  assert.equal(result.user_custom_note,"keep");
  assert.deepEqual(result.choices,item.choices);assert.equal(result.answer,"B");
  assert.equal(result.evidence,undefined);assert.equal(result.strategy,undefined);
  assert.equal(hasCurrentPart5Review(result),true);
  for(const field of ["question_translation","choice_translations","analysis"]){
    assert.equal(result.study_aid_status[field],"ready");
    assert.equal(result.study_aid_source[field].source_sha256,part5SourceHash(result));
  }
});

test("review refuses stale questions, reordered options, uncertain sources and incomplete aids",()=>{
  for(const changed of [{...item,question:item.question+" Extra text."},{...item,choices:[...item.choices].reverse()},{...item,answer:"A"}])assert.throws(()=>reviewPart5Item(changed,row),/changed since review/);
  assert.throws(()=>reviewPart5Item({...item,content_review_status:"source_required"},row),/unresolved source/);
  assert.throws(()=>reviewPart5Item({...item,answer_review_status:"pending"},row),/unresolved source/);
  assert.throws(()=>reviewPart5Item(item,{...row,translation:"只是中文，没有答案强调"}),/emphasize/);
  assert.throws(()=>reviewPart5Item(item,{...row,choice_translations:["增加"]}),/four option meanings/);
});

test("stray-number cleanup cannot insert or delete any other word",()=>{
  const dirty={...item,question:"Please visit 118 our store for ------- information."};
  const correction={...row,expected_question:dirty.question,corrected_question:item.question,correction:{method:"reviewed_stray_number_removal",removed_number:"118"}};
  const result=reviewPart5Item(dirty,correction);
  assert.equal(result.question,item.question);assert.equal(result.content_review.original_question,dirty.question);
  assert.throws(()=>reviewPart5Item(dirty,{...correction,corrected_question:"Please visit our new store for ------- information."}),/only the reviewed isolated number/);
  assert.throws(()=>reviewPart5Item(dirty,{...correction,correction:{...correction.correction,removed_number:"18"}}),/only the reviewed isolated number/);
});

test("re-running OCR audit preserves current human review but not changed source text",()=>{
  const reviewed=reviewPart5Item(item,row);
  assert.deepEqual(repairPart5Item(reviewed,"official-1-test-1").item,reviewed);
  const changed={...reviewed,question:"Please visit our store for information."};
  assert.equal(hasCurrentPart5Review(changed),false);
  assert.equal(repairPart5Item(changed,"official-1-test-1").item.study_aid_status.question_translation,"pending");
});

test("source-required text can only be restored with exact-input, reviewed references",()=>{
  const dirty={...item,question:"Please visit our store for ------- inform",choices:["addition 9",...item.choices.slice(1)],content_review_status:"source_required",content_review_issues:["truncated"]};
  const fix={...row,expected_question:dirty.question,expected_choices:dirty.choices,corrected_question:item.question,corrected_choices:item.choices,correction:{method:"cross_reference_text_review",reviewed:true,sources:[{url:"https://example.org/reference.pdf",location:"Question 101"}]}};
  const repaired=reviewPart5Item(dirty,fix);
  assert.equal(repaired.content_review_status,"text_corrected_with_reference");
  assert.equal(repaired.content_review_issues,undefined);
  assert.equal(repaired.content_review.original_question,dirty.question);
  assert.deepEqual(repaired.content_review.original_choices,dirty.choices);
  assert.equal(repaired.answer,dirty.answer);
  assert.throws(()=>reviewPart5Item(dirty,{...fix,correction:{...fix.correction,reviewed:false}}),/reviewed source references|unresolved source/);
  assert.throws(()=>reviewPart5Item({...dirty,answer_review_status:"pending"},fix),/unresolved source/);
});

test("batch preflight fails before any file changes",()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"part5-review-test-"));
  try{
    const dataRoot=path.join(temp,"data"),reviewRoot=path.join(temp,"reviews");
    fs.mkdirSync(path.join(dataRoot,"official-1-test-1/units"),{recursive:true});fs.mkdirSync(reviewRoot);
    const file=path.join(dataRoot,"official-1-test-1/units/p5-101.json"),original=JSON.stringify({bank_id:"official-1-test-1",unit_id:"p5-101",part:5,context:{},items:[item]});fs.writeFileSync(file,original);
    fs.writeFileSync(path.join(reviewRoot,"part5-fixture-reviewed.json"),JSON.stringify({schema_version:SCHEMA,reviews:[row,{...row,item_id:102}]}));
    assert.throws(()=>applyPart5Reviews({dataRoot,reviewRoot,write:true}),/nothing written/);
    assert.equal(fs.readFileSync(file,"utf8"),original);
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

test("all curated Part 5 batches remain aligned with the published questions and are idempotent",()=>{
  const result=applyPart5Reviews({dataRoot:root});
  assert.ok(result.reviewed>=143);
  assert.equal(result.changed,0);
});

test("all 30 default-bank Part 5 questions have complete questions, answers and reviewed aids",()=>{
  for(let id=101;id<=130;id++){
    const item=JSON.parse(fs.readFileSync(path.join(root,`official-1-test-1/units/p5-${id}.json`))).items[0];
    assert.notEqual(item.content_review_status,"source_required",`Question ${id}`);
    assert.equal((item.question.match(/[-_—]{2,}/g)||[]).length,1);
    assert.equal(item.choices.length,4);assert.match(item.answer,/^[ABCD]$/);
    assert.equal(item.study_aid_status.question_translation,"ready");
    assert.equal(item.study_aid_status.analysis,"ready");
    assert.equal(item.study_aid_status.choice_translations,"ready");
    assert.match(item.question_translation,/\*\*[^*]+\*\*/);
    assert.doesNotMatch(item.question,/ting\. two|are : should|shake this year|expenses ‘in Seoul|consumers\.\s*1\d{2}/);
  }
});

test("Official 1 and 2 both tests have all 30 complete Part 5 questions with current aids",()=>{
  for(const bank of ["official-1-test-1","official-1-test-2","official-2-test-1","official-2-test-2"]){
    for(let id=101;id<=130;id++){
      const item=JSON.parse(fs.readFileSync(path.join(root,`${bank}/units/p5-${id}.json`))).items[0];
      assert.notEqual(item.content_review_status,"source_required",`${bank}/${id}`);
      assert.equal((item.question.match(/[-_—]{2,}/g)||[]).length,1);
      assert.match(item.question,/[.!?][’'"]?$/);
      for(const field of ["question_translation","analysis","choice_translations"])assert.equal(item.study_aid_status[field],"ready",`${bank}/${id}/${field}`);
      assert.equal(item.choice_translations.length,4);
      assert.match(item.question_translation,/\*\*[^*]+\*\*/);
    }
  }
});

test("a missing middle verb is restored from references without changing the answer",()=>{
  const item=JSON.parse(fs.readFileSync(path.join(root,"official-8-test-1/units/p5-116.json"))).items[0];
  assert.match(item.question,/it should cause ---- traffic problems\.$/);
  assert.equal(item.completed_sentence,"Although construction will begin on Reese-Decker Bridge tomorrow, it should cause minimal traffic problems.");
  assert.equal(item.answer,"A");
  assert.equal(item.choices[0],"minimal");
  assert.ok(item.content_review.correction.sources.length>=2);
});
