#!/usr/bin/env node
/** Read-only by default: never repairs prompts, changes answers, or blesses a sentence
 * merely because it ends with a period. --record-manual-audit records an actual
 * full-text human review; later runs reuse it only for the exact input hash.
 * --write applies ONLY the exact-input, explicitly confirmed blocking records.
 */
import {createHash} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasCurrentPart5Review} from './apply-part5-reviewed-aids.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const VERSION='part5_completeness_audit_v1';
const BLANK=/[-_—–]{2,}/g;
export const CONFIRMED_SOURCE_BLOCKS=[{
  bank_id:'official-8-test-1',item_id:116,
  source_sha256:'c046211a32473889da317680a00b3cd602a976f1364eda540771ed3a2835a124',
  code:'answer_filled_syntax_broken',
  reason:'填入记录答案 minimal 后得到 it should minimal traffic problems，情态动词后缺动词。必须核对原题和答案，不可擅自换成 minimize 或猜补原文。',
}];

// These are observations of the actual displayed input, not guessed repairs.
// Match an exact problematic fragment so a future corrected item is not
// permanently blacklisted by its bank and question number.
const MANUAL_FINDINGS={
  'official-8-test-1/116':{fragment:'it should ---- traffic problems.',answer:'A',choice:'minimal',code:'answer_filled_syntax_broken',reason:'填入记录答案 minimal 后得到 it should minimal traffic problems，情态动词后缺动词。不能擅自换成其他选项或猜补动词，必须核对原题和答案。'},
  'official-10-test-1/102':{fragment:'Mr. Zhao will -- accounts while',code:'answer_filled_syntax_broken',reason:'填入 temporarily 后是 will temporarily accounts，缺少处理 accounts 的谓语动词。'},
  'official-10-test-1/120':{fragment:'The first -- advertising campaign is',code:'answer_filled_syntax_broken',reason:'填入 goal 后是 The first goal advertising campaign，名词关系缺损，需原图确认缺失介词及限定语。'},
  'official-10-test-2/101':{fragment:'some of the ------- the new marketing software.',code:'answer_filled_syntax_broken',reason:'填入 exciting 后仍缺所修饰名词及与 software 的连接关系。'},
  'official-11-test-2/118':{fragment:'Companies relocating -- Burton County',code:'answer_filled_syntax_broken',reason:'填入 their 后得到 Companies relocating their Burton County，缺名词及地点关系，四选项无法补全原句。'},
  'official-11-test-2/121':{fragment:'Dr. Cheon is ------- patients at this time',code:'answer_filled_syntax_broken',reason:'填入 understandably 后得到 is understandably patients，缺少实义谓语或补足语。'},
  'official-12-test-2/111':{fragment:'represent the company the marketing conference.',code:'missing_clause_link',reason:'represent the company 与 the marketing conference 之间缺少表示地点或场合的连接成分。'},
  'official-7-test-1/101':{fragment:'encouraged to -- in community programs. participate',code:'displaced_sentence_fragment',reason:'participate 被移到句号之后，填入 regularly 后正文缺少动词。'},
  'official-7-test-1/129':{fragment:'its well-known logo. has decided to',code:'displaced_sentence_fragment',reason:'has decided to 错置于句末，主体句无法按原顺序填词成为完整句子。'},
  'official-8-test-2/113':{fragment:'The Hartsfield Hotel offer ',code:'subject_verb_damage',reason:'单数酒店主语与 offer 不一致；答案词只修饰 comforts，不能修复谓语。'},
  'official-9-test-1/116':{fragment:'the renovation. The Kopple Building',code:'displaced_sentence_fragment',reason:'before 的宾语 the renovation 被移到句首，前后顺序已破坏。'},
  'official-10-test-2/112':{fragment:'she leaves for Paris. next Monday,',code:'displaced_sentence_fragment',reason:'next Monday 被移至句号后，时间从句边界已破坏。'},
  'official-12-test-1/107':{fragment:'increased. evening bus route has',code:'displaced_sentence_fragment',reason:'evening bus route has 被移至句尾且选项也含乱码，不能靠正常填词修复。'},
};
const OBSERVED_FRAGMENTS=[
  ['official-1-test-2',106,'Aloud beeping','Aloud 被合并在名词短语前，缺正常限定语结构。'],
  ['official-1-test-2',127,'used to ming transport','不定式中混入 ming，破坏动词结构。'],
  ['official-2-test-1',121,'archiving d. records','archiving 与 records 间混入 d.。'],
  ['official-2-test-1',122,'competing fc television','competing 与 television 之间的连接词已损坏。'],
  ['official-2-test-2',106,'are toa eight','are 与数量之间混入 toa。'],
  ['official-2-test-2',123,'Innovations a discounted price','公司名称与 a discounted price 之间缺连接成分。'],
  ['official-2-test-2',124,'based ona percentage','ona 为词间空格丢失，不能直接作为正常英文词。'],
  ['official-2-test-2',126,'surrounding t new','t 为截断的限定词片段。'],
  ['official-2-test-2',128,'Industries ality to is','主语和谓语之间混入 ality to。'],
  ['official-2-test-2',129,'------- ona promoter','答案与 promoter 之间的 ona 破坏定语结构。'],
  ['official-3-test-1',107,'set up nN our','被动谓语后混入 nN our。'],
  ['official-3-test-1',108,'our team she to','our team 与不定式之间混入 she。'],
  ['official-3-test-1',109,'helps ment professionals','helps 后混入 ment，不能组成正常宾语。'],
  ['official-3-test-1',110,'with 11 management','不可数 management 前混入无语法用途的 11。'],
  ['official-3-test-1',127,'huge 2S investments','huge 与 investments 间混入 2S。'],
  ['official-3-test-1',129,'environmental s and impact','形容词和中心名词间混入 s and。'],
  ['official-3-test-1',130,'must or in be','情态动词与被动助动词间混入 or in。'],
  ['official-3-test-2',104,'participant will read','本语境单数可数主语 participant 缺限定词，原词或词尾需核实。'],
  ['official-3-test-2',108,'reports, he Ms. Gonzalez','主语前混入 he，构成重复人称成分。'],
  ['official-3-test-2',111,'------- 11 rather','强调代词与 rather 之间混入 11。'],
  ['official-3-test-2',113,'most ------- 12 leaders','数字 12 错置于最高级形容词与名词之间。'],
  ['official-3-test-2',114,'products, 12 yogurt','不可数名词 yogurt 前混入 12。'],
  ['official-4-test-1',101,'------- 1C information','形容词与 information 间混入 1C。'],
  ['official-4-test-1',102,'campaign. 1(','句号后混入页码或邻栏标记 1(。'],
  ['official-4-test-1',103,'-------. 1(','句号后混入页码或邻栏标记 1(。'],
  ['official-4-test-1',104,'-------. 1','句号后混入孤立数字 1。'],
  ['official-4-test-1',116,'interest d in','interest 与介词 in 之间混入 d。'],
  ['official-4-test-1',121,'to or conclude','不定式 to 与动词 conclude 之间混入 or。'],
  ['official-4-test-1',122,'in 12 traffic','不可数名词 traffic 前混入 12。'],
  ['official-4-test-1',124,'Stades 1; Group','公司名称内部被 1; 打断。'],
  ['official-4-test-2',101,'South Pacific 11 offered','地名与后置分词间混入 11。'],
  ['official-4-test-2',102,'ranked 1 medical','形容词与中心名词间混入 1。'],
  ['official-4-test-2',103,'help, 1 Ms. Pham','逗号后主语前混入 1。'],
  ['official-4-test-2',105,'------- 1 of','名词与 of 短语间混入 1。'],
  ['official-4-test-2',107,'have ies. risen','完成时助动词与分词间混入 ies.。'],
  ['official-4-test-2',123,'executives 1; must','主语与谓语间混入 1;。'],
  ['official-4-test-2',125,'was uf designed','被动结构中混入 uf。'],
  ['official-4-test-2',128,'has 1e received','完成时结构中混入 1e。'],
  ['official-4-test-2',130,'recommend / candidates','动词与宾语间混入斜杠。'],
  ['official-5-test-1',117,'Ms. Cho took the the reconstruction','两个不同句子片段错接；原题与四选项疑似错配。'],
  ['official-5-test-2',121,'------- a fraction of the products sold at special dinner','原题开头与另一道晚餐题的片段、选项错接，填词后仍不成句。'],
  ['official-6-test-1',107,'certifying tha they','连接词 tha 已截断。'],
  ['official-7-test-1',127,'compile a in order to','compile 的宾语只剩冠词 a，随后接入另一句片段。'],
  ['official-7-test-1',130,"work-from-home Australia, they",'工作政策与澳大利亚制造题的片段错接，原题不完整。'],
  ['official-7-test-2',115,'will e joining','will 后的被动/进行结构缺损，e 不是合法助动词。'],
  ['official-8-test-1',128,'The Asawa 4 is ------- for Mardoor', '现答案 justify 为动词原形，is justify 不能成立，且后半句与前面的安全政策题重复，疑似串题。'],
  ['official-9-test-2',102,'turnover rate 0 has','主语与谓语间混入孤立数字 0。'],
  ['official-9-test-2',103,'video games, which are only','只剩名词及非限定性关系从句，缺少主句。'],
  ['official-12-test-1',130,'Eiko Sanocon firmed that','人名后出现 Sanocon firmed 的错误分词边界，谓语损坏；不能仅凭语法猜改人名。'],
];
const OBSERVED_OPTION_FRAGMENTS=[
  ['official-9-test-1',126,'without .OST','选项 without 后混入 .OST。'],
  ['official-9-test-1',127,'had been ordered LIST','选项分词短语后混入 LIST。'],
  ['official-9-test-1',130,'because of gid. will','介词选项后混入 gid. will。'],
];
const DAMAGED_WORDS=/\b(?:nonstoj|elevat|custome|perce|thei|needec|quicl|growin|whethe|contident|distinguishe|potentia|neded|pertormed|protit|thar|earier|stimate|Visionsballet|abonus|amanager|histravel|soplease|Amona)\b/;
const KNOWN_DEBRIS=/\b(?:TKMICASOls|ERRST|ZAOKAON|raewaots|vhether|yption|sidsho|avitsrmoini|IRE)\b|\b1eeded\b|\b5\.cc\b|\bthei\b|\bI ncoming\b/;
export function part5SourceHash(item){return createHash('sha256').update(JSON.stringify({question:item.question,choices:item.choices,answer:item.answer})).digest('hex');}

