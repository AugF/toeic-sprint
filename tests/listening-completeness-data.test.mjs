import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {validatePublishedTranscript} from "../scripts/rebuild-listening-transcripts.mjs";
import {isCurrentTranslation} from "../scripts/translate-listening-transcripts-ollama.mjs";

const root=new URL("../public/data/banks/",import.meta.url);
const unit=async(bank,id)=>JSON.parse(await readFile(new URL(`${bank}/units/${id}.json`,root),"utf8"));

test("all 26 repaired excerpts retain reviewed English, Chinese and audio provenance",async()=>{
  let count=0;
  for(const bank of await readdir(root))for(const name of await readdir(new URL(`${bank}/units/`,root))){
    if(!name.startsWith("p4-"))continue;
    const detail=await unit(bank,name.slice(0,-5));
    if(!detail.context.transcript_completeness_review)continue;
    count++;
    assert.equal(validatePublishedTranscript(detail),true);
    assert.equal(isCurrentTranslation(detail),true);
    assert.ok(detail.context.transcript_source.metrics.words_per_second>=2);
    assert.ok(detail.context.transcript_completeness_review.windows.length>=2);
    assert.equal(detail.context.transcript_translation_source.method,"reviewed_translation_from_audio_transcript");
    assert.throws(()=>validatePublishedTranscript({...detail,context:{...detail.context,transcript:"A replacement fragment that should not pass a review. ".repeat(3)}}),/no longer matches/);
  }
  assert.equal(count,26);
});

test("default bank keeps the missing pharmacy, call-center and market-share openings",async()=>{
  const pharmacy=await unit("official-1-test-1","p4-74-76");
  assert.match(pharmacy.context.transcript,/Hello, this message is for Mr\. Lehman/);
  assert.match(pharmacy.context.transcript,/but unfortunately we ran out yesterday/);
  const meeting=await unit("official-1-test-1","p4-89-91");
  assert.match(meeting.context.transcript,/two additional customer service representatives/);
  const market=await unit("official-1-test-1","p4-98-100");
  assert.match(market.context.transcript,/Here's the breakdown/);
  assert.match(market.context.transcript,/They just surpassed us/);
  assert.match(market.context.transcript_translation,/刚刚超过了我们/);
});

test("missed final paragraph and middle negative sentence are preserved",async()=>{
  const art=await unit("official-3-test-2","p4-86-88");
  assert.match(art.context.transcript,/Tuesday and Wednesday/);
  const interview=await unit("official-10-test-1","p4-86-88");
  assert.match(interview.context.transcript,/He doesn't always agree to give interviews/);
});
