#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

export const SCHEMA="part5_reviewed_aids_v2";
const root=fileURLToPath(new URL("../",import.meta.url));
const normalized=text=>String(text).replace(/[’‘]/g,"'").replace(/[-_—]{2,}/g,"<blank>").replace(/\s+/g," ").trim();
export const part5SourceHash=item=>createHash("sha256").update(JSON.stringify([normalized(item.question),item.choices,item.answer])).digest("hex");
export const hasCurrentPart5Review=item=>item.part5_review?.schema_version===SCHEMA&&item.part5_review?.source_sha256===part5SourceHash(item);

export function reviewPart5Item(item,row){
  if(item.item_id!==row.item_id||item.question!==row.expected_question||JSON.stringify(item.choices)!==JSON.stringify(row.expected_choices)||item.answer!==row.expected_answer)throw new Error("question, choices or answer changed since review");
  if(!/^[ABCD]$/.test(item.answer)||item.choices?.length!==4)throw new Error("invalid answer or choices");
  const referenced=row.correction?.method==="cross_reference_text_review"&&row.correction?.reviewed===true&&row.correction?.sources?.length>0&&row.correction.sources.every(source=>/^https:\/\//.test(source.url)&&typeof source.location==="string"&&source.location.length>0);
  if(row.corrected_choices&&!referenced)throw new Error("option corrections need reviewed source references");
  if((item.content_review_status==="source_required"&&!referenced)||item.answer_review_status==="pending")throw new Error("unresolved source or answer cannot be blessed by translation");
  const next=structuredClone(item);
  if(referenced&&(row.corrected_question||row.corrected_choices)){
    next.question=row.corrected_question||item.question;
    next.choices=row.corrected_choices||item.choices;
    if(next.choices.length!==4||next.choices.some(choice=>typeof choice!=="string"||!choice.trim()))throw new Error("referenced correction needs all four options");
    next.content_review={...next.content_review,original_question:next.content_review?.original_question??item.question,original_choices:next.content_review?.original_choices??item.choices,correction:row.correction};
    next.content_review_status="text_corrected_with_reference";
    delete next.content_review_issues;
  }else if(row.corrected_question){
    const correction=row.correction;
    if(correction?.method!=="reviewed_stray_number_removal"||!/^\d{1,3}$/.test(correction.removed_number))throw new Error("unsupported text correction");
    const target=new RegExp(`\\b${correction.removed_number}\\b`,"g");
    if([...item.question.matchAll(target)].length!==1||item.question.replace(target,"").replace(/\s+/g," ").trim()!==row.corrected_question)throw new Error("stray number correction must remove only the reviewed isolated number");
    next.question=row.corrected_question;
    next.content_review={...next.content_review,original_question:next.content_review?.original_question??item.question,original_choices:next.content_review?.original_choices??item.choices,correction};
    next.content_review_status="text_corrected_by_review";
  }
  if((next.question.match(/[-_—]{2,}/g)||[]).length!==1||!/[.!?][’'"]?$/.test(next.question))throw new Error("reviewed question must be complete and contain one blank");
  for(const field of ["translation","question_type","analysis"]){if(typeof row[field]!=="string"||!/[\u3400-\u9fff]/.test(row[field]))throw new Error(`missing Chinese ${field}`)}
  if(typeof row.grammar_point!=="string"||!row.grammar_point.trim())throw new Error("missing specific grammar point");
  if(!/\*\*[^*]+\*\*/.test(row.translation)||/[-_—]{2,}|<blank>|中文辅助|离线预处理/.test(row.translation))throw new Error("translation must fill the sentence and emphasize the answer");
  if(!Array.isArray(row.choice_translations)||row.choice_translations.length!==4||row.choice_translations.some(text=>typeof text!=="string"||!/[\u3400-\u9fff]/.test(text)))throw new Error("all four option meanings are required in original order");
  if(/该项同时满足|其余选项至少|该项的词性或动词形态|原文依据：将/.test(row.analysis))throw new Error("generic template is not a reviewed explanation");
  const sourceHash=part5SourceHash(next);
  if(next.content_review){
    next.content_review.text_sha256=createHash("sha256").update(JSON.stringify({question:next.question,choices:next.choices})).digest("hex");
    next.content_review.last_review_pipeline=SCHEMA;
  }
  Object.assign(next,{
    completed_sentence:next.question.replace(/[-_—]{2,}/,next.choices["ABCD".indexOf(next.answer)]),
    question_translation:row.translation,question_type:row.question_type,grammar_point:row.grammar_point,
    answer_explain:row.analysis,choice_translations:row.choice_translations,
    explanation_structured:{answer:next.answer,question_type:row.question_type,grammar_point:row.grammar_point,analysis:row.analysis},
    study_aid_status:{...next.study_aid_status,question_translation:"ready",choice_translations:"ready",analysis:"ready"},
    study_aid_source:{...next.study_aid_source,...Object.fromEntries(["question_translation","choice_translations","analysis"].map(field=>[field,{method:"reviewed_complete_sentence_and_options",source_sha256:sourceHash}]))},
    part5_review:{schema_version:SCHEMA,source_sha256:sourceHash,method:"manual_sentence_grammar_and_option_review"},
  });
  // Part 5 has sentence-level grammar explanations, not a fabricated passage
  // location or generic strategies from a previous OCR-derived answer.
  delete next.evidence;delete next.strategy;
  return next;
}

export function applyPart5Reviews({dataRoot=path.join(root,"public/data/banks"),reviewRoot=path.join(root,"scripts/reviews"),write=false}={}){
  const planned=[],failures=[],seen=new Set();
  const manifests=fs.readdirSync(reviewRoot).filter(name=>/^part5-.*-reviewed\.json$/.test(name)).sort();
  for(const name of manifests){
    const manifest=JSON.parse(fs.readFileSync(path.join(reviewRoot,name),"utf8"));
    if(manifest.schema_version!==SCHEMA)throw new Error(`invalid manifest schema: ${name}`);
    for(const row of manifest.reviews){
      const key=`${row.bank_id}/${row.item_id}`;
      try{
        if(!/^official-\d+-test-[12]$/.test(row.bank_id)||!Number.isInteger(row.item_id)||row.item_id<101||row.item_id>130)throw new Error("invalid review identity");
        if(seen.has(key))throw new Error("duplicate review");seen.add(key);
        const file=path.join(dataRoot,row.bank_id,"units",`p5-${row.item_id}.json`);
        const original=fs.readFileSync(file,"utf8"),detail=JSON.parse(original),item=detail.items?.[0];
        if(detail.bank_id!==row.bank_id||detail.part!==5||detail.unit_id!==`p5-${row.item_id}`||detail.items.length!==1)throw new Error("detail identity mismatch");
        // A reviewed stray-number cleanup is idempotent without weakening the
        // full original-input check for unrelated subsequent edits.
        const alreadyCorrected=(row.corrected_question||row.corrected_choices)&&item.question===(row.corrected_question||row.expected_question)&&JSON.stringify(item.choices)===JSON.stringify(row.corrected_choices||row.expected_choices)&&hasCurrentPart5Review(item);
        const expected=alreadyCorrected?{...row,expected_question:item.question,expected_choices:item.choices,corrected_question:undefined,corrected_choices:undefined}:row;
        detail.items[0]=reviewPart5Item(item,expected);
        delete detail.context.content_translation;
        planned.push({key,file,original,output:JSON.stringify(detail,null,2)+"\n"});
      }catch(error){failures.push(`${key}: ${error.message}`)}
    }
  }
  if(failures.length)throw new Error(`Review preflight failed; nothing written:\n${failures.join("\n")}`);
  const changed=planned.filter(row=>row.original!==row.output);
  if(write){
    for(const row of planned)if(fs.readFileSync(row.file,"utf8")!==row.original)throw new Error(`Target changed: ${row.key}`);
    for(const row of changed)fs.writeFileSync(row.file,row.output);
  }
  return {reviewed:planned.length,changed:changed.length,write,keys:changed.map(row=>row.key)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(applyPart5Reviews({write:process.argv.includes("--write")}),null,2));
