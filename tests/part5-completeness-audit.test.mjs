import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {auditPart5Completeness,part5SourceHash,applyConfirmedSourceBlock,CONFIRMED_SOURCE_BLOCKS,main} from '../scripts/audit-part5-completeness.mjs';
import {SCHEMA,part5SourceHash as aidSourceHash} from '../scripts/apply-part5-reviewed-aids.mjs';

const good=()=>({item_id:101,question:'The manager will ------- the office tomorrow.',choices:['visit','visitor','visiting','visited'],answer:'A'});
const badBridge=()=>({item_id:116,question:'Although construction will begin on Reese-Decker Bridge tomorrow, it should ---- traffic problems.',choices:['minimal','minimally','minimum','minimize'],answer:'A'});
const hasCode=(result,code)=>result.issues.some(issue=>issue.code===code);

test('a final period alone is not proof of whole-sentence completeness',()=>{
  assert.equal(auditPart5Completeness(good()).classification,'needs_verification');
  assert.equal(auditPart5Completeness(good(),{manuallyReviewed:true}).classification,'complete_readable');
});

test('missing/multiple blanks and incomplete ordered choices are definite damage',()=>{
  for(const [patch,code] of [
    [{question:'The manager will visit the office tomorrow.'},'missing_blank'],
    [{question:'The ------- will ------- the office tomorrow.'},'multiple_blanks'],
    [{choices:['visit','visitor']},'missing_options'],
    [{choices:null},'missing_options'],
    [{answer:''},'invalid_answer'],
    [{answer:'AB'},'invalid_answer'],
  ]){
    const result=auditPart5Completeness({...good(),...patch},{manuallyReviewed:true});
    assert.equal(result.classification,'definitely_damaged');assert.ok(hasCode(result,code));
  }
});

test('neighbour question IDs, OCR artifacts and damaged options remain blocking',()=>{
  for(const [patch,code] of [
    [{question:'The manager will ------- the office tomorrow. 102. The next item'},'neighbour_question_number'],
    [{question:'The manager | will ------- the office tomorrow.'},'ocr_debris'],
    [{choices:['visit 11','visitor','visiting','visited']},'option_contamination'],
  ])assert.ok(hasCode(auditPart5Completeness({...good(),...patch},{manuallyReviewed:true}),code));
});

test('review badges do not exempt known answer-filled syntax damage',()=>{
  const item=badBridge();item.part5_review={schema_version:SCHEMA,source_sha256:aidSourceHash(item)};
  const result=auditPart5Completeness(item,{bankId:'official-8-test-1'});
  assert.equal(result.current_aid_review,true);
  assert.equal(result.classification,'definitely_damaged');
  assert.ok(hasCode(result,'answer_filled_syntax_broken'));
  assert.ok(hasCode(result,'modal_missing_verb'));
});

test('real quantities/model numbers are not auto-deleted or blocked after text review',()=>{
  const item={...good(),question:'Model 481 can ------- large orders within 24 hours.',choices:['process','processing','processed','processes']};
  const result=auditPart5Completeness(item,{manuallyReviewed:true});
  assert.equal(result.classification,'complete_readable');assert.equal(result.question,item.question);
});

test('missing punctuation is uncertain; a sentence ending on an article is definitely truncated',()=>{
  assert.equal(auditPart5Completeness({...good(),question:'The manager will ------- the office tomorrow'},{manuallyReviewed:true}).classification,'needs_verification');
  assert.equal(auditPart5Completeness({...good(),question:'The manager will ------- the.'},{manuallyReviewed:true}).classification,'definitely_damaged');
});

test('exact-fragment observations do not blacklist corrected questions forever',()=>{
  const item={...badBridge(),question:'Although construction will begin on Reese-Decker Bridge tomorrow, it should cause ---- traffic problems.'};
  assert.equal(auditPart5Completeness(item,{bankId:'official-8-test-1',manuallyReviewed:true}).classification,'complete_readable');
  assert.equal(applyConfirmedSourceBlock(item,'official-8-test-1').matched,false);
});

test('audit never clears unresolved source status merely on format or translated aids',()=>{
  const item={...good(),content_review_status:'source_required'};
  item.part5_review={schema_version:SCHEMA,source_sha256:aidSourceHash(item)};
  assert.ok(hasCode(auditPart5Completeness(item,{manuallyReviewed:true}),'existing_source_review_unresolved'));
});

