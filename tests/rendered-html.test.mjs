import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {access,readFile,readdir} from "node:fs/promises";
import test from "node:test";
import "./knowledge-builder.test.mjs";

const root=new URL("../",import.meta.url);
const read=(value)=>readFile(new URL(value,root),"utf8");
const exists=async(value)=>access(value).then(()=>true,()=>false);
const execFileAsync=promisify(execFile);

test("publishes 24 banks and 4,800 globally unique item references",async()=>{
  const catalog=JSON.parse(await read("public/data/catalog.json"));
  assert.equal(catalog.banks.length,24);
  assert.equal(catalog.totals.questions,4800);
  assert.equal(catalog.totals.unique_item_keys,4800);
  assert.equal(catalog.totals.missing_media_references,0);
  assert.equal(catalog.banks.filter(bank=>!bank.enriched).length,0);
  assert.ok(catalog.banks.reduce((sum,bank)=>sum+(bank.quality?.missing_graphic_groups||0),0)>0);
  assert.ok(catalog.warnings.some(value=>value.includes("图表")));
  assert.ok(["P1","P2","P3"].every(level=>catalog.totals.priority_distribution[level]>0));
  const keys=new Set();
  let units=0,materialUnits=0,singleUnits=0;
  for(const bank of catalog.banks){
    const index=JSON.parse(await read(`public/data/${bank.index_path}`));
    assert.equal(index.question_count,200);
    assert.equal(index.unit_count,103);
    for(const unit of index.units){
      units++;
      if([3,4,6,7].includes(unit.part))materialUnits++;else singleUnits++;
      assert.equal(unit.item_refs.length,unit.question_count);
      assert.ok(["P1","P2","P3"].includes(unit.priority.level));
      for(const ref of unit.item_refs){assert.equal(ref.priority,undefined);keys.add(ref.item_key)}
    }
  }
  assert.equal(keys.size,4800);
  assert.equal(units,2472);
  assert.equal(materialUnits,1008);
  assert.equal(singleUnits,1464);
});

test("precomputes Chinese study aids and only publishes validated contextual knowledge",async()=>{
  const catalog=JSON.parse(await read("public/data/catalog.json"));
  let questions=0,choices=0,knowledgeCards=0;
  for(const bank of catalog.banks){
    const index=JSON.parse(await read(`public/data/${bank.index_path}`));
    for(const unit of index.units){
      const detail=JSON.parse(await read(`public/data/${unit.detail_path}`));
      const knowledgeValues=[detail.knowledge_accumulation,...detail.items.map(item=>item.knowledge_accumulation)].filter(Boolean);
      assert.ok(knowledgeValues.every(value=>value.schema_version==="2.0"),`${bank.bank_id}/${unit.unit_id} has legacy knowledge`);
      if([3,4,6,7].includes(unit.part))assert.ok(detail.items.every(item=>item.knowledge_accumulation?.schema_version!=="2.0"),`${bank.bank_id}/${unit.unit_id} duplicates material knowledge`);
      for(const knowledge of knowledgeValues){
        knowledgeCards++;
        assert.equal(knowledge.schema_version,"2.0",`${bank.bank_id}/${unit.unit_id} has legacy knowledge`);
        assert.equal(knowledge.extraction_basis,"full_exercise");
        assert.ok(["material","question_context"].includes(knowledge.source_scope));
        const entries=[...(knowledge.vocabulary||[]),...(knowledge.collocations||[])];
        assert.ok(entries.length>0&&entries.length<=4);
        assert.ok(entries.every(entry=>entry.source_quote&&entry.why&&entry.confidence>=.78));
      }
      if(unit.part!==5)assert.ok(detail.context.transcript_translation||detail.context.passage_translation||detail.context.content_translation,`${bank.bank_id}/${unit.unit_id} lacks material translation`);
      for(const item of detail.items){
        questions++;
        assert.equal(item.choice_translations.length,item.choices.length,`${item.item_key} lacks translated choices`);
        if(item.question)assert.ok(item.question_translation,`${item.item_key} lacks translated question`);
        assert.ok(item.explanation_structured?.answer,`${item.item_key} lacks structured analysis`);
        choices+=item.choices.length;
      }
    }
  }
  assert.equal(questions,4800);
  assert.equal(choices,18600);
  assert.ok(knowledgeCards>0,"contextual knowledge should be available where the exercise contains a valuable expression");
});

test("keeps shared official material in canonical details while Part 1, 2 and 5 stay single",async()=>{
  const index=JSON.parse(await read("public/data/banks/official-1-test-1/index.json"));
  assert.ok(index.units.filter(unit=>[1,2,5].includes(unit.part)).every(unit=>unit.question_count===1));
  assert.ok(index.units.filter(unit=>[3,4,6,7].includes(unit.part)).every(unit=>unit.question_count>=2));
  const detail=JSON.parse(await read("public/data/banks/official-1-test-1/units/p3-32-34.json"));
  assert.equal(detail.items.length,3);
  assert.ok(detail.context.audio_path.path.endsWith(".mp3"));
  assert.ok(detail.context.transcript);
  const part4=JSON.parse(await read("public/data/banks/official-1-test-1/units/p4-71-73.json"));
  assert.ok(part4.context.audio_path||part4.context.question_audio_path);
});

