export type Saved = {answers: Record<string, string>; wrong: string[]; stars: string[]; revealed: string[]};
export type ReviewItem = {item_key: string; answer?: string; choices?: string[]; answer_review_status?: string};

export function answerLabel(item: ReviewItem) {
  if (item.answer_review_status === "pending") return "";
  const label = String(item.answer || "").trim().toUpperCase();
  return /^[A-D]$/.test(label) && (!item.choices || label.charCodeAt(0) - 65 < item.choices.length) ? label : "";
}

/** Reveal and grade the same loaded questions in one state update. */
export function revealAnswers(previous: Saved, items: ReviewItem[], visible: boolean): Saved {
  const keys = new Set(items.map(item => item.item_key));
  const wrong = new Set(previous.wrong);
  if (visible) {
    for (const item of items) {
      const selected = previous.answers[item.item_key];
      const answer = answerLabel(item);
      if (!answer) {
        if (item.answer_review_status === "pending") wrong.delete(item.item_key);
        continue;
      }
      if (!selected) continue;
      if (selected.toUpperCase() === answer) wrong.delete(item.item_key);
      else wrong.add(item.item_key);
    }
  }
  return {
    ...previous,
    wrong: [...wrong],
    revealed: visible ? [...new Set([...previous.revealed, ...keys])] : previous.revealed.filter(key => !keys.has(key)),
  };
}

/** This parses only emphasis; text, including HTML, remains ordinary React text. */
export function emphasisSegments(value: string): Array<{text: string; strong: boolean}> {
  const parts: Array<{text: string; strong: boolean}> = [];
  const pattern = /\*\*([^*\n]+)\*\*/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) parts.push({text: value.slice(cursor, match.index), strong: false});
    parts.push({text: match[1], strong: true});
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push({text: value.slice(cursor), strong: false});
  return parts;
}
