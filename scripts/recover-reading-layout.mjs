#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {READING_ITEM_OVERRIDES,verifyReadingItemOverrides} from "./reading-layout-overrides.mjs";

/**
 * Recover Part 6/7 from the original page scans.
 *
 * The previous pipeline OCRed a complete two-column page as one text stream.
 * This program deliberately separates three jobs:
 *   1. detect the material/question boundary from TSV geometry;
 *   2. OCR the left and right question columns independently;
 *   3. publish a cropped source-layout image as the authoritative fallback.
 *
 * Usage:
 *   node scripts/recover-reading-layout.mjs --scan-root /absolute/public/assets
 *   node scripts/recover-reading-layout.mjs --scan-root ... --write
 */

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(scriptDir,"..");
const dataRoot=path.join(projectRoot,"public/data");
const assetRoot=path.join(projectRoot,"public/assets");
const argv=process.argv.slice(2);
const valueAfter=(name)=>{const index=argv.indexOf(name);return index>=0?argv[index+1]:undefined};
const scanRootValue=valueAfter("--scan-root")||process.env.TOEIC_READING_SCAN_ROOT;
if(!scanRootValue)throw new Error("请用 --scan-root 指定包含 official-*-test-* 的原始扫描图目录");
const scanRoot=path.resolve(scanRootValue);
const write=argv.includes("--write");
const limit=Number(valueAfter("--limit")||0);
const bankOnly=valueAfter("--bank");
const unitOnly=valueAfter("--unit");
const OCR_SCHEMA="reading_layout_ocr_v2";
const OCR_ENGINE="tesseract-5-region-columns";
const ocrCacheRoot=path.join(projectRoot,"outputs/reading-ocr-cache");
const DERIVED_FIELDS=["passage_translation","content_translation"];
const ITEM_DERIVED_FIELDS=["question_translation","choice_translations","answer_explain","evidence","strategy","explanation_structured","knowledge_accumulation"];

if(!fs.existsSync(scanRoot))throw new Error(`原始扫描图目录不存在：${scanRoot}`);
const overrideFailures=verifyReadingItemOverrides(scanRoot);
if(overrideFailures.length)throw new Error(`阅读题图像复核覆盖表无效：\n${overrideFailures.join("\n")}`);
for(const binary of ["tesseract","ffmpeg","ffprobe"]){
  const result=spawnSync("which",[binary],{encoding:"utf8"});
  if(result.status!==0)throw new Error(`缺少必需工具：${binary}`);
}

function readJson(file){return JSON.parse(fs.readFileSync(file,"utf8"))}
function atomicJson(file,value){
  const temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+"\n");
  fs.renameSync(temporary,file);
}
function sha(value){return createHash("sha256").update(value).digest("hex")}
function filesSha(files){
  const hash=createHash("sha256");
  for(const file of files)hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}