// A strictly pinned, pure transformation: no heuristic finding is automatically
// written. Preserve question/choices/answer and existing review provenance.
export function applyConfirmedSourceBlock(item,bankId){
  const record=CONFIRMED_SOURCE_BLOCKS.find(row=>row.bank_id===bankId&&row.item_id===item.item_id&&row.source_sha256===part5SourceHash(item));
  if(!record)return {item:structuredClone(item),changed:false,matched:false};
  const next=structuredClone(item);
  next.content_review_status='source_required';
  next.content_review_issues=[...new Set([...(Array.isArray(next.content_review_issues)?next.content_review_issues:[]),record.code])];
  next.answer_review_status='pending';
  next.study_aid_status={...next.study_aid_status,question_translation:'pending',analysis:'pending',choice_translations:'pending'};
  next.part5_completeness_review={schema_version:VERSION,source_sha256:record.source_sha256,blocking:true,reason:record.reason};
  return {item:next,changed:JSON.stringify(item)!==JSON.stringify(next),matched:true};
}

export function auditPart5Completeness(item,{bankId='',manuallyReviewed=false}={}){
  const question=String(item.question||''),choices=Array.isArray(item.choices)?item.choices:[],answerIndex=/^[ABCD]$/.test(item.answer||'')?'ABCD'.indexOf(item.answer):-1,answerWord=choices[answerIndex];
  const issues=[];
  const add=(code,severity,reason,evidence)=>{if(!issues.some(i=>i.code===code))issues.push({code,severity,reason,...(evidence?{evidence}: {})})};
  const blanks=[...question.matchAll(BLANK)];
  if(blanks.length!==1)add(blanks.length?'multiple_blanks':'missing_blank','definite','Part 5 应有且仅有一个可作答空格。',String(blanks.length));
  if(choices.length!==4||choices.some(c=>typeof c!=='string'||!c.trim()))add('missing_options','definite','四个完整选项未齐全。');
  if(answerIndex<0||!answerWord)add('invalid_answer','definite','答案必须对应现有的 A–D 选项。');
  const completed=blanks.length===1&&answerWord?question.replace(BLANK,String(answerWord)):null;
  const allText=[question,...choices].join(' ');
  const neighbor=question.match(/\b1[0-3]\d[.)]\s/);
  if(neighbor)add('neighbour_question_number','definite','正文混入 Part 5 题目标号，应与原始版面核对。',neighbor[0]);
  const unsafe=allText.match(/[^\x20-\x7e\p{Script=Latin}’‘“”–—£€¥\s]/u);
  if(unsafe)add('unexpected_characters','definite','英文题干或选项含无法作为正常英文/数字使用的字符。',unsafe[0]);
  const debris=allText.match(/[|={}<>\\©®~]|\*\*|\b(?:TEST\s*[12]|PART\s*5)\b|[+»]\s*(?:$|\/)/i)||allText.match(KNOWN_DEBRIS);
  if(debris)add('ocr_debris','definite','题干或选项含页眉、OCR 或邻栏杂质。',debris[0]);
  const word=allText.match(DAMAGED_WORDS);
  if(word)add('known_damaged_word','definite','人工通读发现的截断词或 OCR 合并词；这里只检测，不推测补字。',word[0]);
  const choiceDebris=choices.find(c=>/\s\d+(?:[)’]|$)|\s(?:m|N|Ny|ho|et|ent|Ld)(?:[):]|$)|\s[:=]$|\b(?:throug|dowi)\b|\s-\sheadquarters$/.test(String(c)));
  if(choiceDebris)add('option_contamination','definite','选项含孤立页码、邻栏字串或截断词。',choiceDebris);
  if(/\b(?:a|an|the|in the|to the|with the)\s*[.!?]?\s*$/i.test(question))add('truncated_sentence_end','definite','句末停在必须接后续名词的冠词或短语，句号本身不能证明完整。',question.slice(-85));
  if(!/[.!?][\x22\x27”’]?\s*$/.test(question))add('terminal_punctuation_or_truncation','verify','句末缺少正常终止标点；可能仅标点缺失，也可能有文字截断，不能自动补句号放行。',question.slice(-85));
  const reviewed=hasCurrentPart5Review(item);
  if(!manuallyReviewed&&!reviewed&&/\b(?:\d+|[A-Za-z]+)\s+\d{1,3}\s+(?:[A-Za-z]|[-_—–]{2})/.test(question))add('embedded_number_review','verify','检测到句中孤立数字，需区分正常数量/型号与邻栏页码；不自动删除。');
  const observed=MANUAL_FINDINGS[`${bankId}/${item.item_id}`];
  if(observed&&question.includes(observed.fragment)&&(!observed.answer||item.answer===observed.answer)&&(!observed.choice||answerWord===observed.choice))add(observed.code,'definite',observed.reason,completed||observed.fragment);
  for(const [bank,id,fragment,reason] of OBSERVED_FRAGMENTS)if(bank===bankId&&id===Number(item.item_id)&&question.includes(fragment))add('manual_text_damage','definite',reason,fragment);
  for(const [bank,id,fragment,reason] of OBSERVED_OPTION_FRAGMENTS)if(bank===bankId&&id===Number(item.item_id)&&choices.some(c=>String(c).includes(fragment)))add('manual_option_damage','definite',reason,fragment);
  // A narrow high-confidence modal constraint catches broken known-answer
  // fills, even when an earlier human-review badge is present.
  if(completed&&/\b(?:will|would|should|must|may|might|can|could)\s+(?:minimal|eligible|profitable|reasonable)\b/i.test(completed))add('modal_missing_verb','definite','情态动词后直接接明确的形容词，缺少动词；不得擅改答案来掩盖题干缺损。',completed);
  if(item.content_review_status==='source_required'&&!issues.some(i=>i.severity==='definite'))add('existing_source_review_unresolved','verify','原流程仍标记需要源图；本审计保留不确定性，不因句号或人工译文而解除该状态。');
  if(!issues.length&&!manuallyReviewed&&!reviewed)add('unreviewed_sentence_semantics','verify','字符和格式校验不足以证明整句完整；需人工通读或精确匹配既有人工审阅记录。');
  const classification=issues.some(i=>i.severity==='definite')?'definitely_damaged':issues.length?'needs_verification':'complete_readable';
  return {bank_id:bankId,item_id:item.item_id,classification,question,choices,answer:item.answer,completed_sentence:completed,source_sha256:part5SourceHash(item),current_aid_review:reviewed,manual_full_sentence_review:manuallyReviewed,previous_source_required:item.content_review_status==='source_required',issues};
}

