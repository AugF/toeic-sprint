import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {applyListeningCompletenessReview} from "../scripts/apply-listening-completeness-review.mjs";
import {isCurrentTranslation} from "../scripts/translate-listening-transcripts-ollama.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const complete = "Welcome to our new downtown office. The customer service team has moved to the second floor. Please take the elevator beside the main entrance, and check in with the receptionist before your appointment. You can leave your bags in the waiting area.";
const chinese = "欢迎来到我们新设的市中心办公室。客户服务团队已搬到二楼。请乘坐正门旁的电梯，并在预约开始前向接待员报到。您可以把行李留在等候区。";

async function fixture(t, {units = ["p3-32-34"]} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "toeic-completeness-test-"));
  t.after(() => rm(root, {recursive: true, force: true}));
  const bank = "official-1-test-1", files = [], originals = [], reviews = [];
  for (const unit of units) {
    const part = Number(unit[1]);
    const relativeAudio = `audio/part${part}/${unit}.mp3`;
    const audioFile = path.join(root, "public/assets", bank, relativeAudio);
    const audio = Buffer.from(`test audio fixture bytes for ${unit}`);
    const file = path.join(root, "public/data/banks", bank, "units", `${unit}.json`);
    const previous = part === 2 ? "Where is the office?\nA. On the second floor.\nB. At noon.\nC. With Jane." : "The customer service team has moved to the second floor.";
    const detail = {
      bank_id: bank, unit_id: unit, part,
      priority: {level: "P1", score: 80},
      context: {
        audio_path: {path: relativeAudio, exists: true},
        transcript: previous,
        transcript_translation: "原有译文保留到全部复核通过。",
        transcript_source: {schema_version: "listening_transcript_v2", method: "mlx-whisper:full", audio_sha256: sha(audio), model_sha256: "retained-model-metadata", metrics: {word_count: 10, audio_duration_ms: 9999, words_per_second: 1, legacy_coverage: 0.2}},
        transcript_translation_source: {schema_version: "listening_translation_v2", method: "ollama/model", transcript_sha256: sha(previous)},
        other_context: {unchanged: "preserve this field"},
      },
      items: [{item_id: 32, question: "Where is the office?", choices: ["Upstairs", "Outside"], answer: "A", evidence: "Original evidence is not automatically rewritten."}],
    };
    await mkdir(path.dirname(file), {recursive: true});
    await mkdir(path.dirname(audioFile), {recursive: true});
    await writeFile(audioFile, audio);
    const content = `${JSON.stringify(detail, null, 2)}\n`;
    await writeFile(file, content);
    files.push(file); originals.push(content);
    reviews.push({
      bank_id: bank, unit_id: unit,
      previous_transcript_sha256: sha(previous), audio_sha256: sha(audio),
      transcript: part === 2 ? "Where is our new office?\nA. On the second floor.\nB. At noon.\nC. With Jane." : complete,
      translation: part === 2 ? "我们的新办公室在哪里？\nA. 在二楼。\nB. 在中午。\nC. 和简一起。" : chinese,
      evidence: {method: "manual_audio_window_review", private_path: "/private/asr-evidence", windows: [{start_ms: 0, end_ms: 12500, raw: "PRIVATE_RAW_ASR_EVIDENCE_NEVER_PUBLISH"}, {start_ms: 10000, end_ms: 30000, raw: "Overlapping evidence is permitted."}]},
    });
  }
  return {root, files, originals, manifest: {schema_version: "listening_completeness_review_v1", reviews}};
}

test("dry run validates real fixture audio without changing any JSON", async t => {
  const f = await fixture(t);
  const result = await applyListeningCompletenessReview(f.manifest, {root: f.root});
  assert.equal(result.planned.length, 1);
  assert.deepEqual(result.written, []);
  assert.equal(await readFile(f.files[0], "utf8"), f.originals[0]);
});

