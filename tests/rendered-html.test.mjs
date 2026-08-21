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
      if(unit.part!==5&&!detail.context.reading_ocr)assert.ok(detail.context.transcript_translation||detail.context.passage_translation||detail.context.content_translation,`${bank.bank_id}/${unit.unit_id} lacks material translation`);
      for(const item of detail.items){
        questions++;
        if(item.choice_translations)assert.equal(item.choice_translations.length,item.choices.length,`${item.item_key} has incomplete translated choices`);
        if(!detail.context.reading_ocr){
          if(item.question)assert.ok(item.question_translation,`${item.item_key} lacks translated question`);
          assert.ok(item.explanation_structured?.answer,`${item.item_key} lacks structured analysis`);
        }
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
        assert.ok(unit.asset_refs.filter(ref=>ref.match(/\.(?:jpe?g|png)$/i)).every(ref=>ref.includes("/reading-layout/")));
      }else if([1,3,4].includes(unit.part)){
        retainedVisuals+=unit.asset_refs.filter(ref=>ref.match(/\.(?:jpe?g|png)$/i)).length;
      }
    }
  }
  assert.ok(retainedVisuals>0,"Part 1/3/4 visuals must be retained");
});

test("publishes verified source-layout pages for every Part 6 and Part 7 unit",async()=>{
  const catalog=JSON.parse(await read("public/data/catalog.json"));
  let units=0,images=0;
  for(const bank of catalog.banks){
    const index=JSON.parse(await read(`public/data/${bank.index_path}`));
    for(const unit of index.units.filter(unit=>unit.part===6||unit.part===7)){
      units++;
      const detail=JSON.parse(await read(`public/data/${unit.detail_path}`));
      assert.equal(detail.context.reading_ocr?.schema_version,"reading_layout_ocr_v2",`${bank.bank_id}/${unit.unit_id} lacks OCR provenance`);
      assert.deepEqual(detail.context.reading_ocr.verified_item_ids,detail.items.map(item=>item.item_id));
      assert.ok(detail.context.reading_layout_images?.length>0,`${bank.bank_id}/${unit.unit_id} lacks source layout`);
      for(const image of detail.context.reading_layout_images){
        images++;
        assert.ok(image.path.startsWith("reading-layout/"));
        assert.ok(Number(image.source_width)>0&&Number(image.source_height)>0,`${bank.bank_id}/${unit.unit_id} lacks source dimensions`);
        assert.equal(Number(image.width)/Number(image.source_width),1,`${bank.bank_id}/${unit.unit_id} must publish the full source page width`);
        assert.deepEqual(image.crop,{x:0,y:0,width:image.source_width,height:image.source_height},`${bank.bank_id}/${unit.unit_id} must publish the complete original page`);
        assert.ok(Number(image.ocr_crop?.width)/Number(image.source_width)>=.9,`${bank.bank_id}/${unit.unit_id} OCR crop clips more than 10% of page width`);
        assert.ok(await exists(new URL(`public/assets/${bank.bank_id}/${image.path}`,root)),`${bank.bank_id}/${image.path} missing`);
        assert.ok(unit.asset_refs.includes(image.asset_key));
      }
      for(const item of detail.items){
        assert.equal(item.choices.length,4,`${item.item_key} choices`);
        assert.ok(item.choices.every(Boolean),`${item.item_key} has empty choice`);
        if(unit.part===7)assert.ok(/\?/.test(item.question)||/closest in meaning to\s*$/i.test(item.question),`${item.item_key} has truncated stem`);
      }
    }
  }
  assert.equal(units,456);
  assert.ok(images>=456);
});

test("locks all 144 visually reviewed Part 1 picture/audio pairings",async()=>{
  const {stdout}=await execFileAsync(process.execPath,["scripts/verify-part1-media.mjs"],{cwd:new URL("../",import.meta.url)});
  assert.match(stdout,/144 picture\/audio pairings across 24 banks/);
});

