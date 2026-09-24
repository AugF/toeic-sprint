import assert from "node:assert/strict";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import test from "node:test";
import {applyReviewedAids,reviewedRows,sourceHash} from "../scripts/reviewed-part5-study-aids.mjs";

const root=fileURLToPath(new URL("../public/data/banks",import.meta.url));
test("reviewed Part 5 translations fill the complete sentence and highlight its answer",()=>{
  const result=applyReviewedAids(root);
  assert.deepEqual(result.source_mismatch,[]);
  assert.equal(result.applied.length,46);
  for(const {bank,row:[id]} of reviewedRows){
    const item=JSON.parse(fs.readFileSync(`${root}/${bank}/units/p5-${id}.json`)).items[0];
    assert.equal(item.study_aid_status.question_translation,"ready");
    assert.match(item.question_translation,/\*\*[^*]+\*\*/);
    assert.doesNotMatch(item.question_translation,/[-_—]{2,}|中文辅助|离线预处理/);
    assert.doesNotMatch(item.completed_sentence,/[-_—]{2,}/);
    assert.equal(item.study_aid_source.question_translation.source_sha256,sourceHash(item));
    assert.ok(item.completed_sentence.includes(item.choices["ABCD".indexOf(item.answer)]));
  }
});
