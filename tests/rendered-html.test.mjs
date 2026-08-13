import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const root=new URL("../",import.meta.url);
const read=(value)=>readFile(new URL(value,root),"utf8");

test("covers all 200 questions with priority metadata",async()=>{
  const bank=JSON.parse(await read("public/bank/question.json"));
  const units=bank.parts.flatMap(part=>part.questions);
  const items=units.flatMap(group=>group.items||[group]);
  assert.equal(bank.schema_version,"2.1");
  assert.equal(units.length,79);
  assert.equal(items.length,200);
  assert.ok(units.every(group=>["P1","P2","P3"].includes(group.priority?.level)));
  assert.ok(items.every(item=>["P1","P2","P3"].includes(item.priority?.level)));
  assert.deepEqual(Object.fromEntries(["P1","P2","P3"].map(level=>[level,units.filter(x=>x.priority.level===level).length])),{P1:32,P2:28,P3:19});
});

test("keeps official grouped sections intact and makes Part 5 training packs",async()=>{
  const bank=JSON.parse(await read("public/bank/question.json"));
  const counts=Object.fromEntries(bank.parts.map(part=>[part.part,part.questions.length]));
  assert.deepEqual(counts,{1:6,2:25,3:13,4:10,5:6,6:4,7:15});
  const part5=bank.parts.find(part=>part.part===5);
  assert.ok(part5.questions.every(group=>group.items.length===5));
  assert.equal(part5.questions[0].id,"101-105");
  assert.equal(part5.questions.at(-1).id,"126-130");
  assert.match(bank.priority_methodology.part5_note,/正式考试为独立题/);
});

test("renders priority drill controls in both app and static Pages entry",async()=>{
  const [page,css,pagesEntry,layout]=await Promise.all([read("app/page.tsx"),read("app/priority.css"),read("static-pages/main.tsx"),read("app/layout.tsx")]);
  assert.match(page,/P1 必刷/);
  assert.match(page,/priorityFilters/);
  assert.match(page,/优先级顺序/);
  assert.match(page,/第 \{groups\.length\?gi\+1:0\} \/ \{groups\.length\} \{asSet\?"套":"题"\}/);
  assert.match(css,/\.badge\.p1/);
  assert.match(css,/\.setRail/);
  assert.match(pagesEntry,/priority\.css/);
  assert.match(layout,/priority\.css/);
});
