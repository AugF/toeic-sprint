#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {hasCurrentPart5Review} from "./apply-part5-reviewed-aids.mjs";

// A missing word is never reconstructed from the answer. Geometry and a
// human-reviewed source manifest are required before publishing a source crop.
export const VERSION = "part5-source-review-v1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_URL = "https://kanazawa-u.repo.nii.ac.jp/record/2002264/files/2436-3464-28-1-37.pdf";
const sha = value => createHash("sha256").update(value).digest("hex");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); };

// These sentences contain damaged English even though an ordinary character
// whitelist and four-choice count both pass. Keep the problem visible until
// the actual scan is provided. Entries are bank + exact printed question ID.
const REVIEW_IDS = {
  "official-1-test-1": [102,105,117,122,123,124,125,126,127,128,130],
  "official-1-test-2": [101,103,104,106,118,121,123,124,125,126,127],
  "official-2-test-1": [106,113,118,121,122],
  "official-2-test-2": [103,106,108,119,123,124,125,126,127,128,129,130],
  "official-3-test-1": [107,108,109,110,111,112,113,114,116,126,127,129,130],
  "official-3-test-2": [103,104,106,107,108,109,110,111,112,113,114,118,129],
  "official-4-test-1": [101,102,103,104,108,116,117,118,121,122,124],
  "official-4-test-2": [101,102,103,105,107,109,117,123,124,125,126,128,130],
  "official-5-test-1": [102,117,130],
  "official-5-test-2": [115,116,121],
  "official-6-test-1": [107,116,118,119,121,125],
  "official-6-test-2": [111,119,125,127],
  "official-7-test-1": [101,102,108,121,124,127,129,130],
  "official-7-test-2": [110,113,115],
  "official-8-test-1": [101,102,125,128,130],
  "official-8-test-2": [102,109,111,113,123],
  "official-9-test-1": [110,116,117,120,126,127,130],
  "official-9-test-2": [102,103,112,114,118,119,121,128],
  "official-10-test-1": [102,120,121],
  "official-10-test-2": [101,107,112,115,119],
  "official-11-test-2": [104,110,117,118,121,124],
  "official-12-test-1": [101,103,104,107,111,114,126,128,130],
  "official-12-test-2": [109,111],
};

export function normalizePart5Question(value) {
  let text = String(value || "").replace(/\r?\n/g, " ").replace(/[\u00a0\u200b\ufeff]/g, " ");
  // A standalone dash, underscores, or a mixed dash/dot run is an existing
  // OCR blank. Never insert a brand-new blank into a sentence that has none.
  text = text.replace(/[-_—–•.]{2,}/g, (run, offset, source) => {
    if (!/[-_—–•]/.test(run) && run.length < 3) return run;
    const atSentenceEnd = /^[\s\d()]*$/.test(source.slice(offset + run.length));
    const hasFinalPeriod = /\.$/.test(run) && atSentenceEnd;
    return ` ${/^-{2,}$/.test(run) ? run : "-------"}${hasFinalPeriod ? "." : ""} `;
  });
  text = text.replace(/(?<![\w\-_—–•])[-_—–•](?:\s+[-_—–•])+(?![\w\-_—–•])/g, " ------- ");
  text = text.replace(/(?<![\w\-_—–•])[-_—–•](?=\s|$|[A-Z])/g, " ------- ");
  text = text.replace(/(?<![\w\-_—–•])[-_—–•]+(?:\s+[-_—–•]+)+(?![\w\-_—–•])/g, " ------- ");
  return text.replace(/\s+/g, " ").replace(/\s+([.,;?!])/g, "$1").trim();
}