test("approved transcript and translation preserve items and publish hashes/ranges but not raw evidence", async t => {
  const f = await fixture(t);
  const result = await applyListeningCompletenessReview(f.manifest, {root: f.root, write: true});
  assert.equal(result.written.length, 1);
  const published = await readFile(f.files[0], "utf8"), detail = JSON.parse(published), original = JSON.parse(f.originals[0]);
  assert.equal(detail.context.transcript, complete);
  assert.equal(detail.context.transcript_translation, chinese);
  assert.deepEqual(detail.items, original.items);
  assert.deepEqual(detail.priority, original.priority);
  assert.deepEqual(detail.context.other_context, original.context.other_context);
  assert.equal(detail.context.transcript_source.model_sha256, "retained-model-metadata");
  assert.equal(detail.context.transcript_source.method, "manual_audio_window_review+completeness_review");
  assert.equal(detail.context.transcript_translation_source.method, "reviewed_translation_from_audio_transcript");
  assert.equal(detail.context.transcript_completeness_review.previous_method, "mlx-whisper:full");
  assert.equal(detail.context.transcript_completeness_review.previous_translation_method, "ollama/model");
  assert.deepEqual(detail.context.transcript_completeness_review.previous_metrics, original.context.transcript_source.metrics);
  assert.equal(detail.context.transcript_source.metrics.word_count, 42);
  assert.equal(detail.context.transcript_source.metrics.review_window_end_ms, 30000);
  assert.equal(detail.context.transcript_source.metrics.audio_duration_ms, undefined, "window end is not an actual audio duration");
  assert.equal(detail.context.transcript_source.metrics.words_per_second, undefined, "do not estimate speech rate without an audio duration");
  assert.equal(detail.context.transcript_source.metrics.legacy_coverage, undefined);
  assert.equal(detail.context.transcript_source.transcript_sha256, sha(complete));
  assert.equal(detail.context.transcript_translation_source.transcript_sha256, sha(complete));
  assert.equal(detail.context.transcript_translation_source.translation_sha256, sha(chinese));
  assert.equal(detail.context.transcript_completeness_review.previous_transcript_sha256, f.manifest.reviews[0].previous_transcript_sha256);
  assert.equal(detail.context.transcript_completeness_review.audio_sha256, f.manifest.reviews[0].audio_sha256);
  assert.deepEqual(detail.context.transcript_completeness_review.windows, [{start_ms: 0, end_ms: 12500}, {start_ms: 10000, end_ms: 30000}]);
  assert.doesNotMatch(published, /PRIVATE_RAW|private_path|asr-evidence|Overlapping evidence/);
  assert.equal(isCurrentTranslation(detail), true);
  assert.deepEqual(await readdir(path.dirname(f.files[0])), [path.basename(f.files[0])]);
});

test("speech-rate metrics use supplied actual duration rather than the end of the review windows", async t => {
  const f = await fixture(t);
  f.manifest.reviews[0].evidence.audio_duration_ms = 45000;
  await applyListeningCompletenessReview(f.manifest, {root: f.root, write: true});
  const detail = JSON.parse(await readFile(f.files[0], "utf8"));
  assert.deepEqual(detail.context.transcript_source.metrics, {word_count: 42, review_window_end_ms: 30000, audio_duration_ms: 45000, words_per_second: 0.933});
});

test("reapplying the same completed text is byte-for-byte idempotent despite the old previous hash", async t => {
  const f = await fixture(t);
  await applyListeningCompletenessReview(f.manifest, {root: f.root, write: true});
  const completed = await readFile(f.files[0], "utf8");
  const result = await applyListeningCompletenessReview(f.manifest, {root: f.root, write: true});
  assert.deepEqual(result.planned, []);
  assert.equal(result.unchanged.length, 1);
  assert.equal(await readFile(f.files[0], "utf8"), completed);
});

test("a mismatch anywhere in the batch prevents every write", async t => {
  const f = await fixture(t, {units: ["p3-32-34", "p4-71-73"]});
  f.manifest.reviews[1].previous_transcript_sha256 = "0".repeat(64);
  await assert.rejects(applyListeningCompletenessReview(f.manifest, {root: f.root, write: true}), /previous transcript SHA-256/);
  for (let i = 0; i < f.files.length; i++) assert.equal(await readFile(f.files[i], "utf8"), f.originals[i]);
  assert.equal((await readdir(path.dirname(f.files[0]))).length, 2);
});

