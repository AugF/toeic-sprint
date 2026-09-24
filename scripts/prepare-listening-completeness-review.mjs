#!/usr/bin/env node
// Assemble locally reviewed audio candidates and their reviewed translations.
// Raw ASR windows stay in ignored outputs, never in public website resources.
import {readFile,writeFile} from "node:fs/promises";
import {applyListeningCompletenessReview} from "./apply-listening-completeness-review.mjs";

const root=new URL("../",import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(`outputs/${name}`,root),"utf8"));
const {fixes}=await read("listening-completeness-fixes.json");
const translations={...await read("listening-completeness-zh-a.json"),...await read("listening-completeness-zh-b.json")};
const manifest={schema_version:"listening_completeness_review_v1",reviews:fixes.map(fix=>({
  bank_id:fix.bank_id,unit_id:fix.unit_id,
  previous_transcript_sha256:fix.previous_transcript_sha256,
  audio_sha256:fix.audio_sha256,transcript:fix.transcript,
  translation:translations[`${fix.bank_id}/${fix.unit_id}`],
  evidence:{method:fix.method,audio_duration_ms:fix.metrics.audio_duration_ms,notes:fix.notes,
    windows:fix.evidence.map(window=>({start_ms:Math.round(window.start_seconds*1000),end_ms:Math.round(window.end_seconds*1000),raw:window.recognized_text})),
  },
}))};
const result=await applyListeningCompletenessReview(manifest,{write:process.argv.includes("--write")});
await writeFile(new URL("outputs/listening-completeness-reviewed.json",root),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