export async function main(argv=process.argv.slice(2)){
  const option=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:undefined;
  const reportPath=path.resolve(option('--report')||path.join(ROOT,'outputs/part5-completeness-audit.json'));
  const dataRoot=path.resolve(option('--data-root')||path.join(ROOT,'public/data/banks'));
  const baselinePath=path.resolve(option('--baseline')||path.join(ROOT,'scripts/reviews/part5-completeness-baseline.json'));
  const recordManual=argv.includes('--record-manual-audit');
  const doWrite=argv.includes('--write');
  const baseline=JSON.parse(await readFile(baselinePath,'utf8'));
  if(baseline.schema_version!=='part5_completeness_baseline_v1'||!Array.isArray(baseline.items))throw new Error(`Invalid manual readability baseline: ${baselinePath}`);
  const manualHashes=new Map(),baselineKeys=new Set();
  const remember=(bank,id,hash)=>{const key=`${bank}/${id}`;if(!manualHashes.has(key))manualHashes.set(key,new Set());manualHashes.get(key).add(hash)};
  for(const row of baseline.items){
    const key=`${row.bank_id}/${row.item_id}`;
    if(!/^official-\d+-test-[12]$/.test(row.bank_id)||!Number.isInteger(row.item_id)||row.item_id<101||row.item_id>130||row.reviewed!==true||!/^[a-f0-9]{64}$/.test(row.source_sha256)||baselineKeys.has(key))throw new Error(`Invalid or duplicate baseline record: ${key}`);
    baselineKeys.add(key);remember(row.bank_id,row.item_id,row.source_sha256);
  }
  let previous;try{previous=JSON.parse(await readFile(reportPath,'utf8'))}catch{}
  // Outputs may be gitignored or entirely absent. The committed baseline is
  // the stable starting point; a later manual review can add another exact
  // version, but an unreviewed changed item never displaces a reviewed hash.
  for(const row of previous?.items||[])if(row.manual_full_sentence_review&&/^[a-f0-9]{64}$/.test(row.source_sha256))remember(row.bank_id,row.item_id,row.source_sha256);
  const items=[],plans=[],matchedBlocks=[];
  for(const bank of (await readdir(dataRoot)).sort())for(const filename of (await readdir(path.join(dataRoot,bank,'units'))).filter(f=>/^p5-\d+\.json$/.test(f)).sort()){
    const file=path.join(dataRoot,bank,'units',filename),original=await readFile(file,'utf8'),unit=JSON.parse(original);
    let unitChanged=false;
    for(let index=0;index<unit.items.length;index++){
      const item=unit.items[index];
      const manuallyReviewed=recordManual||Boolean(manualHashes.get(`${bank}/${item.item_id}`)?.has(part5SourceHash(item)));
      items.push(auditPart5Completeness(item,{bankId:bank,manuallyReviewed}));
      const block=applyConfirmedSourceBlock(item,bank);
      if(block.matched)matchedBlocks.push({bank_id:bank,item_id:item.item_id,changed:block.changed});
      if(doWrite&&block.changed){
        if(unit.bank_id!==bank||unit.part!==5||unit.unit_id!==`p5-${item.item_id}`||filename!==`p5-${item.item_id}.json`||unit.items.length!==1)throw new Error(`Identity mismatch; no source blocks written: ${file}`);
        unit.items[index]=block.item;unitChanged=true;
      }
    }
    if(unitChanged)plans.push({file,original,output:JSON.stringify(unit,null,2)+'\n'});
  }
  for(const plan of plans)if(await readFile(plan.file,'utf8')!==plan.original)throw new Error(`Target changed; no source blocks written: ${plan.file}`);
  for(const plan of plans)await writeFile(plan.file,plan.output);
  const counts=Object.fromEntries(['definitely_damaged','needs_verification','complete_readable'].map(c=>[c,items.filter(i=>i.classification===c).length]));
  const report={schema_version:VERSION,generated_at:new Date().toISOString(),scope:'全量 Part 5 题干、按正确答案填入的句子和有序四选项；默认只读，不纠正或猜造题干。--write 仅阻断精确 hash 匹配的明确坏题，不自动阻断启发式疑似项。',human_review_note:recordManual?'本次已逐题完整通读全量题干及四选项，记录精确输入指纹。':'只复用输入指纹完全一致的人工审阅；格式通过不等于语义完整。',total:items.length,counts,write:doWrite,source_blocks:matchedBlocks,written_files:plans.map(plan=>plan.file),reviewed_but_flagged:items.filter(i=>i.current_aid_review&&i.classification!=='complete_readable').map(i=>({bank_id:i.bank_id,item_id:i.item_id,classification:i.classification,issues:i.issues})),new_definite_findings:items.filter(i=>i.classification==='definitely_damaged'&&!i.previous_source_required).map(i=>({bank_id:i.bank_id,item_id:i.item_id,completed_sentence:i.completed_sentence,issues:i.issues})),items};
  await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({total:report.total,counts:report.counts,reviewed_but_flagged:report.reviewed_but_flagged,new_definite_findings:report.new_definite_findings,report:reportPath},null,2));
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
