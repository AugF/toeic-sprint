#!/usr/bin/env node
import fs from "node:fs";

const sourcePath=process.argv[2];
if(!sourcePath)throw new Error("Usage: node validate-knowledge.mjs <question.enriched.json>");

const data=JSON.parse(fs.readFileSync(sourcePath,"utf8"));
const basic=new Set("about after all also answer any are because before best business call can company complete correct could day does find first get give good help information just know make many meeting more most need new next no not now number office one open other people place please product question right room same say see send service some store take that their them then there these they thing this time today too use very want week well what when where which who why will with work would year yes you your".split(" "));
const failures=[];
const stats={questions:0,knowledge:0,entries:0};
const normalize=value=>String(value||"").normalize("NFKC").replace(/[‘’]/g,"'").replace(/\s+/g," ").trim().toLowerCase();
const contains=(container,value)=>normalize(container).includes(normalize(value));

for(const part of data.parts||[])for(const group of part.questions||[]){
  const items=group.items||[group];
  const material=[group.transcript,group.passage,...items.flatMap(item=>[item.question,...(item.choices||[])])].filter(Boolean).join("\n");
  const materialPart=[3,4,6,7].includes(part.part);
  if(materialPart&&items.slice(1).some(item=>item.knowledge_v2))failures.push(`Part ${part.part} group ${group.id}: material knowledge must exist on the group only`);
  for(const item of items){
    stats.questions++;
    const knowledge=materialPart?group.knowledge_v2:item.knowledge_v2;
    if(!knowledge)continue; // Absence is intentional: never pad easy questions.
    if(materialPart&&item!==items[0])continue; // Validate shared material once, not once per question.
    stats.knowledge++;
    const expected=materialPart?"material":"question_context";
    if(knowledge.source_scope!==expected)failures.push(`Part ${part.part} q${item.id}: source_scope must be ${expected}`);
    const entries=[...(knowledge.vocabulary||[]).map(entry=>["term",entry]),...(knowledge.collocations||[]).map(entry=>["phrase",entry])];
    if(entries.length>4)failures.push(`Part ${part.part} q${item.id}: expected at most 4 entries`);
    if((knowledge.vocabulary||[]).length>2||(knowledge.collocations||[]).length>2)failures.push(`Part ${part.part} q${item.id}: max 2 entries per section`);
    const seen=new Set();
    for(const [key,entry] of entries){
      stats.entries++;
      const value=entry[key],identity=normalize(value),words=identity.match(/[a-z]+(?:['-][a-z]+)*/g)||[];
      if(!value||!entry.meaning||!/\p{Script=Han}/u.test(entry.meaning)||!entry.why||!/\p{Script=Han}/u.test(entry.why))failures.push(`Part ${part.part} q${item.id}: incomplete ${key}`);
      if(!entry.source_quote||!contains(material,entry.source_quote)||!contains(entry.source_quote,value))failures.push(`Part ${part.part} q${item.id}: unverifiable source_quote for ${value}`);
      if(!Number.isFinite(entry.confidence)||entry.confidence<.78||entry.confidence>1)failures.push(`Part ${part.part} q${item.id}: invalid confidence for ${value}`);
      if(key==="term"&&(words.length!==1||words.every(word=>basic.has(word))))failures.push(`Part ${part.part} q${item.id}: basic/invalid vocabulary ${value}`);
      if(key==="phrase"&&(words.length<2||words.length>6))failures.push(`Part ${part.part} q${item.id}: collocation must contain 2-6 words (${value})`);
      if(/出现在本题|正确(?:选项|答案|表达)|答案中|选项中/.test(`${entry.meaning}${entry.why}`))failures.push(`Part ${part.part} q${item.id}: answer-derived boilerplate for ${value}`);
      if(seen.has(identity))failures.push(`Part ${part.part} q${item.id}: duplicate ${value}`);else seen.add(identity);
    }
  }
}

if(failures.length){
  console.error(`Knowledge v2 validation failed (${failures.length} errors)`);
  console.error(failures.slice(0,100).join("\n"));
  if(failures.length>100)console.error(`… and ${failures.length-100} more`);
  process.exit(1);
}
console.log(`Knowledge v2 validation passed: ${stats.knowledge}/${stats.questions} questions/groups, ${stats.entries} entries; missing knowledge is allowed.`);