export function auditPart5Item(item, bankId) {
  const question = String(item.question || "");
  const choices = item.choices || [];
  const issues = [];
  const blanks = question.match(/[-_—–]{2,}/g) || [];
  if (blanks.length !== 1) issues.push(blanks.length ? "multiple_blanks_or_cross_column_text" : "missing_blank");
  if (!/[.!?][\x22\x27”’]?\s*$/.test(question)) issues.push("sentence_end_missing_or_contaminated");
  if (/\b1[0-3]\d[.)]\s/.test(question)) issues.push("neighbour_question_number");
  if (/[^\x20-\x7e\p{Script=Latin}’‘“”–—£€]/u.test(question + choices.join(" "))) issues.push("unexpected_characters");
  if (/\b(?:TEST\s*[12]|PART\s*5)\b|[|={}<>\\]/.test(question + " " + choices.join(" "))) issues.push("page_or_ocr_debris");
  if (question.split(/\s+/).length < 7) issues.push("short_or_incomplete_sentence");
  if (choices.length !== 4 || choices.some(c => !String(c).trim())) issues.push("missing_options");
  if (!/^[ABCD]$/.test(item.answer || "")) issues.push("invalid_answer_letter");
  if (choices.some(c => /\b\d+[)’]?$|\b[A-Za-z]\s*[:=»]$/.test(c))) issues.push("option_ocr_debris");
  if (REVIEW_IDS[bankId]?.includes(Number(item.item_id))) issues.push("manual_review_found_damaged_text");
  return [...new Set(issues)];
}

export function repairPart5Item(item, bankId) {
  // A subsequent OCR audit must not invalidate exact-input human review or
  // resurrect already-removed cross-column fragments from old bank rules.
  // Any change to question, ordered choices or answer breaks this guard.
  if(hasCurrentPart5Review(item))return {item:structuredClone(item),changed:false,issues:[]};
  const before = {question:item.question, choices:[...item.choices]};
  const question = normalizePart5Question(item.question);
  const result = {...item, question};
  // Page headers are not answer choices. This repair cannot change the answer
  // order or introduce a missing option word.
  result.choices = item.choices.map(choice => String(choice).replace(/\s+TEST(?:\s*[12])?\s*$/i, "").trim());
  const sources = [];
  const neighbouringNumbers = {109:116,110:117,112:119,113:120,114:121};
  if (bankId === "official-1-test-1" && neighbouringNumbers[item.item_id]) {
    result.question = result.question.replace(new RegExp(`\\s+${neighbouringNumbers[item.item_id]}\\.(?=\\s|$)`), "").trim();
  }
  if (bankId === "official-1-test-1" && item.item_id === 101 && /copies of the ager that/.test(question)) {
    result.question = question.replace("copies of the ager that", "copies of the agenda that");
    sources.push({url:SOURCE_URL, location:"Example (14a), RD1_101", correction:"ager → agenda"});
  }
  const changed = JSON.stringify(before) !== JSON.stringify({question:result.question, choices:result.choices});
  const issues = auditPart5Item(result, bankId);
  if (issues.length) {
    result.content_review_status = "source_required";
    result.content_review_issues = issues;
    result.study_aid_status = {...result.study_aid_status, question_translation:"pending", analysis:"pending"};
    if (issues.some(x => /option|character|debris|damaged/.test(x))) result.study_aid_status.choice_translations = "pending";
  } else if (result.content_review_status === "source_required") {
    delete result.content_review_status;
    delete result.content_review_issues;
  }
  if (sources.length) {
    result.content_review_status = "text_corrected_with_reference";
    result.study_aid_status = {...result.study_aid_status, question_translation:"pending", analysis:"pending"};
  }
  const translation = String(item.question_translation || "");
  if (!/[\u3400-\u9fff]/.test(translation) || /中文辅助|离线预处理|[-_—–]{2,}|\.\.\./.test(translation) || !/\*\*[^*]+\*\*/.test(translation))
    result.study_aid_status = {...result.study_aid_status, question_translation:"pending"};
  if (!Array.isArray(item.choice_translations) || item.choice_translations.length !== 4 || item.choice_translations.some(c => !/[\u3400-\u9fff]/.test(c)))
    result.study_aid_status = {...result.study_aid_status, choice_translations:"pending"};
  const analysis = String(item.explanation_structured?.analysis || item.answer_explain || "");
  if (!analysis || /该项同时满足|其余选项至少|该项的词性或动词形态|原文依据：将/.test(analysis))
    result.study_aid_status = {...result.study_aid_status, analysis:"pending"};
  if (changed || issues.length) {
    result.content_review = {
      ...result.content_review,
      pipeline:VERSION,
      // Retain the first original OCR, not the normalized result of a rerun.
      original_question:result.content_review?.original_question ?? before.question,
      original_choices:result.content_review?.original_choices ?? before.choices,
      ...(sources.length ? {sources} : {}),
      text_sha256:sha(JSON.stringify({question:result.question, choices:result.choices})),
    };
  }
  return {item:result, changed, issues};
}