test("uses one material-level priority for every Part 3, 4, 6 and 7 group",async()=>{
  const catalog=JSON.parse(await read("public/data/catalog.json"));
  assert.match(catalog.priority_methodology.disclaimer,/按整段会话、独白或文章综合分级/);
  for(const bank of catalog.banks){
    const index=JSON.parse(await read(`public/data/${bank.index_path}`));
    for(const unit of index.units.filter(unit=>[3,4,6,7].includes(unit.part))){
      const detail=JSON.parse(await read(`public/data/${unit.detail_path}`));
      assert.equal(detail.priority.scope,"material",`${bank.bank_id}/${unit.unit_id} must use material priority`);
      assert.ok(detail.material_type);
      assert.ok(detail.topic_category);
      assert.ok(detail.items.every(item=>item.priority.level===detail.priority.level&&item.priority.score===detail.priority.score&&item.priority.scope==="material"));
    }
  }
});

test("publishes only media rendered by each Part",async()=>{
  const catalog=JSON.parse(await read("public/data/catalog.json"));
  let retainedVisuals=0;
  for(const bank of catalog.banks){
    const index=JSON.parse(await read(`public/data/${bank.index_path}`));
    for(const unit of index.units){
      const detail=JSON.parse(await read(`public/data/${unit.detail_path}`));
      if([6,7].includes(unit.part)){
        assert.equal(detail.context.picture_path,undefined);
        assert.equal(detail.context.picture_paths,undefined);
        assert.ok(detail.context.passage||detail.context.content_translation);
        assert.ok(unit.asset_refs.every(ref=>!ref.match(/\.(?:jpe?g|png)$/i)));
      }else if([1,3,4].includes(unit.part)){
        retainedVisuals+=unit.asset_refs.filter(ref=>ref.match(/\.(?:jpe?g|png)$/i)).length;
      }
    }
  }
  assert.ok(retainedVisuals>0,"Part 1/3/4 visuals must be retained");
});

test("locks all 144 visually reviewed Part 1 picture/audio pairings",async()=>{
  const {stdout}=await execFileAsync(process.execPath,["scripts/verify-part1-media.mjs"],{cwd:new URL("../",import.meta.url)});
  assert.match(stdout,/144 picture\/audio pairings across 24 banks/);
});

test("renders multi-bank priority controls and lazy detail loading",async()=>{
  const [page,css,pagesEntry]=await Promise.all([read("app/page.tsx"),read("app/priority.css"),read("static-pages/main.tsx")]);
  assert.match(page,/24 套官方题库/);
  assert.match(page,/Part \{part\} · \{PART_META\[part\]\.focus\}/);
  assert.match(page,/全题库优先级刷题/);
  assert.match(page,/fetchJson<UnitDetail>/);
  assert.match(page,/context\.audio_path \|\| context\.question_audio_path/);
  assert.match(page,/MULTI_CARD_PARTS = new Set\(\[1, 2, 5\]\)/);
  assert.match(page,/SingleItemGallery/);
  assert.match(page,/materialSplit/);
  assert.match(page,/activeDetail = detail && current && detail\.bank_id === current\.bank_id && detail\.unit_id === current\.unit_id/);
  assert.match(page,/查看全部解析/);
  assert.match(page,/activeAudioElement/);
  assert.doesNotMatch(page,/<header>/);
  assert.match(page,/floatingMenu/);
  assert.match(page,/item_key/);
  assert.match(page,/MATERIAL_PARTS\.has\(unit\.part\)/);
  assert.match(page,/scope: "material" as const/);
  assert.match(page,/ref\.item_keys\.every/);
  assert.match(page,/type StatusFilter = "ALL" \| "UNDONE" \| "DONE" \| "WRONG" \| "STARRED"/);
  assert.match(page,/statusFilter === "DONE"/);
  assert.match(page,/statusCounts\[option\.value\]/);
  assert.match(page,/Object\.hasOwn\(saved\.answers, key\)/);
  assert.match(page,/本\{current\.part <= 4 \? "组" : "篇"\}全部题目/);
  assert.match(css,/\.globalPractice/);
  assert.match(css,/\.bankSelect/);
  assert.match(css,/\.singleItemGallery/);
  assert.match(css,/\.materialSplit/);
  assert.match(css,/\.statusFilters button small/);
  assert.match(pagesEntry,/priority\.css/);
});

test("supports material bookmarks and accessible click-to-zoom in the React application",async()=>{
  const [page,styles]=await Promise.all([read("app/page.tsx"),read("app/priority.css")]);
  assert.match(page,/materialBookmarkButton active/);
  assert.match(page,/收藏本\$\{current\.part <= 4 \? "组" : "篇"\}/);
  assert.match(page,/aria-pressed=\{isStarred\}/);
  assert.match(page,/className="zoomImageButton"/);
  assert.match(page,/role="dialog" aria-modal="true"/);
  assert.match(page,/event\.key === "Escape"/);
  assert.match(styles,/\.imageLightbox/);
  assert.match(styles,/\.materialBookmarkButton\.active/);
  assert.match(styles,/touch-action:pinch-zoom/);
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

test("Pages build keeps its application JavaScript and CSS bundles",async()=>{
  const html=await readFile(new URL("../pages-dist/index.html",import.meta.url),"utf8");
  const refs=[...html.matchAll(/(?:src|href)="\/toeic-sprint\/(assets\/[^"?#]+\.(?:js|css))"/g)].map(match=>match[1]);
  assert.ok(refs.some(ref=>ref.endsWith(".js")),"index.html must reference a JavaScript bundle");
  assert.ok(refs.some(ref=>ref.endsWith(".css")),"index.html must reference a CSS bundle");
  for(const ref of refs)assert.ok(await exists(new URL(`../pages-dist/${ref}`,import.meta.url)),`${ref} must exist in pages-dist`);
});