function run(binary,args,{allowFailure=false}={}){
  const result=spawnSync(binary,args,{encoding:"utf8",maxBuffer:64*1024*1024});
  if(result.status!==0&&!allowFailure)throw new Error(`${binary} 失败：${result.stderr||result.stdout}`);
  return result.stdout||"";
}
function dimensions(file){
  const value=JSON.parse(run("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","json",file]));
  const stream=value.streams?.[0];
  if(!stream?.width||!stream?.height)throw new Error(`无法读取图片尺寸：${file}`);
  return {width:stream.width,height:stream.height};
}
function ocr(file,psm=3,format="txt"){
  const cacheKey=sha(Buffer.concat([Buffer.from(`${psm}:${format}:`),fs.readFileSync(file)]));
  const cacheFile=path.join(ocrCacheRoot,`${cacheKey}.${format}`);
  if(fs.existsSync(cacheFile))return fs.readFileSync(cacheFile,"utf8");
  const args=[file,"stdout","--dpi","300","--psm",String(psm),"-l","eng"];
  if(format!=="txt")args.push(format);
  const value=run("tesseract",args);
  fs.mkdirSync(ocrCacheRoot,{recursive:true});fs.writeFileSync(cacheFile,value);
  return value;
}
function cleanLine(value){
  return String(value||"").normalize("NFKC")
    .replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
    .replace(/[‐‑‒–—]/g,"-")
    .replace(/\bAlist\b/g,"A list")
    .replace(/\bA(?=[a-z]{3,}\b)/g,"A ")
    .replace(/\bItis\b/g,"It is")
    .replace(/\bAta\b/g,"At a")
    .replace(/\bifso\b/gi,"if so")
    .replace(/\bAsa result\b/g,"As a result")
    .replace(/\bA dditionally\b/g,"Additionally")
    .replace(/\bA lthough\b/g,"Although")
    .replace(/\bA ltogether\b/g,"Altogether")
    .replace(/\bA lready\b/g,"Already")
    .replace(/\bA fter\b/g,"After")
    .replace(/\bA bove all\b/g,"Above all")
    .replace(/\bA utomotive\b/g,"Automotive")
    .replace(/\bA venue\b/g,"Avenue")
    .replace(/\bA delaide\b/g,"Adelaide")
    .replace(/\|\s+am\b/g,"I am")
    .replace(/\bProduct owners ing\b/g,"Product owners")
    .replace(/\bA(?=(?:positive|play|budget|new|company|letter|copy|meeting|form|schedule|ticket|customer|manager|report|review|refund|discount)\b)/g,"A ")
    .replace(/\s+/g," ").trim();
}
function cleanText(value){
  const lines=String(value||"").replace(/\r/g,"").split("\n").map(cleanLine);
  const out=[];
  for(const line of lines){
    if(!line){if(out.length&&out.at(-1)!=="")out.push("");continue}
    if(/^(?:PART\s*[67]|Directions:|GO ON TO THE NEXT PAGE|TEST\s*\d+)$/i.test(line))continue;
    if(/^Questions?\s+\d{3}[-–]\d{3}\s+refer to/i.test(line))continue;
    if(/^\d{1,3}$/.test(line))continue;
    out.push(line.replace(/\bApositive\b/g,"A positive").replace(/\bAplay\b/g,"A play"));
  }
  while(out.at(-1)==="")out.pop();
  return out.join("\n").replace(/\n{3,}/g,"\n\n").trim();
}
function tsvLines(tsv){
  const rows=tsv.trim().split("\n").slice(1).map(line=>line.split("\t"));
  const grouped=new Map();
  for(const cells of rows){
    if(cells.length<12||!cells[11]?.trim())continue;
    const key=cells.slice(0,5).join(":");
    const word={left:Number(cells[6]),top:Number(cells[7]),width:Number(cells[8]),height:Number(cells[9]),text:cells[11]};
    const entry=grouped.get(key)||{words:[],left:Infinity,top:Infinity,right:0,bottom:0};
    entry.words.push(word);entry.left=Math.min(entry.left,word.left);entry.top=Math.min(entry.top,word.top);
    entry.right=Math.max(entry.right,word.left+word.width);entry.bottom=Math.max(entry.bottom,word.top+word.height);
    grouped.set(key,entry);
  }
  return [...grouped.values()].map(line=>({...line,text:cleanLine(line.words.sort((a,b)=>a.left-b.left).map(word=>word.text).join(" "))})).sort((a,b)=>a.top-b.top||a.left-b.left);
}
function findMaterialBounds(image,first,last){
  const {width,height}=dimensions(image);
  const lines=tsvLines(ocr(image,11,"tsv"));
  const heading=lines.find(line=>new RegExp(`Questions?\\s+${first}\\s*[-–]\\s*${last}\\s+refer to`,"i").test(line.text));
  const findQuestionBoundary=sourceLines=>{
    const numberedQuestion=sourceLines.filter(line=>new RegExp(`(^|\\s)${first}[.)]\\s+`).test(line.text)&&!/^Questions?/i.test(line.text)).sort((a,b)=>b.top-a.top)[0];
  // Low-resolution scans sometimes lose the dot after the printed number,
  // but the first answer label remains a reliable boundary signal. Do not
  // confuse the same number printed under a Part 6 blank with the question.
    const choiceQuestion=sourceLines.filter(line=>new RegExp(`^${first}[.)]?\\s+\\(?A\\)?(?:\\s|$)`,"i").test(line.text)).sort((a,b)=>b.top-a.top)[0];
    return [numberedQuestion,choiceQuestion].filter(Boolean).sort((a,b)=>b.top-a.top)[0];
  };
  // Sparse-text segmentation may omit a small question number. Retry the
  // boundary only with block segmentation before falling back to the footer.
  let question=findQuestionBoundary(lines);
  if(question&&question.top<height*.28)question=null;
  if(!question)question=findQuestionBoundary(tsvLines(ocr(image,6,"tsv")));
  if(question&&question.top<height*.28)question=null;
  if(!question){
    const blockLines=tsvLines(ocr(image,6,"tsv"));
    const siblingBoundaries=[];
    for(let id=first+1;id<=last;id++){
      const match=blockLines.filter(line=>line.top>height*.28&&new RegExp(`(^|\\s)${id}[.)]?\\s+\\(?A\\)?(?:\\s|$)`,"i").test(line.text)).sort((a,b)=>b.top-a.top)[0];
      if(match)siblingBoundaries.push(match);
    }
    if(siblingBoundaries.length)question=siblingBoundaries.sort((a,b)=>a.top-b.top)[0];
  }
  const footer=lines.find(line=>/GO ON TO THE NEXT PAGE/i.test(line.text));
  // Preserve the complete printable page. The former fixed 80.5% crop
  // removed the right side of wide tables/e-mails and the first 8% of every
  // continuation page.
  const x=Math.round(width*.03);
  const right=Math.round(width*.97);
  const top=Math.max(0,Math.floor(heading ? heading.bottom+12 : height*.015));
  const bottom=Math.min(height,Math.floor((question?.top??footer?.top??height*.985)-14));
  return {x,y:top,width:right-x,height:bottom-top,sourceWidth:width,sourceHeight:height,hasHeading:Boolean(heading),hasQuestion:Boolean(question)};
}
function publishSourceLayout(source,target){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const temporary=`${target}.${process.pid}.tmp.jpg`;
  // The visual source of truth is the complete original page. OCR uses a
  // separate bounded crop below, but the learner must always be able to zoom
  // the untouched page when tables, columns or continuation text are close
  // to a detected boundary.
  fs.copyFileSync(source,temporary);
  fs.renameSync(temporary,target);
}
function cropTemp(source,dir,name,x,y,width,height,scale=1.8){
  const target=path.join(dir,`${name}.png`);
  run("ffmpeg",["-hide_banner","-loglevel","error","-y","-i",source,"-vf",`crop=${width}:${height}:${x}:${y},scale=${Math.round(width*scale)}:-2,format=gray`,target]);
  return target;
}
function parseQuestionBlocks(text,expected){
  const expectedSet=new Set(expected);
  const lines=String(text||"").replace(/\r/g,"").split("\n").map(cleanLine).filter(Boolean);
  const result=[];
  let current=null,currentChoice=null;
  const flush=()=>{
    if(!current)return;
    const choices="ABCD".split("").map(letter=>cleanLine(current.choices[letter]||""));
    let question=cleanLine(current.question.join(" "));
    for(const id of expected)if(id!==current.id)question=question.replace(new RegExp(`\\s+${id}[.)]?\\s*$`),"");
    result.push({id:current.id,question,choices,source:current.source});current=null;currentChoice=null;
  };
  for(const line of lines){
    // Column OCR may leave one or two border glyphs before the printed number.
    // Accept a short noisy prefix, but still require one of this unit's exact
    // expected IDs and a printed period/parenthesis.
    const questionMatch=/^.{0,6}?\b(\d{3})[.)]\s*(.*)$/.exec(line);
    if(questionMatch&&expectedSet.has(Number(questionMatch[1]))){
      flush();
      const remainder=questionMatch[2];
      const inlineChoice=/^\(?([A-D])\)\s*(.*)$/.exec(remainder);
      current={id:Number(questionMatch[1]),question:inlineChoice?[]:[remainder],choices:{},source:text};
      if(inlineChoice){currentChoice=inlineChoice[1];current.choices[currentChoice]=inlineChoice[2]}
      continue;
    }
    if(!current)continue;
    if(/^(?:GO ON TO THE NEXT PAGE|TEST\s*\d+|PART\s*[67])\b/i.test(line)){flush();continue}
    const choice=/^\(?([A-D])\)[.)]?\s*(.*)$/.exec(line);
    if(choice){currentChoice=choice[1];current.choices[currentChoice]=choice[2];continue}
    if(currentChoice)current.choices[currentChoice]+=` ${line}`;else current.question.push(line);
  }
  flush();
  return result;
}
function blockScore(block,part){
  let score=0;
  if(block.region==="column")score+=50;
  if(block.choices.length===4&&block.choices.every(Boolean))score+=40;
  if(part===7&&/\?$/.test(block.question))score+=25;
  if(part===7&&/\?/.test(block.question))score+=18;
  if(/best belong\?/i.test(block.question))score+=30;
  if(part===7&&block.question.trim().split(/\s+/).length<5)score-=60;
  if(part===6)score+=10;
  score+=Math.min(20,block.choices.join(" ").split(/\s+/).length);
  if(block.choices.some(choice=>/GO ON|TEST\s*\d+|PART\s*[67]/i.test(choice)))score-=30;
  if(block.choices.some(choice=>/\([A-D]\)\s*$|\([A-D]\s*\([A-D]/.test(choice)))score-=35;
  if(block.question.match(/\?/g)?.length>1)score-=20;
  if(/\b\d{3}[.)]\s+/.test(block.question))score-=55;
  if(looksOcrNoise(block.question))score-=90;
  if(block.choices.some(choice=>choiceHazards(choice,part).length))score-=130;
  if(block.choices.some(incompleteChoice))score-=35;
  if(block.region==="question-column")score+=45;
  return score;
}
function lexicalTokens(value){return cleanLine(value).toLowerCase().match(/[a-z0-9]+/g)||[]}
function looksOcrNoise(value){
  const text=cleanLine(value);
  if(/[<>{}@]|GO ON TO THE NEXT PAGE|Stop! This is the end|SOONTO|ENE CE|\b(?:LSAL|SICI|SOOD)\b/i.test(text))return true;
  const longCaps=text.match(/\b[A-Z]{6,}\b/g)||[];
  return longCaps.some(word=>!new Set(["QUESTIONS","INTERNET","CUSTOMERS","COMPANY","ACCORDING","SUGGESTED","FOLLOWING"]).has(word));
}
function choiceHazards(value,part){
  const text=cleanLine(value),hazards=[];
  if(looksOcrNoise(text))hazards.push("ocr-symbol");
  if(/\b\d{3}[.)](?:\s|$)\s*\(?[A-D]?\b/.test(text))hazards.push("nested-question");
  if(/\([A-D]\)?(?:\s|$)/.test(text))hazards.push("nested-choice");
  if(/[\[\]{}|¦#Ф]/.test(text)&&!/^\[[1-4]\]$/.test(text))hazards.push("layout-glyph");
  if(part===6&&/[A-Za-z.)]\s+\d{1,2}$/.test(text))hazards.push("page-number");
  if(part===6&&/\b(?:ifso|Itis|A\s+(?:dditionally|lthough|ltogether|lready|fter|bove|utomotive|venue|delaide))\b/i.test(text))hazards.push("joined-word");
  if(part===6&&/\b(?:behealthier|atwork|thesedesks|beconducted|accessto|moreexpensive)\b/i.test(text))hazards.push("joined-word");
  return hazards;
}
function normalizeChoiceSet(values,part){
  const choices=values.map(cleanLine);
  const trailingPage=choices.map((choice,index)=>({index,match:/^(.*[A-Za-z.)])\s+(\d{2})$/.exec(choice)})).filter(entry=>entry.match);
  const choicesWithNumbers=choices.filter(choice=>/\d/.test(choice)).length;
  if(trailingPage.length===1&&choicesWithNumbers===1){
    const entry=trailingPage[0];
    if(part===6||Number(entry.match[2])>=40)choices[entry.index]=entry.match[1].trim();
  }
  return choices.map(choice=>choice.replace(/^(.*\b\d{1,3})\s+[a-z]{1,4}\?$/i,"$1").trim());
}
function blockChoiceHazards(choices,part){
  const hazards=choices.flatMap(choice=>choiceHazards(choice,part));
  if(part===6){
    const sentenceChoices=choices.filter(choice=>lexicalTokens(choice).length>=5);
    if(sentenceChoices.length>=3&&sentenceChoices.some(choice=>!/[.!?]["']?$/.test(cleanLine(choice))))hazards.push("truncated-sentence-choice");
  }
  return hazards;
}
function preferCompleteText(scanned,legacy,{question=false,choice=false,part=0}={}){
  const left=lexicalTokens(scanned),right=lexicalTokens(legacy);
  if(!left.length||!right.length)return scanned||legacy;
  const leftSet=new Set(left),rightSet=new Set(right);
  const overlap=[...leftSet].filter(token=>rightSet.has(token)).length/Math.min(leftSet.size,rightSet.size);
  if(overlap<.72)return scanned;
  const legacyLooksSafe=!looksOcrNoise(legacy)&&(!choice||!choiceHazards(legacy,part).length);
  const scannedLooksSafe=!looksOcrNoise(scanned)&&(!choice||!choiceHazards(scanned,part).length);
  if(!legacyLooksSafe)return scanned;
  if(!scannedLooksSafe)return cleanLine(legacy);
  if(question&&/closest in meaning to\s*$/i.test(legacy)&&/clos.*meaning/i.test(scanned))return cleanLine(legacy);
  if(question&&/\?/.test(legacy)&&!/\?/.test(scanned))return cleanLine(legacy);
  if(right.length>=left.length&&right.length-left.length<=8)return cleanLine(legacy);
  return scanned;
}
function deinterleaveQuestion(value){
  let question=cleanLine(value);
  question=question.replace(/^(For whom .+? most likely)\s+\d{3}[.)].*\b(intended\?)$/i,"$1 $2");
  question=question.replace(/^(What would .+? customers)\s+\d{3}[.)].*?\?\s+(who visit .+\?)$/i,"$1 $2");
  question=question.replace(/(most likely provide)\s+\d{3}[.)]\s*[|¦]?\s*(to .+\?)$/i,"$1 $2");
  return question;
}
function questionRegionTop(image,expected){
  const {height}=dimensions(image);
  const lines=tsvLines(ocr(image,11,"tsv"));
  const lastOccurrence=[];
  for(const id of expected){
    const matches=lines.filter(line=>new RegExp(`(^|\\s)${id}[.)]\\s*`).test(line.text)&&!/^Questions?/i.test(line.text));
    if(matches.length)lastOccurrence.push(matches.sort((a,b)=>b.top-a.top)[0].top);
  }
  if(!lastOccurrence.length)return null;
  const top=Math.max(0,Math.min(...lastOccurrence)-24);
  return top<height*.97?top:null;
}
function incompleteChoice(value){
  const tokens=lexicalTokens(value);
  return tokens.length>3&&/\b(?:a|an|the|to|of|for|with|your|their|be|have|and|or|if|would|could|should|from|in|on|at)\.?$/i.test(cleanLine(value));
}
function safeLegacyBlock(item,expected,part){
  const question=cleanLine(item.question||"");
  const choices=(item.choices||[]).map(cleanLine);
  if(choices.length!==4||choices.some(choice=>!choice||incompleteChoice(choice))||blockChoiceHazards(choices,part).length)return false;
  if(part===7&&(!/\?/.test(question)&&!/closest in meaning to\s*$/i.test(question)))return false;
  if(expected.some(id=>id!==Number(item.item_id)&&new RegExp(`\\b${id}[.)]`).test(question)))return false;
  return !looksOcrNoise(question);
}
function questionCandidates(images,expected,part,tempDir,existingItems=[]){
  const candidates=[];
  for(const [imageIndex,image] of images.entries()){
    const {width,height}=dimensions(image);
    const crops=[
      cropTemp(image,tempDir,`q-${imageIndex}-left`,0,0,Math.round(width*.445),height),
      cropTemp(image,tempDir,`q-${imageIndex}-left-balanced`,0,0,Math.round(width*.475),height),
      cropTemp(image,tempDir,`q-${imageIndex}-left-mid`,0,0,Math.round(width*.49),height),
      cropTemp(image,tempDir,`q-${imageIndex}-left-wide`,0,0,Math.round(width*.52),height),
      cropTemp(image,tempDir,`q-${imageIndex}-right-wide`,Math.round(width*.42),0,width-Math.round(width*.42),height),
      cropTemp(image,tempDir,`q-${imageIndex}-right-mid`,Math.round(width*.47),0,width-Math.round(width*.47),height),
      cropTemp(image,tempDir,`q-${imageIndex}-right-narrow`,Math.round(width*.51),0,width-Math.round(width*.51),height)
    ];
    for(const cropFile of crops){
      for(const psm of [6,11])candidates.push(...parseQuestionBlocks(ocr(cropFile,psm),expected).map(block=>({...block,region:"column"})));
    }
    // The same question number also appears below each Part 6 blank. Locate
    // the bottom-most occurrence of every expected ID, then OCR only the
    // printed question area. This prevents passage text and the opposite
    // column from being appended to choices.
    const questionTop=questionRegionTop(image,expected);
    if(questionTop!==null){
      const questionHeight=height-questionTop;
      const questionCrops=[
        cropTemp(image,tempDir,`q-${imageIndex}-questions-left`,0,questionTop,Math.round(width*.505),questionHeight,2.1),
        cropTemp(image,tempDir,`q-${imageIndex}-questions-right`,Math.round(width*.495),questionTop,width-Math.round(width*.495),questionHeight,2.1)
      ];
      for(const cropFile of questionCrops){
        for(const psm of [6,11])candidates.push(...parseQuestionBlocks(ocr(cropFile,psm),expected).map(block=>({...block,region:"question-column"})));
      }
    }
    candidates.push(...parseQuestionBlocks(ocr(image,3),expected).map(block=>({...block,region:"full"})));
  }
  // A clean legacy field may fill a block that Tesseract entirely misses, but
  // it receives no source-scan score bonus and must pass the same strict final
  // validator. This is a fallback, never the primary OCR source.
  for(const item of existingItems)candidates.push({id:Number(item.item_id),question:cleanLine(item.question||""),choices:(item.choices||[]).map(cleanLine),region:"legacy",source:"published canonical fallback"});
  const chosen=new Map();
  for(const candidate of candidates){
    const previous=chosen.get(candidate.id);
    if(!previous||blockScore(candidate,part)>blockScore(previous,part))chosen.set(candidate.id,candidate);
  }
  for(const item of existingItems){
    const candidate=chosen.get(Number(item.item_id));
    if(!candidate)continue;
    if(safeLegacyBlock(item,expected,part)){
      candidate.question=cleanLine(item.question||"");
      candidate.choices=(item.choices||[]).map(cleanLine);
      candidate.region="verified-legacy";
    }
    candidate.question=preferCompleteText(candidate.question,item.question||"",{question:part===7});
    candidate.choices=candidate.choices.map((choice,index)=>preferCompleteText(choice,item.choices?.[index]||"",{choice:true,part}));
    candidate.choices=normalizeChoiceSet(candidate.choices,part);
    for(const id of expected)if(id!==Number(item.item_id))candidate.question=candidate.question.replace(new RegExp(`\\s+${id}[.)]?\\s*$`),"");
    candidate.question=candidate.question.replace(/\bis\s+clos.*$/i,"is closest in meaning to");
    candidate.question=deinterleaveQuestion(candidate.question);
    // A neighbouring column can insert its printed question number in the
    // middle of an otherwise intact stem. Remove only exact IDs belonging to
    // this unit; never guess or delete ordinary numbers from the question.
    for(const id of expected){
      if(id!==Number(item.item_id))candidate.question=candidate.question.replace(new RegExp(`\\s+${id}[.)]\\s+`,"g")," ");
    }
    for(const id of expected){
      if(id===Number(item.item_id))continue;
      const embedded=new RegExp(`\\s+${id}[.)]\\s+`);
      if(!embedded.test(candidate.question))continue;
      const legacy=cleanLine(item.question||"");
      if(legacy&&!embedded.test(legacy))candidate.question=legacy;
      else if(candidate.question.includes("?"))candidate.question=candidate.question.slice(0,candidate.question.indexOf("?")+1);
      else candidate.question=candidate.question.replace(new RegExp(`\\s+${id}[.)].*?(?=is closest in meaning to)`,"i")," ");
    }
  }
  return chosen;
}
function repairPart6Blanks(text,expected){
  let value=cleanText(text);
  const candidates=[];
  const regexp=/\b\d{3}\b[.,]?/g;
  for(const match of value.matchAll(regexp)){
    const number=Number(match[0].replace(/\D/g,""));
    if(number>=120&&number<=499)candidates.push({index:match.index,length:match[0].length});
  }
  const usable=candidates.slice(0,expected.length);
  if(usable.length===expected.length){
    for(let i=usable.length-1;i>=0;i--){const token=usable[i],marker=`【${expected[i]}】 ______`;value=value.slice(0,token.index)+marker+value.slice(token.index+token.length)}
  }
  return value;
}
function validateUnit(detail,recovered){
  const errors=[];
  if(recovered.layoutImages.length<1)errors.push("缺少材料版面图");
  if(detail.part===6){
    const markers=[...recovered.passage.matchAll(/【(\d{3})】/g)].map(match=>Number(match[1]));
    // The source-layout crop is authoritative. OCR often drops the tiny
    // number printed below a Part 6 dashed blank, so an absent marker does not
    // invalidate a page whose original layout is present.
    if(markers.length&&markers.join(",")!==detail.items.map(item=>item.item_id).join(","))errors.push(`空格题号异常：${markers.join(",")}`);
  }
  for(const item of detail.items){
    const candidate=recovered.blocks.get(item.item_id);
    if(!candidate){errors.push(`${item.item_id} 未识别题块`);continue}
    if(candidate.choices.length!==4||candidate.choices.some(choice=>!choice))errors.push(`${item.item_id} 选项不完整`);
    if(blockChoiceHazards(candidate.choices,detail.part).length||candidate.choices.some(choice=>/(?:[A-Z]{5,}[^A-Z\s])/.test(choice)))errors.push(`${item.item_id} 选项含OCR噪声`);
    if(detail.part===7&&!/\?/.test(candidate.question)&&!/closest in meaning to\s*$/i.test(candidate.question))errors.push(`${item.item_id} 题干未完整到问号`);
    if(detail.part===7){
      const nested=detail.items.filter(other=>other.item_id!==item.item_id).some(other=>new RegExp(`\\b${other.item_id}[.)]`).test(candidate.question));
      if(nested)errors.push(`${item.item_id} 题干混入其他题号`);
    }
  }
  const forbidden=/GO ON TO THE NEXT PAGE|\bPART\s*[67]\b|\bTEST\s*\d+\b/i;
  if(forbidden.test(recovered.passage))errors.push("正文混入页眉页脚");
  return errors;
}
function sourceImages(bankId,unit,nextUnit){
  const dir=path.join(scanRoot,bankId,"images",`part${unit.part}`);
  if(!fs.existsSync(dir))return {own:[],questionCandidates:[]};
  const base=`q${unit.source_group_id}`;
  const names=fs.readdirSync(dir).filter(name=>/\.jpe?g$/i.test(name));
  const own=names.filter(name=>name===`${base}.jpg`||name.startsWith(`${base}-p`)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(name=>path.join(dir,name));
  // Several source books place a group's questions at the top of the first
  // image named for the following group. Inspect that adjacent image too, but
  // never publish it as this group's material unless its heading matches.
  const nextBase=nextUnit?`q${nextUnit.source_group_id}`:"";
  const adjacent=nextBase?names.filter(name=>name===`${nextBase}.jpg`||name===`${nextBase}-p1.jpg`).map(name=>path.join(dir,name)):[];
  return {own,questionCandidates:[...own,...adjacent]};
}
function invalidateDerived(detail,changedItems){
  for(const field of DERIVED_FIELDS)delete detail.context[field];
  delete detail.knowledge_accumulation;
  for(const item of detail.items){
    if(!changedItems.has(item.item_id))continue;
    for(const field of ITEM_DERIVED_FIELDS)delete item[field];
  }
}
function applyImageVerifiedOverrides(bankId,unitId,blocks){
  for(const [key,override] of READING_ITEM_OVERRIDES){
    const [overrideBank,overrideUnit,idText]=key.split("/");
    if(overrideBank!==bankId||overrideUnit!==unitId)continue;
    const id=Number(idText),block=blocks.get(id);
    if(!block)throw new Error(`${key}：OCR 未生成对应题块，无法应用图像复核覆盖`);
    if(override.question)block.question=override.question;
    block.choices=override.choices.map(cleanLine);
    block.region="image-verified-override";
  }
}

const catalog=readJson(path.join(dataRoot,"catalog.json"));
const reports=[];
let processed=0;
for(const bank of catalog.banks){
  if(bankOnly&&bank.bank_id!==bankOnly)continue;
  const indexFile=path.join(dataRoot,bank.index_path),index=readJson(indexFile);
  let indexChanged=false;
  const readingUnits=index.units.filter(unit=>unit.part===6||unit.part===7);
  for(const [readingIndex,unit] of readingUnits.entries()){
    if(unitOnly&&unit.unit_id!==unitOnly)continue;
    if(limit&&processed>=limit)break;
    processed++;
    const detailFile=path.join(dataRoot,unit.detail_path),detail=readJson(detailFile);
    const {own:materialSourceImages,questionCandidates:images}=sourceImages(bank.bank_id,unit,readingUnits[readingIndex+1]);
    const expected=detail.items.map(item=>item.item_id);
    const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),"toeic-reading-ocr-"));
    try{
      if(!images.length){reports.push({bank_id:bank.bank_id,unit_id:unit.unit_id,status:"failed",errors:["找不到原始扫描图"]});continue}
      const layoutImages=[];
      const materialTexts=[];
      const materialBounds=materialSourceImages.map(image=>findMaterialBounds(image,expected[0],expected.at(-1)));
      const hasAnyHeading=materialBounds.some(bounds=>bounds.hasHeading);
      let materialStarted=!hasAnyHeading;
      for(const [imageIndex,image] of materialSourceImages.entries()){
        const bounds=materialBounds[imageIndex];
        if(bounds.hasHeading)materialStarted=true;
        const shouldUse=materialStarted&&bounds.height>180;
        if(!shouldUse)continue;
        const relative=`${bank.bank_id}/reading-layout/${unit.unit_id}-${imageIndex+1}.jpg`;
        const target=path.join(assetRoot,...relative.split("/"));
        if(write)publishSourceLayout(image,target);
        const ocrTarget=cropTemp(image,tempDir,`material-${imageIndex}`,bounds.x,bounds.y,bounds.width,bounds.height,1.5);
        materialTexts.push(ocr(ocrTarget,detail.part===6?6:3));
        layoutImages.push({path:`reading-layout/${unit.unit_id}-${imageIndex+1}.jpg`,asset_key:relative,exists:true,width:bounds.sourceWidth,height:bounds.sourceHeight,source_width:bounds.sourceWidth,source_height:bounds.sourceHeight,crop:{x:0,y:0,width:bounds.sourceWidth,height:bounds.sourceHeight},ocr_crop:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},source:path.relative(scanRoot,image).split(path.sep).join("/")});
      }
      const blocks=questionCandidates(images,expected,detail.part,tempDir,detail.items);
      applyImageVerifiedOverrides(bank.bank_id,unit.unit_id,blocks);
      let passage=cleanText(materialTexts.join("\n\n"));
      if(detail.part===6)passage=repairPart6Blanks(passage,expected);
      const recovered={passage,blocks,layoutImages};
      const errors=validateUnit(detail,recovered);
      const report={bank_id:bank.bank_id,unit_id:unit.unit_id,part:detail.part,status:errors.length?"failed":"ready",errors,source_images:materialSourceImages.map(image=>path.relative(scanRoot,image).split(path.sep).join("/")),question_candidate_images:images.map(image=>path.relative(scanRoot,image).split(path.sep).join("/")),recognized_items:[...blocks.keys()].sort((a,b)=>a-b),...(errors.length?{debug:{passage,blocks:Object.fromEntries(blocks)}}:{})};
      reports.push(report);
      if(errors.length||!write)continue;
      const changedItems=new Set();
      detail.context.passage=passage;
      detail.context.reading_layout_images=layoutImages;
      detail.context.reading_ocr={schema_version:OCR_SCHEMA,engine:OCR_ENGINE,source_hash:filesSha(images),verified_item_ids:expected,layout_authority:"source_scan"};
      for(const item of detail.items){
        const block=blocks.get(item.item_id);
        const before=JSON.stringify([item.question,item.choices]);
        if(detail.part===7)item.question=block.question;
        item.choices=block.choices;
        if(before!==JSON.stringify([item.question,item.choices]))changedItems.add(item.item_id);
      }
      invalidateDerived(detail,changedItems);
      atomicJson(detailFile,detail);
      unit.asset_refs=[...(unit.asset_refs||[]).filter(ref=>!ref.includes("/reading-layout/")),...layoutImages.map(image=>image.asset_key)];
      indexChanged=true;
    }finally{fs.rmSync(tempDir,{recursive:true,force:true})}
  }
  if(write&&indexChanged){index.content_hash=sha(JSON.stringify(index.units));atomicJson(indexFile,index)}
  if(limit&&processed>=limit)break;
}

const summary={schema_version:OCR_SCHEMA,write,scan_root:scanRoot,processed,ready:reports.filter(report=>report.status==="ready").length,failed:reports.filter(report=>report.status==="failed").length,failures:reports.filter(report=>report.status==="failed"),reports};
const reportFile=path.resolve(valueAfter("--report")||path.join(projectRoot,"outputs/reading-layout-ocr-report.json"));
fs.mkdirSync(path.dirname(reportFile),{recursive:true});
atomicJson(reportFile,summary);
console.log(JSON.stringify({processed:summary.processed,ready:summary.ready,failed:summary.failed,report:reportFile},null,2));
if(summary.failed)process.exitCode=1;
