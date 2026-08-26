#!/usr/bin/env node

/** Reuse a previously validated translation after deterministic English cleanup.
 *
 * This is intentionally narrow: the old English must become byte-for-byte
 * identical to the current transcript after sentenceLines(). Only a detached
 * visual-reference line may be removed from the matching Chinese text.
 */

import {createHash} from "node:crypto";
import {readFile,readdir,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sentenceLines} from "./rebuild-listening-transcripts.mjs";
import {isCurrentTranslation,validateTranslation} from "./translate-listening-transcripts-ollama.mjs";

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const currentRoot=path.join(projectRoot,"public/data/banks");
const backupRoot=path.join(projectRoot,"pages-dist/data/banks");
const SCHEMA="listening_translation_v2";
const sha=value=>createHash("sha256").update(value).digest("hex");

async function atomicJson(file,value){const temporary=`${file}.tmp-${process.pid}-${Date.now()}`;await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`);await rename(temporary,file)}

async function main(){
  let pending=0,migrated=0,skipped=[];
  for(const bank of (await readdir(currentRoot)).sort()){
    const unitRoot=path.join(currentRoot,bank,"units");
    for(const name of (await readdir(unitRoot)).filter(value=>value.endsWith(".json")).sort()){
      const file=path.join(unitRoot,name),detail=JSON.parse(await readFile(file,"utf8"));
      if(detail.part<3||detail.part>4||isCurrentTranslation(detail))continue;
      pending++;
      try{
        const backup=JSON.parse(await readFile(path.join(backupRoot,bank,"units",name),"utf8"));
        const oldEnglish=backup.context?.transcript||"",currentEnglish=detail.context?.transcript||"";
        if(sentenceLines(oldEnglish)!==currentEnglish)throw new Error("English differs beyond deterministic display cleanup");
        let lines=String(backup.context?.transcript_translation||"").split("\n").map(value=>value.trim()).filter(Boolean);
        const firstOldLine=String(oldEnglish).split("\n")[0]||"";
        if(firstOldLine&&sentenceLines(firstOldLine)==="")lines=lines.slice(1);
        lines=validateTranslation(currentEnglish,lines,detail.part);
        detail.context.transcript_translation=lines.join("\n");
        detail.context.transcript_translation_source={schema_version:SCHEMA,method:"deterministic/display_cleanup_migration",transcript_sha256:sha(currentEnglish)};
        await atomicJson(file,detail);migrated++;
      }catch(error){skipped.push(`${bank}/${detail.unit_id}: ${error.message}`)}
    }
  }
  console.log(JSON.stringify({pending,migrated,skipped:skipped.length,samples:skipped.slice(0,20)},null,2));
  if(skipped.length)process.exitCode=1;
}

await main();
