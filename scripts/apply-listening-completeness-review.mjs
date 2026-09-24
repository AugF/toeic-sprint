#!/usr/bin/env node

import {createHash, randomUUID} from "node:crypto";
import {readFile, realpath, rename, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validatePublishedTranscript} from "./rebuild-listening-transcripts.mjs";
import {validateTranslation} from "./translate-listening-transcripts-ollama.mjs";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const SCHEMA = "listening_completeness_review_v1";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const HASH = /^[a-f0-9]{64}$/;

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function existingWithin(scope, relative) {
  const candidate = path.resolve(scope, relative);
  if (!contained(scope, candidate)) throw new Error("path escapes its allowed scope");
  const actual = await realpath(candidate);
  if (!contained(scope, actual)) throw new Error("symlink path escapes its allowed scope");
  return actual;
}

function validateReview(review) {
  if (!review || typeof review !== "object") throw new Error("review must be an object");
  if (typeof review.bank_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(review.bank_id)) throw new Error("invalid bank_id");
  if (typeof review.unit_id !== "string" || !/^p[1-4]-\d+(?:-\d+)?$/.test(review.unit_id)) throw new Error("unit_id must identify a listening Part 1–4 unit");
  if (!HASH.test(review.previous_transcript_sha256 || "")) throw new Error("invalid previous_transcript_sha256");
  if (!HASH.test(review.audio_sha256 || "")) throw new Error("invalid audio_sha256");
  requireText(review.transcript, "transcript");
  requireText(review.translation, "translation");
  requireText(review.evidence?.method, "evidence.method");
  if (!Array.isArray(review.evidence.windows) || !review.evidence.windows.length) throw new Error("evidence.windows must not be empty");
  for (const window of review.evidence.windows) {
    if (!Number.isSafeInteger(window?.start_ms) || !Number.isSafeInteger(window?.end_ms) || window.start_ms < 0 || window.end_ms <= window.start_ms) throw new Error("invalid evidence window time range");
    requireText(window.raw, "evidence window raw");
  }
  if (review.evidence.audio_duration_ms !== undefined && (!Number.isFinite(review.evidence.audio_duration_ms) || review.evidence.audio_duration_ms <= 0)) throw new Error("invalid evidence.audio_duration_ms");
}

function appendReviewMethod(previous) {
  const methods = typeof previous === "string" ? previous.split("+").map(value => value.trim()).filter(Boolean) : [];
  return [...new Set([...methods, "completeness_review"])].join("+");
}

