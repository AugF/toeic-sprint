import fs from "node:fs";
const path=process.argv[2]||new URL("../../toeic_listening_reading_banks/official_11/test_1/question.json",import.meta.url);
const data=JSON.parse(fs.readFileSync(path,"utf8"));
const failures=[];let checked=0;
const valid=(value,label,allowNonChinese=false)=>{checked++;const text=Array.isArray(value)?value.join(""):value||"";if(!text||(!allowNonChinese&&!/\p{Script=Han}/u.test(text))||text.includes("本段听力围绕")||text.includes("本文围绕"))failures.push(label)};
for(const p of data.parts)for(const g of p.questions){
 if(p.part<=4)valid(g.transcript_translation,`Part ${p.part} group ${g.id}: transcript_translation`);
 if(p.part>=6)valid(g.passage_translation,`Part ${p.part} group ${g.id}: passage_translation`);
 if(p.part===2){valid(g.question_translation,`Part 2 q${g.id}: question_translation`);valid(g.choice_translations,`Part 2 q${g.id}: choice_translations`)}
 for(const q of g.items||[g]){
  if(p.part>=3)valid(q.choice_translations,`Part ${p.part} q${q.id}: choice_translations`,q.choices.every((x)=>!/[A-Za-z]/.test(x)));
  if(p.part>=3&&q.question)valid(q.question_translation,`Part ${p.part} q${q.id}: question_translation`);
 }
}
if(failures.length){console.error(`Translation validation failed: ${failures.length}/${checked}`);for(const x of failures)console.error(`- ${x}`);process.exit(1)}
console.log(`Translation validation passed: ${checked} required fields`);