test('source blocking is pure, exact-hash pinned, idempotent and preserves the printed fields',()=>{
  const item=badBridge(),before=structuredClone(item),bank='official-8-test-1';
  assert.equal(part5SourceHash(item),CONFIRMED_SOURCE_BLOCKS[0].source_sha256);
  const result=applyConfirmedSourceBlock(item,bank);
  assert.deepEqual(item,before);assert.equal(result.changed,true);
  assert.equal(result.item.content_review_status,'source_required');assert.equal(result.item.answer_review_status,'pending');
  assert.equal(part5SourceHash(result.item),part5SourceHash(item));
  assert.equal(applyConfirmedSourceBlock(result.item,bank).changed,false);
  assert.equal(applyConfirmedSourceBlock(item,'official-8-test-2').matched,false);
  assert.equal(applyConfirmedSourceBlock({...item,answer:'D'},bank).matched,false);
  assert.equal(applyConfirmedSourceBlock({...item,choices:[...item.choices].reverse()},bank).matched,false);
});

test('CLI reuses human readability only for unchanged exact text and is read-only by default',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'part5-completeness-test-'));
  try{
    const bank='official-8-test-1',dataRoot=path.join(temp,'banks'),dir=path.join(dataRoot,bank,'units'),report=path.join(temp,'report.json');
    await mkdir(dir,{recursive:true});
    const file=path.join(dir,'p5-116.json'),item=badBridge(),unit={bank_id:bank,part:5,unit_id:'p5-116',items:[item]};
    const original=JSON.stringify(unit);await writeFile(file,original);
    const args=['--data-root',dataRoot,'--report',report];
    const first=await main([...args,'--record-manual-audit']);
    assert.equal(first.items[0].manual_full_sentence_review,true);assert.equal(await readFile(file,'utf8'),original);
    assert.equal((await main(args)).items[0].manual_full_sentence_review,true);
    await main([...args,'--write']);
    const blocked=JSON.parse(await readFile(file,'utf8')).items[0];assert.equal(blocked.content_review_status,'source_required');
    assert.equal((await main([...args,'--write'])).written_files.length,0);
    unit.items[0]={...item,question:item.question.replace('it should ----','it should cause ----')};await writeFile(file,JSON.stringify(unit));
    const corrected=await main(args);
    assert.equal(corrected.items[0].manual_full_sentence_review,false);
    assert.equal(corrected.items[0].classification,'needs_verification');
    assert.equal(corrected.source_blocks.length,0);
  }finally{await rm(temp,{recursive:true,force:true})}
});

test('committed baseline reproduces human readability without ignored outputs and never blesses changed input',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'part5-baseline-test-'));
  try{
    const bank='official-1-test-1',dataRoot=path.join(temp,'banks'),dir=path.join(dataRoot,bank,'units'),report=path.join(temp,'previously-absent-output.json'),baseline=path.join(temp,'baseline.json');
    const item=good(),file=path.join(dir,'p5-101.json'),unit={bank_id:bank,part:5,unit_id:'p5-101',items:[item]};
    await mkdir(dir,{recursive:true});await writeFile(file,JSON.stringify(unit));
    await writeFile(baseline,JSON.stringify({schema_version:'part5_completeness_baseline_v1',items:[{bank_id:bank,item_id:101,source_sha256:part5SourceHash(item),reviewed:true}]}));
    const args=['--data-root',dataRoot,'--report',report,'--baseline',baseline];
    await assert.rejects(readFile(report),{code:'ENOENT'});
    const first=await main(args);
    assert.equal(first.items[0].manual_full_sentence_review,true);assert.equal(first.items[0].classification,'complete_readable');
    unit.items[0].question='The manager will ------- the warehouse tomorrow.';await writeFile(file,JSON.stringify(unit));
    const changed=await main(args);
    assert.equal(changed.items[0].manual_full_sentence_review,false);assert.equal(changed.items[0].classification,'needs_verification');
    unit.items[0]=good();await writeFile(file,JSON.stringify(unit));
    // The latest output now contains the changed, unreviewed hash. It must
    // not erase the committed baseline when the original text is restored.
    assert.equal((await main(args)).items[0].classification,'complete_readable');
  }finally{await rm(temp,{recursive:true,force:true})}
});

test('repository baseline contains one exact reviewed source per original 720 questions',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../scripts/reviews/part5-completeness-baseline.json',import.meta.url),'utf8'));
  assert.equal(fixture.schema_version,'part5_completeness_baseline_v1');assert.equal(fixture.items.length,720);
  assert.equal(new Set(fixture.items.map(row=>`${row.bank_id}/${row.item_id}`)).size,720);
  for(const row of fixture.items){assert.equal(row.reviewed,true);assert.match(row.source_sha256,/^[a-f0-9]{64}$/)}
  assert.equal(fixture.items.find(row=>row.bank_id==='official-8-test-1'&&row.item_id===116).source_sha256,part5SourceHash(badBridge()));
});
