#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {sameStudySource, supportedEvidence, usableAnalysis, usableTranslation} from "./reading-study-aids.mjs";

export function restoreReadingAids(detail, previous, reference = "aac088a0") {
  const counts = {question_translations: 0, choice_translations: 0, passage_translations: 0, analyses: 0, removed_unreliable_fields: 0, removed_unverified_evidence: 0};
  const oldContext = previous?.context || {};
  const contextMatches = sameStudySource(detail.context.passage, oldContext.passage);
  const oldTranslation = oldContext.passage_translation || oldContext.content_translation;
  const currentTranslation = detail.context.passage_translation || detail.context.content_translation;
  if (!usableTranslation(currentTranslation, detail.context.passage)) {
    if (currentTranslation) counts.removed_unreliable_fields++;
    delete detail.context.passage_translation;
    delete detail.context.content_translation;
    if (contextMatches && usableTranslation(oldTranslation, oldContext.passage)) {
      detail.context.passage_translation = oldTranslation;
      counts.passage_translations++;
    }
  }
  detail.context.study_aid_status = {...detail.context.study_aid_status, passage_translation: detail.context.passage_translation || detail.context.content_translation ? "ready" : "pending"};
  for (const item of detail.items) {
    const old = previous?.items?.find(candidate => String(candidate.item_id) === String(item.item_id));
    const questionMatches = old && sameStudySource(item.question, old.question);
    const choicesMatch = old && item.choices?.length === old.choices?.length && item.choices?.every((choice, index) => sameStudySource(choice, old.choices[index]));
    const allMatch = contextMatches && questionMatches && choicesMatch && item.answer === old?.answer;
    const restored = [];
    if (item.question && !usableTranslation(item.question_translation, item.question)) {
      if (item.question_translation) counts.removed_unreliable_fields++;
      delete item.question_translation;
      if (questionMatches && usableTranslation(old.question_translation, old.question)) {
        item.question_translation = old.question_translation;
        restored.push("question_translation");
        counts.question_translations++;
      }
    }
    const translations = (item.choices || []).map((choice, index) => {
      const current = item.choice_translations?.[index];
      if (usableTranslation(current, choice)) return current;
      if (current) counts.removed_unreliable_fields++;
      const previousTranslation = old?.choice_translations?.[index];
      if (sameStudySource(choice, old?.choices?.[index]) && usableTranslation(previousTranslation, old?.choices?.[index])) {
        // Keep the same index. Never shift translations after OCR deletes a choice.
        const label = previousTranslation.match(/^([A-D])[：:.]/)?.[1];
        if (label && label !== "ABCD"[index]) return "";
        counts.choice_translations++;
        restored.push(`choice_translations.${index}`);
        return previousTranslation;
      }
      return "";
    });
    const translated = translations.filter(Boolean).length;
    if (translated) item.choice_translations = translations;
    else delete item.choice_translations;
    if (!usableAnalysis(item.answer_explain, item.answer)) {
      if (item.answer_explain) counts.removed_unreliable_fields++;
      for (const field of ["answer_explain", "evidence", "explanation_structured"]) delete item[field];
      if (allMatch && usableAnalysis(old?.answer_explain, item.answer)) {
        item.answer_explain = old.answer_explain;
        // Evidence paragraph numbers may depend on formatting; do not copy them.
        restored.push("answer_explain");
        counts.analyses++;
      }
    }
    if (item.evidence) {
      const evidence = supportedEvidence(item.evidence.replace(/^原文片段：/, ""), item.answer_explain, detail.context.passage);
      if (evidence) item.evidence = evidence;
      else { delete item.evidence; counts.removed_unverified_evidence++; }
    }
    item.study_aid_status = {
      analysis: usableAnalysis(item.answer_explain, item.answer) ? "ready" : "pending",
      question_translation: !item.question ? "not_applicable" : usableTranslation(item.question_translation, item.question) ? "ready" : "pending",
      choice_translations: translated === (item.choices || []).length ? "ready" : translated ? "partial" : "pending"
    };
    if (restored.length) item.study_aid_provenance = {method: "exact_source_field_match", reference, restored_fields: restored};
  }
  return counts;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const write = process.argv.includes("--write");
  const baselineIndex = process.argv.indexOf("--baseline-ref");
  const baselineRef = baselineIndex >= 0 ? process.argv[baselineIndex + 1] : undefined;
  if (baselineRef && write) throw new Error("Historical baseline checks are read-only; omit --write.");
  const reference = "aac088a0";
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "public/data/catalog.json"), "utf8"));
  const report = {reference, ...(baselineRef ? {baseline_ref: baselineRef} : {}), write, units: 0, changed_units: 0, restored: {}, status: {}, rows: []};
  for (const bank of catalog.banks) {
    const index = JSON.parse(fs.readFileSync(path.join(root, "public/data", bank.index_path), "utf8"));
    for (const unit of index.units.filter(unit => unit.part >= 6)) {
      const relative = `public/data/${unit.detail_path}`;
      const file = path.join(root, relative);
      const detail = JSON.parse(baselineRef ? execFileSync("git", ["show", `${baselineRef}:${relative}`], {cwd: root, encoding: "utf8", maxBuffer: 10e6}) : fs.readFileSync(file, "utf8"));
      const before = JSON.stringify(detail);
      let previous;
      try { previous = JSON.parse(execFileSync("git", ["show", `${reference}:${relative}`], {cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], maxBuffer: 10e6})); }
      catch { throw new Error(`Missing historical source ${reference}:${relative}`); }
      const restored = restoreReadingAids(detail, previous, reference);
      for (const [key, value] of Object.entries(restored)) report.restored[key] = (report.restored[key] || 0) + value;
      for (const item of detail.items) for (const [field, status] of Object.entries(item.study_aid_status)) {
        const key = `part${detail.part}.${field}.${status}`;
        report.status[key] = (report.status[key] || 0) + 1;
      }
      const contextKey = `part${detail.part}.passage_translation.${detail.context.study_aid_status.passage_translation}`;
      report.status[contextKey] = (report.status[contextKey] || 0) + 1;
      report.units++;
      if (JSON.stringify(detail) !== before) {
        report.changed_units++;
        if (write) fs.writeFileSync(file, JSON.stringify(detail, null, 2) + "\n");
      }
      report.rows.push({bank_id: bank.bank_id, unit_id: unit.unit_id, ...restored});
    }
  }
  fs.mkdirSync(path.join(root, "outputs"), {recursive: true});
  fs.writeFileSync(path.join(root, `outputs/reading-study-aid-recovery-${baselineRef ? "baseline" : write ? "report" : "check"}.json`), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({...report, rows: undefined}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