async function prepareReview(review, root) {
  const bankScope = path.join(root, "public/data/banks", review.bank_id);
  const file = await existingWithin(bankScope, `units/${review.unit_id}.json`);
  const originalContent = await readFile(file, "utf8");
  const detail = JSON.parse(originalContent);
  if (detail.bank_id !== review.bank_id || detail.unit_id !== review.unit_id) throw new Error("detail identity does not match bank_id/unit_id");
  const part = Number(review.unit_id.match(/^p([1-4])-/)[1]);
  if (detail.part !== part) throw new Error("detail is not the expected listening Part");
  if (!detail.context || typeof detail.context !== "object") throw new Error("detail has no listening context");
  const audioRef = detail.context.audio_path || detail.context.question_audio_path;
  const audioRelative = typeof audioRef === "string" ? audioRef : audioRef?.path;
  if (typeof audioRelative !== "string" || !audioRelative || /[\\\u0000]/.test(audioRelative) || path.isAbsolute(audioRelative) || audioRelative.split("/").some(segment => segment === ".." || segment === "." || !segment)) throw new Error("invalid audio reference path");
  const audioFile = await existingWithin(path.join(root, "public/assets", review.bank_id), audioRelative);
  const actualAudioHash = sha256(await readFile(audioFile));
  if (actualAudioHash !== review.audio_sha256) throw new Error("audio SHA-256 does not match manifest");
  const previousTranscript = requireText(detail.context.transcript, "current transcript");
  const currentHash = sha256(previousTranscript);
  const newHash = sha256(review.transcript);
  if (currentHash !== review.previous_transcript_sha256 && previousTranscript !== review.transcript) throw new Error("previous transcript SHA-256 does not match current content");

  const next = structuredClone(detail);
  const translation = validateTranslation(review.transcript, review.translation.split("\n"), part).join("\n");
  const wordCount = (review.transcript.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
  const metrics = {
    word_count: wordCount,
    review_window_end_ms: Math.max(...review.evidence.windows.map(window => window.end_ms)),
    ...(review.evidence.audio_duration_ms === undefined ? {} : {
      audio_duration_ms: review.evidence.audio_duration_ms,
      words_per_second: Number((wordCount / (review.evidence.audio_duration_ms / 1000)).toFixed(3)),
    }),
  };
  next.context.transcript = review.transcript;
  next.context.transcript_translation = translation;
  next.context.transcript_source = {
    ...detail.context.transcript_source,
    schema_version: "listening_transcript_v2",
    method: appendReviewMethod(review.evidence.method),
    audio_sha256: actualAudioHash,
    transcript_sha256: newHash,
    metrics,
  };
  next.context.transcript_translation_source = {
    ...detail.context.transcript_translation_source,
    schema_version: "listening_translation_v2",
    method: "reviewed_translation_from_audio_transcript",
    transcript_sha256: newHash,
    translation_sha256: sha256(translation),
  };
  next.context.transcript_completeness_review = {
    schema_version: SCHEMA,
    method: review.evidence.method,
    previous_transcript_sha256: review.previous_transcript_sha256,
    ...(detail.context.transcript_source?.method ? {previous_method: detail.context.transcript_source.method} : {}),
    ...(detail.context.transcript_source?.metrics ? {previous_metrics: structuredClone(detail.context.transcript_source.metrics)} : {}),
    ...(detail.context.transcript_translation_source?.method ? {previous_translation_method: detail.context.transcript_translation_source.method} : {}),
    transcript_sha256: newHash,
    audio_sha256: actualAudioHash,
    windows: review.evidence.windows.map(({start_ms, end_ms}) => ({start_ms, end_ms})),
    ...(Array.isArray(review.evidence.notes) && review.evidence.notes.length ? {notes: review.evidence.notes.filter(note => typeof note === "string")} : {}),
  };
  validatePublishedTranscript(next);
  return {
    key: `${review.bank_id}/${review.unit_id}`,
    file,
    audioFile,
    originalContent,
    audioHash: actualAudioHash,
    // Already-applied text is deliberately untouched, including metadata.
    unchanged: previousTranscript === review.transcript,
    next,
  };
}

/** Validate every review before any write or temporary-file creation. */
export async function preflightCompletenessReview(manifest, {root = defaultRoot} = {}) {
  if (manifest?.schema_version !== SCHEMA) throw new Error(`manifest schema_version must be ${SCHEMA}`);
  if (!Array.isArray(manifest.reviews) || !manifest.reviews.length) throw new Error("manifest.reviews must not be empty");
  const actualRoot = await realpath(root);
  const failures = [], prepared = [], seen = new Set();
  for (const [index, review] of manifest.reviews.entries()) {
    try {
      validateReview(review);
      const key = `${review.bank_id}/${review.unit_id}`;
      if (seen.has(key)) throw new Error(`duplicate review for ${key}`);
      seen.add(key);
      prepared.push(await prepareReview(review, actualRoot));
    } catch (error) {
      failures.push(`review ${index + 1}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Completeness review preflight failed; no files written:\n${failures.join("\n")}`);
  return prepared;
}

export async function applyListeningCompletenessReview(manifest, {root = defaultRoot, write = false} = {}) {
  const prepared = await preflightCompletenessReview(manifest, {root});
  const changed = prepared.filter(review => !review.unchanged);
  const result = {reviews: prepared.length, planned: changed.map(review => review.key), unchanged: prepared.filter(review => review.unchanged).map(review => review.key), written: [], write};
  if (!write || !changed.length) return result;

  // Check the complete batch once more after preflight, before staging files.
  for (const review of prepared) {
    if (await readFile(review.file, "utf8") !== review.originalContent) throw new Error(`Target changed after preflight; no files written: ${review.key}`);
    if (sha256(await readFile(review.audioFile)) !== review.audioHash) throw new Error(`Audio changed after preflight; no files written: ${review.key}`);
  }
  const staged = [];
  try {
    for (const review of changed) {
      const temporary = `${review.file}.review-${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(review.next, null, 2)}\n`, {flag: "wx"});
      staged.push({review, temporary});
    }
    for (const {review, temporary} of staged) {
      await rename(temporary, review.file);
      result.written.push(review.key);
    }
  } finally {
    // These are exact, newly created temporary filenames, never public data.
    await Promise.all(staged.map(({temporary}) => rm(temporary, {force: true})));
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  let manifestPath, write = false;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--write") write = true;
    else if (argv[index] === "--manifest") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error("--manifest requires a JSON file path");
      manifestPath = argv[++index];
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!manifestPath) throw new Error("Usage: node scripts/apply-listening-completeness-review.mjs --manifest PATH [--write]");
  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
  const result = await applyListeningCompletenessReview(manifest, {write});
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {await main();} catch (error) {console.error(error.message); process.exitCode = 1;}
}