test("actual audio bytes, detail identity, listening part, and English/Chinese validation are mandatory", async t => {
  const f = await fixture(t);
  for (const [update, error] of [
    [review => {review.audio_sha256 = "0".repeat(64);}, /audio SHA-256/],
    [review => {review.transcript = "This has © unsafe residue.";}, /unsafe listening transcript/],
    [review => {review.transcript = "Too short.";}, /too short/],
    [review => {review.translation = "Only English text is not a Chinese translation.";}, /too little Chinese/],
    [review => {review.unit_id = "p6-131-134";}, /listening Part 1–4/],
  ]) {
    const manifest = structuredClone(f.manifest); update(manifest.reviews[0]);
    await assert.rejects(applyListeningCompletenessReview(manifest, {root: f.root, write: true}), error);
    assert.equal(await readFile(f.files[0], "utf8"), f.originals[0]);
  }
  const changedDetail = JSON.parse(f.originals[0]); changedDetail.bank_id = "official-2-test-1";
  await writeFile(f.files[0], JSON.stringify(changedDetail));
  await assert.rejects(applyListeningCompletenessReview(f.manifest, {root: f.root, write: true}), /detail identity/);
  changedDetail.bank_id = "official-1-test-1"; changedDetail.part = 7;
  await writeFile(f.files[0], JSON.stringify(changedDetail));
  await assert.rejects(applyListeningCompletenessReview(f.manifest, {root: f.root, write: true}), /expected listening Part/);
});

test("Part 2 translation must retain all source option labels", async t => {
  const f = await fixture(t, {units: ["p2-7"]});
  const invalid = structuredClone(f.manifest);
  invalid.reviews[0].translation = "我们的新办公室在哪里？\nB. 在二楼。\nB. 在中午。\nC. 和简一起。";
  await assert.rejects(applyListeningCompletenessReview(invalid, {root: f.root, write: true}), /lost option label A/);
  assert.equal(await readFile(f.files[0], "utf8"), f.originals[0]);
  const result = await applyListeningCompletenessReview(f.manifest, {root: f.root, write: true});
  assert.equal(result.written.length, 1);
});

test("invalid target paths, duplicate targets, and malformed evidence fail preflight", async t => {
  const f = await fixture(t);
  for (const [update, error] of [
    [review => {review.bank_id = "../outside";}, /invalid bank_id/],
    [review => {review.bank_id = "/tmp/outside";}, /invalid bank_id/],
    [review => {review.unit_id = "p3-32-34/../../file";}, /unit_id/],
    [review => {review.evidence.windows[0].start_ms = -1;}, /window time range/],
    [review => {review.evidence.windows[0].end_ms = 0;}, /window time range/],
    [review => {review.evidence.windows[0].raw = "";}, /window raw/],
    [review => {review.evidence.audio_duration_ms = 0;}, /audio_duration_ms/],
    [review => {review.evidence.audio_duration_ms = "30000";}, /audio_duration_ms/],
  ]) {
    const manifest = structuredClone(f.manifest); update(manifest.reviews[0]);
    await assert.rejects(applyListeningCompletenessReview(manifest, {root: f.root, write: true}), error);
  }
  const duplicate = structuredClone(f.manifest); duplicate.reviews.push(structuredClone(duplicate.reviews[0]));
  await assert.rejects(applyListeningCompletenessReview(duplicate, {root: f.root, write: true}), /duplicate review/);
  assert.equal(await readFile(f.files[0], "utf8"), f.originals[0]);
});

test("data and audio symlinks cannot escape the current bank scope", async t => {
  const f = await fixture(t);
  const detail = JSON.parse(f.originals[0]);
  detail.context.audio_path.path = "../../outside.mp3";
  await writeFile(f.files[0], JSON.stringify(detail));
  await assert.rejects(applyListeningCompletenessReview(f.manifest, {root: f.root, write: true}), /audio reference path/);
  await writeFile(f.files[0], f.originals[0]);
  const outside = path.join(f.root, "outside.json");
  await writeFile(outside, f.originals[0]);
  await rm(f.files[0]);
  await symlink(outside, f.files[0]);
  await assert.rejects(applyListeningCompletenessReview(f.manifest, {root: f.root, write: true}), /symlink path escapes/);
  assert.equal(await readFile(outside, "utf8"), f.originals[0]);
});
