// Helpers shared by reading OCR recovery and the conservative aid migration.
// Matching intentionally preserves words, numbers, punctuation and option order.
export function normalizeStudySource(value) {
  return String(value || "").normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

export function sameStudySource(left, right) {
  return normalizeStudySource(left) === normalizeStudySource(right);
}

const PLACEHOLDER = /中文辅助|离线预处理|原文\s*OCR\s*不清|原始文本未提供|本段听力围绕|本文围绕|待(?:补充|翻译|核对)|暂无(?:翻译|解析)/i;
const UNSAFE = /[\u0400-\u04ff\ufffd\u200b]|[|~^`]|[A-Za-z][A-Za-z'-]*[（(][\p{Script=Han}][^）)]*[）)]/u;
const GENERIC_ANALYSIS = /该项既满足空格处的语法结构，也保持前后语义|该项复现或同义改写了定位信息|该项是原文事实能够充分支持的结论|该句承接前文并为后文提供必要信息|该选项是原文事实或同义改写|该选项符合句内语法，并能保持前后/;

export function usableTranslation(value, source = "") {
  if (typeof value !== "string" || !value.trim() || PLACEHOLDER.test(value) || UNSAFE.test(value)) return false;
  const text = value.replace(/^[A-D][：:.]\s*/, "").trim();
  if (!/\p{Script=Han}/u.test(text)) {
    // Prices, reference numbers and initialisms can legitimately be unchanged.
    return /^[A-Z\d\s$£€.,:%/-]+$/.test(text) && sameStudySource(text, source);
  }
  if (/[A-Za-z]{12,}/.test(text)) return false;
  return true;
}

export function usableAnalysis(value, answer) {
  if (typeof value !== "string" || value.trim().length < 12 || !/\p{Script=Han}/u.test(value)) return false;
  if (PLACEHOLDER.test(value) || UNSAFE.test(value) || GENERIC_ANALYSIS.test(value)) return false;
  const claimed = [...value.matchAll(/(?:正确答案|答案)\s*[：:]\s*([A-D])/g)].map(match => match[1]);
  return claimed.every(label => label === answer);
}

export function supportedEvidence(evidence, analysis, passage) {
  if (typeof evidence !== "string") return "";
  const excerpt = evidence.replace(/^参考原文第\s*\d+\s*段(?:第\s*\d+\s*句)?[：:]\s*/, "");
  if (!excerpt || !normalizeStudySource(passage).includes(normalizeStudySource(excerpt))) return "";
  const phrases = String(analysis || "").match(/[A-Za-z][A-Za-z0-9 ,'.-]{15,}/g) || [];
  const relates = phrases.some(phrase => phrase.trim().split(/\s+/).length >= 3 && normalizeStudySource(excerpt).includes(normalizeStudySource(phrase)));
  // Discard old paragraph/sentence numbers: OCR reflow can change their meaning.
  return relates ? `原文片段：${excerpt}` : "";
}

export function invalidateChangedReadingAids(detail, previous) {
  const passageChanged = !sameStudySource(detail.context.passage, previous.context.passage);
  if (passageChanged) {
    delete detail.context.passage_translation;
    delete detail.context.content_translation;
    detail.context.study_aid_status = {...detail.context.study_aid_status, passage_translation: "pending"};
    delete detail.knowledge_accumulation;
  }
  for (const item of detail.items) {
    const before = previous.items.find(candidate => String(candidate.item_id) === String(item.item_id));
    if (!before) continue;
    const questionChanged = !sameStudySource(item.question, before.question);
    const choicesChanged = item.choices?.length !== before.choices?.length || item.choices?.some((choice, index) => !sameStudySource(choice, before.choices?.[index]));
    const answerChanged = item.answer !== before.answer;
    if (questionChanged) {
      delete item.question_translation;
      item.study_aid_status = {...item.study_aid_status, question_translation: item.question ? "pending" : "not_applicable"};
    }
    if (choicesChanged && item.choice_translations) {
      item.choice_translations = (item.choices || []).map((choice, index) => sameStudySource(choice, before.choices?.[index]) ? item.choice_translations[index] || "" : "");
      const count = item.choice_translations.filter(Boolean).length;
      item.study_aid_status = {...item.study_aid_status, choice_translations: count === item.choices.length ? "ready" : count ? "partial" : "pending"};
      if (!count) delete item.choice_translations;
    }
    if (passageChanged || questionChanged || choicesChanged || answerChanged) {
      for (const field of ["answer_explain", "evidence", "strategy", "explanation_structured", "knowledge_accumulation"]) delete item[field];
      item.study_aid_status = {...item.study_aid_status, analysis: "pending"};
      delete item.study_aid_provenance;
    }
  }
  return detail;
}
