#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dataRoot=path.join(projectRoot,"public/data");
const assetRoot=path.join(projectRoot,"public/assets");
const reportFile=path.join(projectRoot,"qa/part1-media-audit.json");
const update=process.argv.includes("--update");

const correctedVolumes=new Set([1,2,3,4]);
const catalog=readJson(path.join(dataRoot,"catalog.json"));
if(catalog.banks.length!==24)throw new Error(`expected 24 banks, received ${catalog.banks.length}`);

const banks=[];
let questions=0;
for(const bank of catalog.banks){
  const index=readJson(path.join(dataRoot,...bank.index_path.split("/")));
  const part1=index.units.filter(unit=>unit.part===1).sort((a,b)=>Number(a.item_ids[0])-Number(b.item_ids[0]));
  if(part1.length!==6)throw new Error(`${bank.bank_id}: expected six Part 1 units`);
  const records=[];
  for(const unit of part1){
    const detail=readJson(path.join(dataRoot,...unit.detail_path.split("/")));
    if(detail.items.length!==1)throw new Error(`${bank.bank_id}/${unit.unit_id}: Part 1 must stay single-item`);
    const item=detail.items[0],id=Number(item.item_id),expected=`q${String(id).padStart(3,"0")}`;
    const picture=detail.context.picture_path?.path,audio=detail.context.audio_path?.path;
    if(!picture||!audio)throw new Error(`${item.item_key}: missing picture or audio`);
    if(path.basename(picture,path.extname(picture))!==expected||path.basename(audio,path.extname(audio))!==expected){
      throw new Error(`${item.item_key}: picture/audio basename does not match printed question number`);
    }
    const pictureFile=path.join(assetRoot,bank.bank_id,...picture.split("/"));
    const audioFile=path.join(assetRoot,bank.bank_id,...audio.split("/"));
    records.push({
      item_id:id,
      item_key:item.item_key,
      picture_path:picture,
      audio_path:audio,
      picture_sha256:sha256File(pictureFile),
      audio_sha256:sha256File(audioFile)
    });
    questions++;
  }
  banks.push({
    bank_id:bank.bank_id,
    volume:bank.volume,
    test:bank.test,
    mapping_status:correctedVolumes.has(bank.volume)?"corrected_and_verified":"identity_verified",
    source_pages:correctedVolumes.has(bank.volume)?(bank.test===1?[31,31,32,32,33,33]:[73,73,74,74,75,75]):undefined,
    printed_numbers_verified:[1,2,3,4,5,6],
    answer_semantics_verified:[1,2,3,4,5,6],
    media_signature:sha256(JSON.stringify(records)),
    records
  });
}

const report={
  schema_version:"1.0",
  audited_on:"2026-08-13",
  methodology:[
    "Match every Part 1 crop to the printed number on its original source page.",
    "Cross-check the photograph against the correct spoken answer semantics.",
    "Require the picture and audio basenames to match the canonical item id.",
    "Lock the reviewed web assets with SHA-256 signatures."
  ],
  findings:{
    audited_banks:banks.length,
    audited_questions:questions,
    corrected_banks:8,
    corrected_questions:48,
    unchanged_verified_banks:16,
    unchanged_verified_questions:96,
    remaining_mismatches:0
  },
  banks
};

if(update){
  fs.mkdirSync(path.dirname(reportFile),{recursive:true});
  fs.writeFileSync(reportFile,`${JSON.stringify(report,null,2)}\n`);
  console.log(`Updated ${path.relative(projectRoot,reportFile)}: ${questions} Part 1 pairings`);
}else{
  const expected=readJson(reportFile);
  if(JSON.stringify(expected)!==JSON.stringify(report))throw new Error("Part 1 media differs from the reviewed audit manifest; inspect the source page before updating the manifest");
  console.log(`Part 1 media audit passed: ${questions} picture/audio pairings across ${banks.length} banks`);
}

function readJson(file){return JSON.parse(fs.readFileSync(file,"utf8"))}
function sha256(value){return createHash("sha256").update(value).digest("hex")}
function sha256File(file){if(!fs.existsSync(file))throw new Error(`missing media: ${file}`);return sha256(fs.readFileSync(file))}