export function validateSourceEntry(entry, scanRoot) {
  if (!entry || !/^official-\d+-test-\d+$/.test(entry.bank_id || "") || !Number.isInteger(entry.item_id) || entry.item_id < 101 || entry.item_id > 130)
    throw new Error("Source manifest requires an exact bank ID and printed Part 5 item ID");
  if (entry.reviewed !== true) throw new Error("Source crop must be reviewed against the printed question number and A–D choices");
  if (typeof entry.source !== "string" || path.isAbsolute(entry.source) || entry.source.split(/[\\/]/).includes(".."))
    throw new Error("Source image must be a safe path relative to --scan-root");
  const source = path.resolve(scanRoot, entry.source);
  if (!fs.existsSync(source)) throw new Error(`Missing source image: ${source}`);
  if (!entry.sha256 || sha(fs.readFileSync(source)) !== entry.sha256) throw new Error(`Source hash mismatch: ${entry.source}`);
  const bounds = entry.crop;
  if (bounds && (![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isInteger) || bounds.x < 0 || bounds.y < 0 || bounds.width < 100 || bounds.height < 60))
    throw new Error("Invalid reviewed source crop bounds");
  return source;
}

export function sourceMediaRef(entry, dimensions) {
  const relativePath = `part5-source/q${entry.item_id}.jpg`;
  return {
    path:relativePath,
    asset_key:`${entry.bank_id}/${relativePath}`,
    exists:true,
    width:entry.crop?.width ?? dimensions.width,
    height:entry.crop?.height ?? dimensions.height,
    source_width:dimensions.width,
    source_height:dimensions.height,
    ...(entry.crop ? {crop:{...entry.crop}} : {}),
  };
}

export function registerSourceAssets(bankIndex, unitId, refs) {
  const summary = bankIndex.units?.find(unit => unit.unit_id === unitId);
  if (!summary) throw new Error(`Missing bank index entry: ${bankIndex.bank_id}/${unitId}`);
  summary.asset_refs = [...new Set([...(summary.asset_refs || []), ...refs.map(ref => ref.asset_key)])];
}

function publishSource(entry, scanRoot) {
  const source = validateSourceEntry(entry, scanRoot);
  const rel = `assets/${entry.bank_id}/part5-source/q${entry.item_id}.jpg`;
  const target = path.join(root, "public", rel);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  const bounds = entry.crop;
  const info = spawnSync("ffprobe", ["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","json",source], {encoding:"utf8"});
  if (info.status !== 0) throw new Error(`Cannot inspect source image dimensions: ${source}`);
  const dimensions = JSON.parse(info.stdout).streams?.[0];
  if (!dimensions?.width || !dimensions?.height) throw new Error(`Invalid source dimensions: ${source}`);
  if (bounds && (bounds.x + bounds.width > dimensions.width || bounds.y + bounds.height > dimensions.height))
    throw new Error(`Reviewed crop exceeds the actual image bounds: ${source}`);
  const filters = bounds ? [`crop=${bounds.width}:${bounds.height}:${bounds.x}:${bounds.y}`] : [];
  // Keep original resolution; JPEG q=2 preserves small printed characters.
  const args = ["-hide_banner","-loglevel","error","-y","-i",source];
  if (filters.length) args.push("-vf", filters.join(","));
  args.push("-frames:v","1","-q:v","2",target);
  const proc = spawnSync("ffmpeg", args, {encoding:"utf8"});
  if (proc.status !== 0) throw new Error(`Cannot publish source image: ${proc.stderr}`);
  return sourceMediaRef(entry, dimensions);
}