test("renders multi-bank priority controls and lazy detail loading",async()=>{
  const [page,css,pagesEntry]=await Promise.all([read("app/page.tsx"),read("app/priority.css"),read("static-pages/main.tsx")]);
  assert.match(page,/24 套官方题库/);
  assert.match(page,/useState\("official-1-test-1"\)/);
  assert.match(page,/Part \{part\} · \{PART_META\[part\]\.focus\}/);
  assert.match(page,/全题库优先级刷题/);
  assert.match(page,/fetchJson<UnitDetail>/);
  assert.match(page,/context\.audio_path \|\| context\.question_audio_path/);
  assert.match(page,/reading_layout_images/);
  assert.match(page,/原始材料版面/);
  assert.match(page,/查看文字版/);
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
  assert.match(page,/useState<PriorityFilter>\("ALL"\)/);
  assert.match(page,/随机排序/);
  assert.match(page,/优先级排序/);
  assert.match(page,/官方排序/);
  assert.match(page,/useState<SortMode>\("OFFICIAL"\)/);
  assert.match(page,/setRandomSeed\(value => value \+ 1\)/);
  assert.match(page,/sortMode === "RANDOM"/);
  assert.match(page,/randomRank\(a, randomSeed\)/);
  assert.match(page,/Object\.hasOwn\(saved\.answers, key\)/);
  assert.match(page,/本\{current\.part <= 4 \? "组" : "篇"\}全部题目/);
  assert.match(css,/\.globalPractice/);
  assert.match(css,/\.bankSelect/);
  assert.match(css,/\.singleItemGallery/);
  assert.match(css,/\.materialSplit/);
  assert.match(css,/\.statusFilters button small/);
  assert.match(css,/\.sortMenu\{/);
  assert.match(css,/\.questionBlock h2\{[^}]*font-size:17px/);
  assert.match(css,/\.materialQuestionCard \.questionBlock h2\{font-size:13px/);
  assert.match(css,/\.materialQuestionCard \.questionBlock \.choices\{grid-template-columns:repeat\(2/);
  assert.match(css,/\.materialQuestionCard \.questionBlock \.choices p\{font-size:11\.5px/);
  assert.match(css,/\.singleItemCard \.questionBlock h2\{font-size:13\.5px/);
  assert.match(css,/\.singleItemCard\.part1,\.singleItemCard\.part2,\.singleItemCard\.part5\{padding:13px/);
  assert.match(css,/\.singleItemCard\.part1 \.questionBlock \.choices p,\.singleItemCard\.part2 \.questionBlock \.choices p,\.singleItemCard\.part5 \.questionBlock \.choices p\{font-size:12px/);
  assert.match(page,/`materialSplit part\$\{current\.part\}`/);
  assert.match(css,/\.singleItemCard\.part1 \.questionBlock h2,.singleItemCard\.part2 \.questionBlock h2,.singleItemCard\.part5 \.questionBlock h2\{font-size:13\.5px/);
  assert.match(css,/\.materialSplit\.part3 \.materialQuestionCard \.questionBlock h2\{font-size:12\.5px/);
  assert.match(page,/className="quickPager"/);
  assert.match(css,/\.materialSplit\{[^}]*background:transparent;[^}]*border:0/);
  assert.match(pagesEntry,/priority\.css/);
});

test("keeps answers neutral until explicitly revealed and restores per-question review controls",async()=>{
  const [page,css]=await Promise.all([read("app/page.tsx"),read("app/priority.css")]);
  assert.match(page,/function ReviewButtons/);
  assert.match(page,/查看答案/);
  assert.match(page,/查看所有答案/);
  assert.match(page,/toggleAllMaterialAnswers/);
  assert.match(page,/materialAllAnswersOpen/);
  assert.match(page,/清空选择/);
  assert.match(page,/selected \? "selected" : ""/);
  assert.match(page,/answerVisible && chosen/);
  assert.match(page,/delete answers\[item\.item_key\]/);
  assert.match(page,/revealed: string\[\]/);
  assert.match(page,/revealed: \[\]/);
  assert.match(page,/source\.revealed/);
  assert.match(page,/setAnswerRevealed/);
  assert.match(page,/saved\.revealed\.includes/);
  assert.match(page,/revealed: previous\.revealed\.filter/);
  assert.match(page,/className="globalReviewTools"/);
  assert.match(page,/className="asideSortButtons"/);
  assert.match(page,/className="asideQueueTools"/);
  assert.match(css,/\.asideQueueTools \.globalReviewTools/);
  assert.match(css,/\.asideSortButtons\{display:grid;grid-template-columns:repeat\(3/);
  assert.doesNotMatch(page,/<details className="sortMenu">/);
  assert.match(page,/toggleGlobalAnswers/);
  assert.match(page,/查看全部答案/);
  assert.match(page,/clearGlobalChoices/);
  assert.match(page,/清空全部选择/);
  assert.match(page,/window\.confirm/);
  assert.match(page,/此操作不会影响其他页面/);
  assert.match(page,/choose\(item, label, showAnswer\)/);
  assert.doesNotMatch(page,/selected \? \(correct \? "correct" : "incorrect"\)/);
  assert.match(css,/\.answerBtn\{/);
  assert.match(css,/\.clearAnswerBtn\{/);
  assert.match(css,/\.reviewButtons\{/);
});

test("restores draggable sidebar and material dividers with a compact drill viewport",async()=>{
  const [page,css]=await Promise.all([read("app/page.tsx"),read("app/priority.css")]);
  assert.match(page,/className="sidebarDivider"/);
  assert.match(page,/className="materialDivider"/);
  assert.match(page,/beginSidebarResize/);
  assert.match(page,/beginMaterialResize/);
  assert.match(page,/role="separator"/);
  assert.match(page,/aria-valuenow=\{Math\.round\(sidebarWidth\)\}/);
  assert.match(page,/aria-valuenow=\{Math\.round\(materialPercent\)\}/);
  assert.match(css,/--sidebar-width/);
  assert.match(css,/--material-left/);
  assert.match(css,/\.globalTopline h1\{[^}]*font-size:21px/);
  assert.match(css,/@container \(max-width:520px\)/);
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
