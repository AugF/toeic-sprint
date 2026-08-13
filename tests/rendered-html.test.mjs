import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import test from "node:test";

const root=new URL("../",import.meta.url);
const read=(value)=>readFile(new URL(value,root),"utf8");

test("publishes 24 banks and 4,800 globally unique item references",async()=>{
  const catalog=JSON.parse(await read("public/data/catalog.json"));
  assert.equal(catalog.banks.length,24);
  assert.equal(catalog.totals.questions,4800);
  assert.equal(catalog.totals.unique_item_keys,4800);
  assert.equal(catalog.totals.missing_media_references,0);
  assert.ok(["P1","P2","P3"].every(level=>catalog.totals.priority_distribution[level]>0));
  const keys=new Set();
  for(const bank of catalog.banks){
    const index=JSON.parse(await read(`public/data/${bank.index_path}`));
    assert.equal(index.question_count,200);
    assert.equal(index.unit_count,103);
    for(const unit of index.units){
      assert.equal(unit.item_refs.length,unit.question_count);
      for(const ref of unit.item_refs){assert.ok(["P1","P2","P3"].includes(ref.priority.level));keys.add(ref.item_key)}
    }
  }
  assert.equal(keys.size,4800);
});

test("keeps shared official material in canonical details while Part 1, 2 and 5 stay single",async()=>{
  const index=JSON.parse(await read("public/data/banks/official-1-test-1/index.json"));
  assert.ok(index.units.filter(unit=>[1,2,5].includes(unit.part)).every(unit=>unit.question_count===1));
  assert.ok(index.units.filter(unit=>[3,4,6,7].includes(unit.part)).every(unit=>unit.question_count>=2));
  const detail=JSON.parse(await read("public/data/banks/official-1-test-1/units/p3-32-34.json"));
  assert.equal(detail.items.length,3);
  assert.ok(detail.context.audio_path.path.endsWith(".mp3"));
  assert.ok(detail.context.transcript);
});

test("renders multi-bank priority controls and lazy detail loading",async()=>{
  const [page,css,pagesEntry]=await Promise.all([read("app/page.tsx"),read("app/priority.css"),read("static-pages/main.tsx")]);
  assert.match(page,/24 套官方题库/);
  assert.match(page,/优先级单题刷/);
  assert.match(page,/fetchJson<UnitDetail>/);
  assert.match(page,/item_key/);
  assert.match(page,/展开同组另外/);
  assert.match(css,/\.globalPractice/);
  assert.match(css,/\.bankSelect/);
  assert.match(pagesEntry,/priority\.css/);
});

test("minimal web asset set contains all referenced media exactly once",async()=>{
  const catalog=JSON.parse(await read("public/data/catalog.json"));
  let refs=0;
  for(const bank of catalog.banks){
    const index=JSON.parse(await read(`public/data/${bank.index_path}`));
    refs+=new Set(index.units.flatMap(unit=>unit.asset_refs)).size;
  }
  const countFiles=async url=>{let count=0;for(const entry of await readdir(url,{withFileTypes:true})){count+=entry.isDirectory()?await countFiles(new URL(`${entry.name}/`,url)):1}return count};
  assert.equal(await countFiles(new URL("public/assets/",root)),refs);
});