export function main(argv = process.argv.slice(2)) {
  const value = key => argv.includes(key) ? argv[argv.indexOf(key) + 1] : undefined;
  const doWrite = argv.includes("--write");
  const scanRoot = value("--scan-root");
  const manifestFile = value("--source-manifest");
  if (manifestFile && !scanRoot) throw new Error("--source-manifest requires --scan-root");
  const manifest = manifestFile ? read(path.resolve(manifestFile)) : {items:[]};
  const entries = new Map();
  for (const entry of manifest.items || []) {
    validateSourceEntry(entry, path.resolve(scanRoot));
    const key = `${entry.bank_id}/${entry.item_id}`;
    if (entries.has(key)) throw new Error(`Duplicate source assignment: ${key}`);
    entries.set(key, entry);
  }
  const report = {pipeline:VERSION, total:0, normalized_or_repaired:0, source_required:0, source_images:0, source_unavailable:0, pending_aids:{question_translation:0,choice_translations:0,analysis:0}, issue_counts:{}, items:[]};
  const banksRoot = path.join(root, "public/data/banks");
  for (const bank of fs.readdirSync(banksRoot).sort()) {
    const dir = path.join(banksRoot, bank, "units");
    const indexFile = path.join(banksRoot, bank, "index.json");
    const bankIndex = read(indexFile);
    let indexChanged = false;
    for (const name of fs.readdirSync(dir).filter(x => /^p5-\d+\.json$/.test(x)).sort()) {
      const file = path.join(dir, name), unit = read(file);
      let unitChanged = false;
      for (let index=0; index < unit.items.length; index++) {
        const original = unit.items[index];
        const {item, changed, issues} = repairPart5Item(original, bank);
        const entry = entries.get(`${bank}/${item.item_id}`);
        if (entry) {
          if (doWrite) {
            item.source_images = [publishSource(entry, path.resolve(scanRoot))];
            registerSourceAssets(bankIndex, unit.unit_id, item.source_images);
            indexChanged = true;
          }
          item.prefer_source_image = issues.length > 0 || entry.prefer_source_image === true;
          item.content_review_status = issues.length ? "source_image_available" : "source_verified";
          item.content_review = {...item.content_review, source_image_sha256:entry.sha256, source_question_id:item.item_id};
          report.source_images++;
        }
        if (issues.length) {
          report.source_required++;
          if (!entry && !item.source_images?.length) report.source_unavailable++;
        }
        if (changed) report.normalized_or_repaired++;
        report.total++;
        for (const field of Object.keys(report.pending_aids)) if (item.study_aid_status?.[field] === "pending") report.pending_aids[field]++;
        for (const issue of issues) report.issue_counts[issue] = (report.issue_counts[issue] || 0) + 1;
        if (changed || issues.length || entry) report.items.push({bank_id:bank, item_id:item.item_id, question:item.question, issues, source_available:Boolean(entry || item.source_images?.length), changed});
        unitChanged ||= JSON.stringify(original) !== JSON.stringify(item);
        unit.items[index] = item;
      }
      if (doWrite && unitChanged) writeJson(file, unit);
    }
    if (doWrite && indexChanged) writeJson(indexFile, bankIndex);
  }
  writeJson(value("--report") || path.join(root, "outputs/part5-source-recovery-report.json"), report);
  const {items,...summary} = report;
  console.log(JSON.stringify({...summary, write:doWrite}, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
