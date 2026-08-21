"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import type {CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject} from "react";

type Level = "P1" | "P2" | "P3";
type Priority = {
  level: Level;
  score: number;
  label?: string;
  reason?: string;
  focus_tags?: string[];
};
type MediaRef = {path: string; asset_key?: string; exists?: boolean; width?: number; height?: number; source_width?: number; source_height?: number; crop?: {x: number; y: number; width: number; height: number}; ocr_crop?: {x: number; y: number; width: number; height: number}};
type KnowledgeEntry = {term?: string; phrase?: string; meaning?: string};
type Knowledge = {schema_version?: string; vocabulary?: KnowledgeEntry[]; collocations?: KnowledgeEntry[]};
type Item = {
  item_id: string | number;
  item_key: string;
  question?: string;
  question_translation?: string;
  choices?: string[];
  answer?: string;
  answer_explain?: string;
  question_type?: string;
  evidence?: string;
  strategy?: string;
  response_style?: string;
  choice_translations?: string[];
  grammar_point?: string;
  knowledge_accumulation?: Knowledge;
  priority: Priority;
};
type Context = {
  audio_path?: MediaRef;
  question_audio_path?: MediaRef;
  picture_path?: MediaRef;
  picture_paths?: MediaRef[];
  transcript?: string;
  transcript_translation?: string;
  passage?: string;
  passage_translation?: string;
  content_translation?: string;
  reading_layout_images?: MediaRef[];
};
type UnitDetail = {
  bank_id: string;
  unit_id: string;
  part: number;
  title?: string;
  topic?: string;
  priority: Priority;
  context: Context;
  items: Item[];
  knowledge_accumulation?: Knowledge;
};
type ItemSummary = Partial<Item> & {id?: string | number};
type UnitSummary = {
  unit_id: string;
  part: number;
  title?: string;
  item_ids: Array<string | number>;
  item_refs?: ItemSummary[];
  item_summaries?: ItemSummary[];
  drills?: ItemSummary[];
  items?: ItemSummary[];
  item_priorities?: Record<string, Priority>;
  question_count?: number;
  material_type?: string;
  topic_category?: string;
  priority: Priority;
  detail_path: string;
};
type BankIndex = {
  bank_id: string;
  name: string;
  question_count: number;
  units: UnitSummary[];
};
type CatalogBank = {
  bank_id: string;
  volume: number;
  test: number;
  title: string;
  question_count: number;
  index_path: string;
};
type Catalog = {
  content_version: string;
  totals: {banks: number; questions: number; priority_distribution?: Record<Level, number>};
  banks: CatalogBank[];
};
type DrillRef = {
  bank_id: string;
  bank_title: string;
  volume: number;
  test: number;
  unit_id: string;
  detail_path: string;
  unit_title?: string;
  part: number;
  item_id: string | number;
  item_key: string;
  item_ids: Array<string | number>;
  item_keys: string[];
  question_count: number;
  scope: "item" | "material";
  question_type?: string;
  priority: Priority;
};
type Saved = {answers: Record<string, string>; wrong: string[]; stars: string[]; revealed: string[]};
type PriorityFilter = "ALL" | Level;
type StatusFilter = "ALL" | "UNDONE" | "DONE" | "WRONG" | "STARRED";
type SortMode = "RANDOM" | "PRIORITY" | "OFFICIAL";

const CHOICE_LABELS = ["A", "B", "C", "D"];
const PRIORITIES: PriorityFilter[] = ["P1", "P2", "P3", "ALL"];
const STATUS_OPTIONS: Array<{value: StatusFilter; label: string}> = [
  {value: "ALL", label: "全部"},
  {value: "UNDONE", label: "未做"},
  {value: "DONE", label: "已做"},
  {value: "WRONG", label: "错题"},
  {value: "STARRED", label: "收藏"},
];
const EMPTY_SAVED: Saved = {answers: {}, wrong: [], stars: [], revealed: []};
const STORAGE_KEY = "toeic-global-progress-v3";
const LEVEL_RANK: Record<Level, number> = {P1: 1, P2: 2, P3: 3};
const MATERIAL_PARTS = new Set([3, 4, 6, 7]);
const MULTI_CARD_PARTS = new Set([1, 2, 5]);
const MULTI_CARD_PAGE_SIZE = 6;
let activeAudioElement: HTMLAudioElement | null = null;
const PART_META: Record<number, {section: "听力" | "阅读"; focus: string}> = {
  1: {section: "听力", focus: "照片描述"},
  2: {section: "听力", focus: "问答应答"},
  3: {section: "听力", focus: "对话理解"},
  4: {section: "听力", focus: "独白理解"},
  5: {section: "阅读", focus: "句子填空"},
  6: {section: "阅读", focus: "短文填空"},
  7: {section: "阅读", focus: "阅读理解"},
};

function dataUrl(path: string) {
  const base = typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "/";
  return `${base}data/${path.replace(/^\/?data\//, "").replace(/^\//, "")}`;
}

function assetUrl(bankId: string, ref?: MediaRef) {
  if (!ref?.path || ref.exists === false) return "";
  const base = typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "/";
  return `${base}assets/${bankId}/${ref.path.replace(/^\//, "")}`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function normalizeSaved(value: unknown): Saved {
  if (!value || typeof value !== "object") return EMPTY_SAVED;
  const source = value as Partial<Saved>;
  return {
    answers: source.answers && typeof source.answers === "object" ? source.answers : {},
    wrong: Array.isArray(source.wrong) ? source.wrong.map(String) : [],
    stars: Array.isArray(source.stars) ? source.stars.map(String) : [],
    revealed: Array.isArray(source.revealed) ? source.revealed.map(String) : [],
  };
}

function unitItemSummaries(unit: UnitSummary): ItemSummary[] {
  const rich = unit.item_refs || unit.item_summaries || unit.drills || unit.items;
  if (Array.isArray(rich) && rich.length) return rich;
  return unit.item_ids.map(item_id => ({item_id}));
}

function buildDrillRefs(catalog: Catalog | null, indexes: BankIndex[]): DrillRef[] {
  if (!catalog) return [];
  const bankMeta = new Map(catalog.banks.map(bank => [bank.bank_id, bank]));
  return indexes.flatMap<DrillRef>(index => {
    const bank = bankMeta.get(index.bank_id);
    if (!bank) return [];
    return index.units.flatMap<DrillRef>(unit => {
      const summaries = unitItemSummaries(unit);
      const refs = summaries.map((summary, position) => {
        const itemId = summary.item_id ?? summary.id ?? unit.item_ids[position];
        const priority = summary.priority || unit.item_priorities?.[String(itemId)] || unit.priority;
        return {
          itemId,
          itemKey: summary.item_key || `${index.bank_id}/${unit.unit_id}/${itemId}`,
          questionType: summary.question_type,
          priority,
        };
      });
      const common = {
        bank_id: index.bank_id,
        bank_title: index.name || bank.title,
        volume: bank.volume,
        test: bank.test,
        unit_id: unit.unit_id,
        detail_path: unit.detail_path,
        unit_title: unit.title,
        part: unit.part,
      };
      if (MATERIAL_PARTS.has(unit.part)) {
        const anchor = refs[0];
        if (!anchor) return [];
        return [{
          ...common,
          item_id: anchor.itemId,
          item_key: anchor.itemKey,
          item_ids: refs.map(ref => ref.itemId),
          item_keys: refs.map(ref => ref.itemKey),
          question_count: refs.length,
          scope: "material" as const,
          question_type: unit.priority.label || unit.material_type,
          priority: unit.priority,
        }];
      }
      return refs.map(ref => ({
        ...common,
        item_id: ref.itemId,
        item_key: ref.itemKey,
        item_ids: [ref.itemId],
        item_keys: [ref.itemKey],
        question_count: 1,
        scope: "item" as const,
        question_type: ref.questionType,
        priority: ref.priority,
      }));
    });
  });
}

function unitNoun(part: number) {
  if (part === 3 || part === 4) return "组";
  if (part === 6 || part === 7) return "篇";
  return "题";
}

function compareOfficial(a: DrillRef, b: DrillRef) {
  return a.volume - b.volume || a.test - b.test || a.part - b.part ||
    String(a.item_id).localeCompare(String(b.item_id), undefined, {numeric: true});
}

function randomRank(ref: DrillRef, seed: number) {
  const value = `${ref.bank_id}/${ref.unit_id}/${ref.item_key}/${seed}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [indexes, setIndexes] = useState<BankIndex[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [bankFilter, setBankFilter] = useState("official-1-test-1");
  const [partFilter, setPartFilter] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("OFFICIAL");
  const [randomSeed, setRandomSeed] = useState(1);
  const [position, setPosition] = useState(0);
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [saved, setSaved] = useState<Saved>(EMPTY_SAVED);
  const [stickyKeys, setStickyKeys] = useState<string[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showOcrText, setShowOcrText] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [relatedAnswers, setRelatedAnswers] = useState<Record<string, boolean>>({});
  const [relatedAnalysis, setRelatedAnalysis] = useState<Record<string, boolean>>({});
  const [sideOpen, setSideOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(330);
  const [materialPercent, setMaterialPercent] = useState(46);
  const detailCache = useRef(new Map<string, UnitDetail>());
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const nextCatalog = await fetchJson<Catalog>(dataUrl("catalog.json"), controller.signal);
        setCatalog(nextCatalog);
        const results = await Promise.allSettled(nextCatalog.banks.map(bank =>
          fetchJson<BankIndex>(dataUrl(bank.index_path), controller.signal),
        ));
        const loaded = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
        setIndexes(loaded);
        setIndexLoading(false);
        const failed = results.length - loaded.length;
        if (failed) setLoadError(`${failed} 套题库索引暂时无法载入，已显示其余题库。`);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setLoadError(`题库目录载入失败：${(error as Error).message}`);
        setIndexLoading(false);
      }
    })();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved(normalizeSaved(JSON.parse(raw)));
    } catch {
      setSaved(EMPTY_SAVED);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (catalog) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [catalog, saved]);

  const allRefs = useMemo(() => buildDrillRefs(catalog, indexes), [catalog, indexes]);
  const priorityCounts = useMemo(() => {
    const counts: Record<Level, number> = {P1: 0, P2: 0, P3: 0};
    for (const ref of allRefs) {
      if (bankFilter !== "ALL" && ref.bank_id !== bankFilter) continue;
      if (partFilter && ref.part !== partFilter) continue;
      counts[ref.priority.level]++;
    }
    return counts;
  }, [allRefs, bankFilter, partFilter]);
  const partCounts = useMemo(() => {
    const counts = Array(8).fill(0) as number[];
    for (const ref of allRefs) if (bankFilter === "ALL" || ref.bank_id === bankFilter) counts[ref.part]++;
    return counts;
  }, [allRefs, bankFilter]);
  const statusBaseRefs = useMemo(() => allRefs.filter(ref => {
    if (bankFilter !== "ALL" && ref.bank_id !== bankFilter) return false;
    if (partFilter && ref.part !== partFilter) return false;
    return priorityFilter === "ALL" || ref.priority.level === priorityFilter;
  }), [allRefs, bankFilter, partFilter, priorityFilter]);
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {ALL: statusBaseRefs.length, UNDONE: 0, DONE: 0, WRONG: 0, STARRED: 0};
    for (const ref of statusBaseRefs) {
      const done = ref.item_keys.every(key => Object.hasOwn(saved.answers, key));
      counts[done ? "DONE" : "UNDONE"]++;
      if (ref.item_keys.some(key => saved.wrong.includes(key))) counts.WRONG++;
      if (ref.item_keys.some(key => saved.stars.includes(key))) counts.STARRED++;
    }
    return counts;
  }, [statusBaseRefs, saved]);
  const queue = useMemo(() => {
    const refs = statusBaseRefs.filter(ref => {
      const sticky = ref.item_keys.some(key => stickyKeys.includes(key));
      if (!sticky && statusFilter === "UNDONE" && ref.item_keys.every(key => Object.hasOwn(saved.answers, key))) return false;
      if (!sticky && statusFilter === "DONE" && !ref.item_keys.every(key => Object.hasOwn(saved.answers, key))) return false;
      if (!sticky && statusFilter === "WRONG" && !ref.item_keys.some(key => saved.wrong.includes(key))) return false;
      if (!sticky && statusFilter === "STARRED" && !ref.item_keys.some(key => saved.stars.includes(key))) return false;
      return true;
    });
    if (sortMode === "PRIORITY") return refs.sort((a, b) =>
      LEVEL_RANK[a.priority.level] - LEVEL_RANK[b.priority.level] || b.priority.score - a.priority.score || compareOfficial(a, b));
    if (sortMode === "OFFICIAL") return refs.sort(compareOfficial);
    return refs.sort((a, b) => randomRank(a, randomSeed) - randomRank(b, randomSeed) || compareOfficial(a, b));
  }, [statusBaseRefs, statusFilter, sortMode, randomSeed, saved, stickyKeys]);

  const multiCardMode = MULTI_CARD_PARTS.has(partFilter);
  const pageStart = multiCardMode ? Math.floor(position / MULTI_CARD_PAGE_SIZE) * MULTI_CARD_PAGE_SIZE : position;
  const pageRefs = multiCardMode ? queue.slice(pageStart, pageStart + MULTI_CARD_PAGE_SIZE) : [];
  const current = queue[pageStart];
  const globalActionKeys = multiCardMode ? pageRefs.flatMap(ref => ref.item_keys) : (current?.item_keys || []);
  const globalAllAnswersOpen = Boolean(globalActionKeys.length) && globalActionKeys.every(key => saved.revealed.includes(key));
  const globalHasChoices = globalActionKeys.some(key => Object.hasOwn(saved.answers, key));
  const next = queue[multiCardMode ? pageStart + MULTI_CARD_PAGE_SIZE : pageStart + 1];
  const nextBankId = next?.bank_id;
  const nextDetailPath = next?.detail_path;
  const activeDetail = detail && current && detail.bank_id === current.bank_id && detail.unit_id === current.unit_id ? detail : null;
  const currentItem = activeDetail?.items.find(item => String(item.item_id) === String(current?.item_id));
  useEffect(() => {
    setPosition(0);
    setStickyKeys([]);
  }, [bankFilter, partFilter, priorityFilter, statusFilter, sortMode, randomSeed]);

  useEffect(() => {
    if (position >= queue.length) setPosition(Math.max(0, queue.length - 1));
  }, [position, queue.length]);

  useEffect(() => {
    setShowTranscript(false);
    setShowTranslation(false);
    setShowOcrText(false);
    setShowAnalysis(false);
    setRelatedAnswers({});
    setRelatedAnalysis({});
    audio.current?.pause();
  }, [current?.item_key]);

  useEffect(() => {
    setShowAnswer(Boolean(current?.item_key && saved.revealed.includes(current.item_key)));
  }, [current?.item_key, saved.revealed]);

  useEffect(() => {
    if (!current || multiCardMode) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError("");
      return;
    }
    const cached = detailCache.current.get(current.detail_path);
    if (cached) {
      setDetail(cached);
      setDetailLoading(false);
      setDetailError("");
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    setDetailError("");
    fetchJson<UnitDetail>(dataUrl(current.detail_path), controller.signal)
      .then(value => {
        detailCache.current.set(current.detail_path, value);
        setDetail(value);
      })
      .catch(error => {
        if ((error as Error).name !== "AbortError") setDetailError(`当前题目载入失败：${(error as Error).message}`);
      })
      .finally(() => {if (!controller.signal.aborted) setDetailLoading(false);});
    return () => controller.abort();
  }, [current?.detail_path, multiCardMode]);

  useEffect(() => {
    if (!nextBankId || !nextDetailPath || nextDetailPath === current?.detail_path) return;

    const controller = new AbortController();
    const prefetchLinks: HTMLLinkElement[] = [];
    const addMediaPrefetch = (href: string, type: "audio" | "image") => {
      if (!href) return;
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = type;
      link.href = href;
      link.setAttribute("fetchpriority", "low");
      document.head.appendChild(link);
      prefetchLinks.push(link);
    };

    (async () => {
      try {
        let nextDetail = detailCache.current.get(nextDetailPath);
        if (!nextDetail) {
          nextDetail = await fetchJson<UnitDetail>(dataUrl(nextDetailPath), controller.signal);
          if (controller.signal.aborted) return;
          detailCache.current.set(nextDetailPath, nextDetail);
        }

        const nextContext = nextDetail.context || {};
        addMediaPrefetch(assetUrl(nextBankId, nextContext.audio_path || nextContext.question_audio_path), "audio");
        addMediaPrefetch(assetUrl(nextBankId, nextContext.picture_path || nextContext.picture_paths?.[0]), "image");
      } catch {
        // Prefetch is best-effort; the regular detail loader reports actionable failures.
      }
    })();

    return () => {
      controller.abort();
      prefetchLinks.forEach(link => link.remove());
    };
  }, [current?.detail_path, nextBankId, nextDetailPath]);

  const go = (next: number) => {
    setPosition(Math.max(0, Math.min(queue.length - 1, next)));
    window.scrollTo({top: 0, behavior: "smooth"});
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "AUDIO"].includes(tag || "")) return;
      const step = multiCardMode ? MULTI_CARD_PAGE_SIZE : 1;
      if (event.key === "ArrowRight") go(pageStart + step);
      if (event.key === "ArrowLeft") go(pageStart - step);
      if (event.key === " ") {
        event.preventDefault();
        const targetAudio = multiCardMode
          ? (activeAudioElement?.isConnected ? activeAudioElement : document.querySelector<HTMLAudioElement>(".singleItemGallery audio"))
          : audio.current;
        if (targetAudio) targetAudio.paused ? targetAudio.play() : targetAudio.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageStart, queue.length, multiCardMode]);

  const choose = (item: Item, label: string, answerVisible = false) => {
    const key = item.item_key;
    const correct = label.toUpperCase() === String(item.answer || "").toUpperCase();
    setStickyKeys(previous => previous.includes(key) ? previous : [...previous, key]);
    setSaved(previous => ({
      ...previous,
      answers: {...previous.answers, [key]: label},
      wrong: answerVisible
        ? (correct ? previous.wrong.filter(value => value !== key) : [...new Set([...previous.wrong, key])])
        : previous.wrong.filter(value => value !== key),
    }));
  };
  const gradeAnswer = (item: Item) => {
    const selected = saved.answers[item.item_key];
    if (!selected) return;
    const correct = selected.toUpperCase() === String(item.answer || "").toUpperCase();
    setSaved(previous => ({
      ...previous,
      wrong: correct ? previous.wrong.filter(value => value !== item.item_key) : [...new Set([...previous.wrong, item.item_key])],
    }));
  };
  const setRevealedKeys = (keys: string[], visible: boolean) => {
    setSaved(previous => ({
      ...previous,
      revealed: visible
        ? [...new Set([...previous.revealed, ...keys])]
        : previous.revealed.filter(value => !keys.includes(value)),
    }));
  };
  const setAnswerRevealed = (items: Item | Item[], visible: boolean) => {
    setRevealedKeys((Array.isArray(items) ? items : [items]).map(item => item.item_key), visible);
  };
  const clearChoicesByKeys = (keys: string[]) => {
    setSaved(previous => {
      const answers = {...previous.answers};
      keys.forEach(key => delete answers[key]);
      return {
        ...previous,
        answers,
        wrong: previous.wrong.filter(value => !keys.includes(value)),
        revealed: previous.revealed.filter(value => !keys.includes(value)),
      };
    });
  };
  const clearChoice = (item: Item) => {
    setSaved(previous => {
      const answers = {...previous.answers};
      delete answers[item.item_key];
      return {
        ...previous,
        answers,
        wrong: previous.wrong.filter(value => value !== item.item_key),
        revealed: previous.revealed.filter(value => value !== item.item_key),
      };
    });
  };
  const toggleStar = (ref: DrillRef = current) => {
    if (!ref) return;
    setStickyKeys(previous => [...new Set([...previous, ...ref.item_keys])]);
    setSaved(previous => ({
      ...previous,
      stars: ref.item_keys.some(key => previous.stars.includes(key))
        ? previous.stars.filter(value => !ref.item_keys.includes(value))
        : [...previous.stars, ref.item_key],
    }));
  };

  const context = activeDetail?.context || {};
  const audioSrc = current ? assetUrl(current.bank_id, context.audio_path || context.question_audio_path) : "";
  const pictures = current
    ? [context.picture_path, ...(context.picture_paths || [])]
      .filter((ref): ref is MediaRef => Boolean(assetUrl(current.bank_id, ref)))
      .filter((ref, index, all) => all.findIndex(candidate => candidate.path === ref.path) === index)
    : [];
  const transcript = currentItem && current
    ? context.transcript || (current.part <= 2
      ? [currentItem.question, ...(currentItem.choices || []).map((choice, index) => `${CHOICE_LABELS[index]}. ${choice}`)].filter(Boolean).join("\n")
      : "")
    : "";
  const transcriptTranslation = currentItem
    ? context.transcript_translation || [currentItem.question_translation, ...(currentItem.choice_translations || [])].filter(Boolean).join("\n")
    : "";
  const passage = context.passage || "";
  const passageTranslation = context.passage_translation || context.content_translation || "";
  const readingLayoutImages = current ? (context.reading_layout_images || []).filter(ref => Boolean(assetUrl(current.bank_id, ref))) : [];
  const isStarred = current ? current.item_keys.some(key => saved.stars.includes(key)) : false;
  const currentNoun = current ? unitNoun(current.part) : (partFilter ? unitNoun(partFilter) : "项");
  const queueNoun = partFilter ? unitNoun(partFilter) : "项";
  const currentItemRange = current
    ? current.item_ids.length > 1 ? `${current.item_ids[0]}–${current.item_ids.at(-1)}` : String(current.item_id)
    : "";
  const materialItems = activeDetail?.items || [];
  const materialAllAnalysisOpen = Boolean(currentItem && materialItems.length) && materialItems.every(item =>
    item.item_key === currentItem.item_key ? showAnalysis : Boolean(relatedAnalysis[item.item_key]),
  );
  const materialAllAnswersOpen = Boolean(currentItem && materialItems.length) && materialItems.every(item =>
    item.item_key === currentItem.item_key
      ? showAnswer
      : (Object.hasOwn(relatedAnswers, item.item_key) ? Boolean(relatedAnswers[item.item_key]) : saved.revealed.includes(item.item_key)),
  );
  const currentItemKey = currentItem?.item_key;
  const materialAnyAnalysisOpen = Boolean(currentItemKey && materialItems.some(item =>
    item.item_key === currentItemKey ? showAnalysis : Boolean(relatedAnalysis[item.item_key]),
  ));
  const materialKnowledge = activeDetail?.knowledge_accumulation;
  const hasMaterialKnowledge = materialKnowledge?.schema_version === "2.0" && Boolean(
    materialKnowledge.vocabulary?.length || materialKnowledge.collocations?.length,
  );
  const toggleAllMaterialAnalysis = () => {
    if (!currentItem) return;
    const nextOpen = !materialAllAnalysisOpen;
    setShowAnalysis(nextOpen);
    setRelatedAnalysis(Object.fromEntries(materialItems
      .filter(item => item.item_key !== currentItem.item_key)
      .map(item => [item.item_key, nextOpen])));
  };
  const toggleAllMaterialAnswers = () => {
    if (!currentItem) return;
    const nextOpen = !materialAllAnswersOpen;
    if (nextOpen) materialItems.forEach(item => gradeAnswer(item));
    setAnswerRevealed(materialItems, nextOpen);
    setShowAnswer(nextOpen);
    setRelatedAnswers(Object.fromEntries(materialItems
      .filter(item => item.item_key !== currentItem.item_key)
      .map(item => [item.item_key, nextOpen])));
  };
  const toggleGlobalAnswers = () => {
    if (!globalActionKeys.length) return;
    const nextOpen = !globalAllAnswersOpen;
    const loadedItems = multiCardMode
      ? pageRefs.flatMap(ref => detailCache.current.get(ref.detail_path)?.items.filter(item => ref.item_keys.includes(item.item_key)) || [])
      : (activeDetail?.items || []);
    if (nextOpen) loadedItems.forEach(item => gradeAnswer(item));
    setRevealedKeys(globalActionKeys, nextOpen);
    if (!multiCardMode && currentItem) {
      setShowAnswer(nextOpen);
      setRelatedAnswers(Object.fromEntries(materialItems
        .filter(item => item.item_key !== currentItem.item_key)
        .map(item => [item.item_key, nextOpen])));
    }
  };
  const clearGlobalChoices = () => {
    if (!globalHasChoices) return;
    const scope = multiCardMode ? `当前页面的 ${globalActionKeys.length} 道题` : `当前${current?.scope === "material" ? (current.part <= 4 ? "整组" : "整篇") : "题目"}`;
    if (!window.confirm(`确定清空${scope}的全部选择吗？此操作不会影响其他页面。`)) return;
    clearChoicesByKeys(globalActionKeys);
    setShowAnswer(false);
    setRelatedAnswers({});
  };
  const beginSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 760) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    document.body.classList.add("resizingColumns");
    const move = (moveEvent: PointerEvent) => setSidebarWidth(Math.min(430, Math.max(250, startWidth + moveEvent.clientX - startX)));
    const stop = () => {
      document.body.classList.remove("resizingColumns");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, {once: true});
  };
  const resizeSidebarWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setSidebarWidth(value => Math.min(430, Math.max(250, value + (event.key === "ArrowRight" ? 12 : -12))));
  };
  const beginMaterialResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const startX = event.clientX;
    const startPercent = materialPercent;
    const width = container.getBoundingClientRect().width;
    document.body.classList.add("resizingColumns");
    const move = (moveEvent: PointerEvent) => setMaterialPercent(Math.min(68, Math.max(32, startPercent + (moveEvent.clientX - startX) / width * 100)));
    const stop = () => {
      document.body.classList.remove("resizingColumns");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, {once: true});
  };
  const resizeMaterialWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setMaterialPercent(value => Math.min(68, Math.max(32, value + (event.key === "ArrowRight" ? 2 : -2))));
  };

  if (!catalog && !loadError) return <main className="loading"><div className="loader"/>正在载入 24 套官方题库目录…</main>;

  return <main className="shell globalPractice">
    <button className="menu floatingMenu" onClick={() => setSideOpen(value => !value)} aria-label="打开筛选器">☰</button>
    <div className="layout" style={{"--sidebar-width": `${sidebarWidth}px`} as CSSProperties}>
      <aside className={sideOpen ? "open" : ""}>
        <div className="asideTitle">训练筛选 <button onClick={() => setSideOpen(false)}>×</button></div>
        <label className="filterLabel" htmlFor="bank-filter">题库</label>
        <select id="bank-filter" className="bankSelect" value={bankFilter} onChange={event => setBankFilter(event.target.value)}>
          <option value="ALL">全部官方题库（{allRefs.length || 2472} 个训练单元）</option>
          {catalog?.banks.map(bank => <option key={bank.bank_id} value={bank.bank_id}>Official {bank.volume} · Test {bank.test}</option>)}
        </select>

        <div className="filterLabel">Part</div>
        <div className="partFilters">
          <button className={partFilter === 0 ? "on" : ""} onClick={() => setPartFilter(0)}>全部</button>
          {Array.from({length: 7}, (_, index) => index + 1).map(part => <button key={part} className={partFilter === part ? "on" : ""} onClick={() => setPartFilter(part)}>
            <b>Part {part} · {PART_META[part].focus}</b><small>{PART_META[part].section} · {partCounts[part]} {unitNoun(part)}</small>
          </button>)}
        </div>

        <div className="filterLabel">训练优先级</div>
        <div className="priorityFilters globalPriorityFilters">
          {PRIORITIES.map(level => <button key={level} className={priorityFilter === level ? "on" : ""} onClick={() => setPriorityFilter(level)}>
            {level === "ALL" ? "全部" : `${level} ${level === "P1" ? "必刷" : level === "P2" ? "重点" : "巩固"}`}
            {level !== "ALL" && <small>{priorityCounts[level]}</small>}
          </button>)}
        </div>

        <div className="filterLabel">完成状态</div>
        <div className="statusFilters">
          {STATUS_OPTIONS.map(option => <button key={option.value} className={statusFilter === option.value ? "on" : ""} onClick={() => setStatusFilter(option.value)}><span>{option.label}</span><small>{statusCounts[option.value]}</small></button>)}
        </div>
        <div className="filterLabel">本页操作</div>
        <div className="asideQueueTools">
          <div className="globalReviewTools">
            <button className="answerBtn" type="button" aria-pressed={globalAllAnswersOpen} disabled={!globalActionKeys.length} onClick={toggleGlobalAnswers}>{globalAllAnswersOpen ? "隐藏全部答案" : "查看全部答案"}</button>
            <button className="clearAnswerBtn" type="button" disabled={!globalHasChoices} onClick={clearGlobalChoices}>清空全部选择</button>
          </div>
          <div className="asideSortButtons" aria-label="排序方式">
            <button className={sortMode === "RANDOM" ? "orderBtn on" : "orderBtn"} type="button" aria-pressed={sortMode === "RANDOM"} onClick={() => {setSortMode("RANDOM"); setRandomSeed(value => value + 1);}}>随机排序</button>
            <button className={sortMode === "PRIORITY" ? "orderBtn on" : "orderBtn"} type="button" aria-pressed={sortMode === "PRIORITY"} onClick={() => setSortMode("PRIORITY")}>优先级排序</button>
            <button className={sortMode === "OFFICIAL" ? "orderBtn on" : "orderBtn"} type="button" aria-pressed={sortMode === "OFFICIAL"} onClick={() => setSortMode("OFFICIAL")}>官方排序</button>
          </div>
        </div>
        <div className="priorityLegend"><p><b className="badge p1">P1</b> 高频核心 · 优先必刷</p><p><b className="badge p2">P2</b> 重点题型 · 稳定巩固</p><p><b className="badge p3">P3</b> 基础覆盖 · 查漏补缺</p><small className="priorityBasis">材料型 Part 按文体、主题和整组考点综合排序；P 等级不是 ETS 官方频率。</small></div>
        <div className="asideHint"><b>快捷键</b><p><kbd>←</kbd> <kbd>→</kbd> 切题</p><p><kbd>Space</kbd> 播放 / 暂停</p></div>
      </aside>
      <div className="sidebarDivider" role="separator" aria-label="调整筛选栏宽度" aria-orientation="vertical" aria-valuemin={250} aria-valuemax={430} aria-valuenow={Math.round(sidebarWidth)} tabIndex={0} onPointerDown={beginSidebarResize} onKeyDown={resizeSidebarWithKeyboard} onDoubleClick={() => setSidebarWidth(330)}/>

      <section className="content">
        {loadError && <div className="loadNotice">{loadError}</div>}
        <div className="topline globalTopline">
          <div><span className="eyebrow">PRIORITY DRILL · {bankFilter === "ALL" ? "ALL 24 TESTS" : current?.bank_title}</span><h1>{partFilter ? `Part ${partFilter} 专项训练` : "全题库优先级刷题"}</h1></div>
          <div className="topTools"><div className="groupCount">{queue.length ? (multiCardMode ? `${pageStart + 1}–${Math.min(pageStart + MULTI_CARD_PAGE_SIZE, queue.length)} / ${queue.length} 题` : `${pageStart + 1} / ${queue.length} ${queueNoun}`) : `0 ${queueNoun}`}</div></div>
        </div>

        {indexLoading ? <div className="detailLoading"><div className="loader"/>正在汇总 4,800 题的优先级索引…</div> : !current ? <div className="empty"><b>当前筛选下没有题目</b><p>可以切换优先级、Part 或完成状态继续训练。</p><button onClick={() => {setBankFilter("ALL"); setPartFilter(0); setPriorityFilter("P1"); setStatusFilter("ALL");}}>恢复 P1 必刷队列</button></div> : multiCardMode ? <>
          <div className="multiPageIntro"><div><b>本页 {pageRefs.length} 题</b><span>每题可独立作答、收藏、查看原文与解析</span></div><div className="miniProgress"><i style={{width: `${Math.min(pageStart + pageRefs.length, queue.length) / queue.length * 100}%`}}/></div><div className="quickPager"><button disabled={pageStart === 0} onClick={() => go(pageStart - MULTI_CARD_PAGE_SIZE)}>← 上一页</button><button disabled={pageStart + MULTI_CARD_PAGE_SIZE >= queue.length} onClick={() => go(pageStart + MULTI_CARD_PAGE_SIZE)}>下一页 →</button></div></div>
          <SingleItemGallery refs={pageRefs} cache={detailCache} saved={saved} choose={choose} gradeAnswer={gradeAnswer} setAnswerRevealed={setAnswerRevealed} clearChoice={clearChoice} toggleStar={toggleStar}/>
          <div className="bottom pageBottom"><button disabled={pageStart === 0} onClick={() => go(pageStart - MULTI_CARD_PAGE_SIZE)}>← 上一页</button><button disabled={pageStart + MULTI_CARD_PAGE_SIZE >= queue.length} onClick={() => go(pageStart + MULTI_CARD_PAGE_SIZE)}>下一页 →</button></div>
        </> : <>
          <div className="questionNav globalQuestionNav">
            <span>{current.bank_title} · Part {current.part}</span>
            <div className="miniProgress"><i style={{width: `${(position + 1) / queue.length * 100}%`}}/></div>
            <span>{currentNoun} · 题 {currentItemRange}</span>
            <button className={isStarred ? "starred" : ""} onClick={() => toggleStar(current)} title={isStarred ? "取消收藏" : current.scope === "material" ? "收藏此材料" : "收藏此题"}>{isStarred ? "★" : "☆"}</button>
            <div className="quickPager"><button disabled={pageStart === 0} onClick={() => go(pageStart - 1)}>← 上一{currentNoun}</button><button disabled={pageStart >= queue.length - 1} onClick={() => go(pageStart + 1)}>下一{currentNoun} →</button></div>
          </div>
          <div className="priorityBrief compactPriority">
            <PriorityBadge value={current.priority}/>
            <div><b>{[3, 4, 6, 7].includes(current.part) ? (current.priority.label || current.unit_title || "材料综合训练") : (current.question_type || current.priority.label || current.unit_title || "重点题型训练")}</b>{current.priority.reason && <p>{current.priority.reason}</p>}{Boolean(current.priority.focus_tags?.length) && <div>{current.priority.focus_tags?.map(tag => <span key={tag}>{tag}</span>)}</div>}</div>
          </div>

          {detailLoading && <div className="detailLoading"><div className="loader"/>正在按需载入当前题目…</div>}
          {detailError && <div className="empty compactEmpty"><b>题目载入失败</b><p>{detailError}</p></div>}
          {activeDetail && currentItem && <article className={MATERIAL_PARTS.has(current.part) ? `materialSplit part${current.part}` : `part${current.part}`} style={MATERIAL_PARTS.has(current.part) ? {"--material-left": `${materialPercent}%`} as CSSProperties : undefined}>
            <section className={MATERIAL_PARTS.has(current.part) ? "materialSource" : "materialSource singleSource"}>
              {MATERIAL_PARTS.has(current.part) && <div className="materialBookmarkBar"><button className={isStarred ? "materialBookmarkButton active" : "materialBookmarkButton"} type="button" aria-pressed={isStarred} onClick={() => toggleStar(current)}>{isStarred ? `★ 已收藏本${current.part <= 4 ? "组" : "篇"}` : `☆ 收藏本${current.part <= 4 ? "组" : "篇"}`}</button></div>}
              {current.part <= 4 && audioSrc && <AudioBar audio={audio} src={audioSrc} canShowTranscript={Boolean(transcript)} showTranscript={showTranscript} toggleTranscript={() => setShowTranscript(value => !value)} showAnalysis={MATERIAL_PARTS.has(current.part) ? materialAllAnalysisOpen : showAnalysis} toggleAnalysis={MATERIAL_PARTS.has(current.part) ? toggleAllMaterialAnalysis : () => setShowAnalysis(value => !value)} analysisScope={MATERIAL_PARTS.has(current.part) ? "material" : "item"} showAnswer={MATERIAL_PARTS.has(current.part) ? undefined : showAnswer} toggleAnswer={MATERIAL_PARTS.has(current.part) ? undefined : () => {const nextOpen = !showAnswer; if (nextOpen) gradeAnswer(currentItem); setAnswerRevealed(currentItem, nextOpen); setShowAnswer(nextOpen);}} clearAnswer={MATERIAL_PARTS.has(current.part) ? undefined : () => {clearChoice(currentItem); setShowAnswer(false);}} hasChoice={Boolean(saved.answers[currentItem.item_key])} showAllAnswers={MATERIAL_PARTS.has(current.part) ? materialAllAnswersOpen : undefined} toggleAllAnswers={MATERIAL_PARTS.has(current.part) ? toggleAllMaterialAnswers : undefined}/>}
              {current.part <= 4 && !audioSrc && <div className="materialActions">{MATERIAL_PARTS.has(current.part) && <button className="answerBtn" onClick={toggleAllMaterialAnswers}>{materialAllAnswersOpen ? "隐藏所有答案" : "查看所有答案"}</button>}<button className="analysisBtn" onClick={MATERIAL_PARTS.has(current.part) ? toggleAllMaterialAnalysis : () => setShowAnalysis(value => !value)}>{MATERIAL_PARTS.has(current.part) ? (materialAllAnalysisOpen ? "隐藏全部解析" : "查看全部解析") : (showAnalysis ? "隐藏解析" : "查看解析")}</button>{transcript && <button className="translateBtn" onClick={() => setShowTranscript(value => !value)}>{showTranscript ? "隐藏原文" : "查看原文"}</button>}</div>}
              {current.part === 1 && <div className={showTranscript ? "part1Material withTranscript" : "part1Material"}>{pictures.length > 0 && <PictureGrid bankId={current.bank_id} pictures={pictures} part={current.part}/>} {showTranscript && transcript && <Transcript text={transcript} translation={transcriptTranslation} showTranslation={showTranslation} toggleTranslation={() => setShowTranslation(value => !value)}/>}</div>}
              {current.part >= 2 && current.part <= 4 && <>{pictures.length > 0 && <PictureGrid bankId={current.bank_id} pictures={pictures} part={current.part}/>} {showTranscript && transcript && <Transcript text={transcript} translation={transcriptTranslation} showTranslation={showTranslation} toggleTranslation={() => setShowTranslation(value => !value)}/>}</>}
              {current.part >= 6 && readingLayoutImages.length > 0 && <div className="readingLayoutPanel"><div className="readingLayoutLabel"><b>原始材料版面</b><span>完整原页 · 点击可放大</span></div><PictureGrid bankId={current.bank_id} pictures={readingLayoutImages} part={current.part}/></div>}
              {current.part >= 5 && passage && (!readingLayoutImages.length || showOcrText) && <div className={current.part === 6 ? "passage cloze ocrPassage" : "passage ocrPassage"}>{current.part === 6 ? markCloze(passage) : passage}</div>}
              {current.part >= 5 && <div className="actionRow readingActions">{readingLayoutImages.length > 0 && passage && <button className="translateBtn" aria-pressed={showOcrText} onClick={() => setShowOcrText(value => !value)}>{showOcrText ? "隐藏文字版" : "查看文字版"}</button>}{passageTranslation && <button className="translateBtn" aria-pressed={showTranslation} onClick={() => setShowTranslation(value => !value)}>{showTranslation ? "隐藏中文" : "翻译原文"}</button>}{!MATERIAL_PARTS.has(current.part) && <ReviewButtons showAnswer={showAnswer} showAnalysis={showAnalysis} hasChoice={Boolean(saved.answers[currentItem.item_key])} toggleAnswer={() => {const nextOpen = !showAnswer; if (nextOpen) gradeAnswer(currentItem); setAnswerRevealed(currentItem, nextOpen); setShowAnswer(nextOpen);}} toggleAnalysis={() => setShowAnalysis(value => !value)} clearChoice={() => {clearChoice(currentItem); setShowAnswer(false);}}/>}{MATERIAL_PARTS.has(current.part) && <><button className="answerBtn" aria-pressed={materialAllAnswersOpen} onClick={toggleAllMaterialAnswers}>{materialAllAnswersOpen ? "隐藏所有答案" : "查看所有答案"}</button><button className="analysisBtn" aria-pressed={materialAllAnalysisOpen} onClick={toggleAllMaterialAnalysis}>{materialAllAnalysisOpen ? "隐藏全部解析" : "查看全部解析"}</button></>}</div>}
              {current.part >= 5 && showTranslation && passageTranslation && <div className="translation">{passageTranslation}</div>}
            </section>

            {MATERIAL_PARTS.has(current.part) && <div className="materialDivider" role="separator" aria-label="调整材料和题目宽度" aria-orientation="vertical" aria-valuemin={32} aria-valuemax={68} aria-valuenow={Math.round(materialPercent)} tabIndex={0} onPointerDown={beginMaterialResize} onKeyDown={resizeMaterialWithKeyboard} onDoubleClick={() => setMaterialPercent(46)}/>}

            {MATERIAL_PARTS.has(current.part) ? <section className="materialQuestions"><div className="materialQuestionsTitle"><b>本{current.part <= 4 ? "组" : "篇"}全部题目</b><span>{activeDetail.items.length} 题 · 可单独或全部查看答案和解析</span></div>{activeDetail.items.map(item => {
              const anchor = item.item_key === currentItem.item_key;
              const answerVisible = anchor
                ? showAnswer
                : (Object.hasOwn(relatedAnswers, item.item_key) ? Boolean(relatedAnswers[item.item_key]) : saved.revealed.includes(item.item_key));
              const analysisVisible = anchor ? showAnalysis : Boolean(relatedAnalysis[item.item_key]);
              const toggleAnswer = () => {
                const nextOpen = !answerVisible;
                if (nextOpen) gradeAnswer(item);
                setAnswerRevealed(item, nextOpen);
                if (anchor) setShowAnswer(nextOpen);
                else setRelatedAnswers(previous => ({...previous, [item.item_key]: nextOpen}));
              };
              const toggleAnalysis = () => anchor ? setShowAnalysis(value => !value) : setRelatedAnalysis(previous => ({...previous, [item.item_key]: !previous[item.item_key]}));
              const clear = () => {
                clearChoice(item);
                if (anchor) setShowAnswer(false);
                else setRelatedAnswers(previous => ({...previous, [item.item_key]: false}));
              };
              return <section className="materialQuestionCard" key={item.item_key}><div className="materialQuestionTools"><span>题 {item.item_id}</span><ReviewButtons showAnswer={answerVisible} showAnalysis={analysisVisible} hasChoice={Boolean(saved.answers[item.item_key])} toggleAnswer={toggleAnswer} toggleAnalysis={toggleAnalysis} clearChoice={clear}/></div><QuestionBlock item={item} part={current.part} chosen={saved.answers[item.item_key]} showAnswer={answerVisible} showAnalysis={analysisVisible} choose={choose}/></section>;
            })}
            {materialAnyAnalysisOpen && hasMaterialKnowledge && materialKnowledge && <KnowledgeCard value={materialKnowledge}/>}</section> :
              <QuestionBlock key={currentItem.item_key} item={currentItem} part={current.part} chosen={saved.answers[currentItem.item_key]} showAnswer={showAnswer} showAnalysis={showAnalysis} choose={choose}/>}
          </article>}
          <div className="bottom pageBottom"><button disabled={pageStart === 0} onClick={() => go(pageStart - 1)}>← 上一{currentNoun}</button><button disabled={pageStart >= queue.length - 1} onClick={() => go(pageStart + 1)}>下一{currentNoun} →</button></div>
        </>}
      </section>
    </div>
  </main>;
}

function SingleItemGallery({refs, cache, saved, choose, gradeAnswer, setAnswerRevealed, clearChoice, toggleStar}: {refs: DrillRef[]; cache: RefObject<Map<string, UnitDetail>>; saved: Saved; choose: (item: Item, label: string, answerVisible?: boolean) => void; gradeAnswer: (item: Item) => void; setAnswerRevealed: (items: Item | Item[], visible: boolean) => void; clearChoice: (item: Item) => void; toggleStar: (ref: DrillRef) => void}) {
  return <section className="singleItemGallery">{refs.map((ref, index) => <SingleItemCard key={ref.item_key} refData={ref} eager={index < 2} cache={cache} saved={saved} choose={choose} gradeAnswer={gradeAnswer} setAnswerRevealed={setAnswerRevealed} clearChoice={clearChoice} toggleStar={toggleStar}/>)}</section>;
}

function SingleItemCard({refData, eager, cache, saved, choose, gradeAnswer, setAnswerRevealed, clearChoice, toggleStar}: {refData: DrillRef; eager: boolean; cache: RefObject<Map<string, UnitDetail>>; saved: Saved; choose: (item: Item, label: string, answerVisible?: boolean) => void; gradeAnswer: (item: Item) => void; setAnswerRevealed: (items: Item | Item[], visible: boolean) => void; clearChoice: (item: Item) => void; toggleStar: (ref: DrillRef) => void}) {
  const [detail, setDetail] = useState<UnitDetail | null>(() => cache.current?.get(refData.detail_path) || null);
  const [loading, setLoading] = useState(!detail);
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  useEffect(() => {
    const cached = cache.current?.get(refData.detail_path);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchJson<UnitDetail>(dataUrl(refData.detail_path), controller.signal)
      .then(value => {
        cache.current?.set(refData.detail_path, value);
        setDetail(value);
      })
      .catch(fetchError => {
        if ((fetchError as Error).name !== "AbortError") setError("题目载入失败");
      })
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [cache, refData.detail_path]);

  const item = detail?.items.find(value => String(value.item_id) === String(refData.item_id));
  useEffect(() => {
    setShowAnswer(saved.revealed.includes(item?.item_key || refData.item_key));
  }, [item?.item_key, refData.item_key, saved.revealed]);
  const context = detail?.context || {};
  const audioSrc = assetUrl(refData.bank_id, context.audio_path || context.question_audio_path);
  const pictures = [context.picture_path, ...(context.picture_paths || [])]
    .filter((picture): picture is MediaRef => Boolean(assetUrl(refData.bank_id, picture)))
    .filter((picture, index, all) => all.findIndex(candidate => candidate.path === picture.path) === index);
  const transcript = item ? context.transcript || [item.question, ...(item.choices || []).map((choice, index) => `${CHOICE_LABELS[index]}. ${choice}`)].filter(Boolean).join("\n") : "";
  const transcriptTranslation = item ? context.transcript_translation || [item.question_translation, ...(item.choice_translations || [])].filter(Boolean).join("\n") : "";
  const starred = saved.stars.includes(refData.item_key);

  return <article className={`singleItemCard part${refData.part}`}>
    <div className="singleCardHeading"><div><span>{refData.bank_title} · Part {refData.part}</span><b>题 {refData.item_id}</b></div><PriorityBadge value={refData.priority}/><button className={starred ? "starred" : ""} onClick={() => toggleStar(refData)} title={starred ? "取消收藏" : "收藏此题"}>{starred ? "★" : "☆"}</button></div>
    {loading && <div className="cardLoading"><div className="loader"/>载入题目…</div>}
    {error && <div className="cardError">{error}</div>}
    {item && <>
      {refData.part <= 2 && audioSrc && <div className="compactAudio"><audio controls src={audioSrc} preload={eager ? "auto" : "metadata"} controlsList="nodownload noremoteplayback" disablePictureInPicture onPlay={event => pauseOtherAudio(event.currentTarget)}/><div><button className="translateBtn" aria-pressed={showTranscript} onClick={() => setShowTranscript(value => !value)}>{showTranscript ? "隐藏原文" : "查看原文"}</button><button className="clearAnswerBtn" disabled={!saved.answers[item.item_key]} onClick={() => {clearChoice(item); setShowAnswer(false);}}>清空选择</button><button className="answerBtn" aria-pressed={showAnswer} onClick={() => {const nextOpen = !showAnswer; if (nextOpen) gradeAnswer(item); setAnswerRevealed(item, nextOpen); setShowAnswer(nextOpen);}}>{showAnswer ? "隐藏答案" : "查看答案"}</button><button className="analysisBtn" aria-pressed={showAnalysis} onClick={() => setShowAnalysis(value => !value)}>{showAnalysis ? "隐藏解析" : "查看解析"}</button></div></div>}
      {refData.part === 1 && pictures.length > 0 && <PictureGrid bankId={refData.bank_id} pictures={pictures} part={refData.part} eager={eager}/>}
      {showTranscript && transcript && <Transcript text={transcript} translation={transcriptTranslation} showTranslation={showTranslation} toggleTranslation={() => setShowTranslation(value => !value)}/>}
      {refData.part === 5 && <div className="singleReadingTools"><ReviewButtons showAnswer={showAnswer} showAnalysis={showAnalysis} hasChoice={Boolean(saved.answers[item.item_key])} toggleAnswer={() => {const nextOpen = !showAnswer; if (nextOpen) gradeAnswer(item); setAnswerRevealed(item, nextOpen); setShowAnswer(nextOpen);}} toggleAnalysis={() => setShowAnalysis(value => !value)} clearChoice={() => {clearChoice(item); setShowAnswer(false);}}/></div>}
      <QuestionBlock item={item} part={refData.part} chosen={saved.answers[item.item_key]} showAnswer={showAnswer} showAnalysis={showAnalysis} choose={choose}/>
    </>}
  </article>;
}

function AudioBar({audio, src, canShowTranscript, showTranscript, toggleTranscript, showAnalysis, toggleAnalysis, analysisScope = "item", showAnswer, toggleAnswer, clearAnswer, hasChoice = false, showAllAnswers, toggleAllAnswers}: {audio: RefObject<HTMLAudioElement | null>; src: string; canShowTranscript: boolean; showTranscript: boolean; toggleTranscript: () => void; showAnalysis: boolean; toggleAnalysis: () => void; analysisScope?: "item" | "material"; showAnswer?: boolean; toggleAnswer?: () => void; clearAnswer?: () => void; hasChoice?: boolean; showAllAnswers?: boolean; toggleAllAnswers?: () => void}) {
  const analysisText = analysisScope === "material" ? (showAnalysis ? "隐藏全部解析" : "查看全部解析") : (showAnalysis ? "隐藏解析" : "查看解析");
  const actionClass = toggleAllAnswers ? "audioActions materialReview" : toggleAnswer ? "audioActions itemReview" : "audioActions";
  return <div className="audio"><button className="playBtn" onClick={() => audio.current && (audio.current.paused ? audio.current.play() : audio.current.pause())}>▶</button><div className="audioLabel"><b>听力音频</b><small>空格键暂停 / 继续</small></div><audio ref={audio} controls src={src} preload="auto" controlsList="nodownload noremoteplayback" disablePictureInPicture onPlay={event => pauseOtherAudio(event.currentTarget)}/><div className={actionClass}>{canShowTranscript && <button className="translateBtn" aria-pressed={showTranscript} onClick={toggleTranscript}>{showTranscript ? "隐藏原文" : "查看原文"}</button>}{toggleAllAnswers ? <><button className="answerBtn" type="button" aria-pressed={showAllAnswers} onClick={toggleAllAnswers}>{showAllAnswers ? "隐藏所有答案" : "查看所有答案"}</button><button className="analysisBtn" type="button" aria-pressed={showAnalysis} onClick={toggleAnalysis}>{analysisText}</button></> : toggleAnswer && clearAnswer ? <><button className="clearAnswerBtn" type="button" disabled={!hasChoice} onClick={clearAnswer}>清空选择</button><button className="answerBtn" type="button" aria-pressed={showAnswer} onClick={toggleAnswer}>{showAnswer ? "隐藏答案" : "查看答案"}</button><button className="analysisBtn" type="button" aria-pressed={showAnalysis} onClick={toggleAnalysis}>{showAnalysis ? "隐藏解析" : "查看解析"}</button></> : <button className="analysisBtn" aria-pressed={showAnalysis} onClick={toggleAnalysis}>{analysisText}</button>}</div></div>;
}

function ReviewButtons({showAnswer, showAnalysis, hasChoice, toggleAnswer, toggleAnalysis, clearChoice}: {showAnswer: boolean; showAnalysis: boolean; hasChoice: boolean; toggleAnswer: () => void; toggleAnalysis: () => void; clearChoice: () => void}) {
  return <div className="reviewButtons"><button className="answerBtn" type="button" aria-pressed={showAnswer} onClick={toggleAnswer}>{showAnswer ? "隐藏答案" : "查看答案"}</button><button className="analysisBtn" type="button" aria-pressed={showAnalysis} onClick={toggleAnalysis}>{showAnalysis ? "隐藏解析" : "查看解析"}</button><button className="clearAnswerBtn" type="button" disabled={!hasChoice} onClick={clearChoice}>清空选择</button></div>;
}

function PictureGrid({bankId, pictures, part, eager = true}: {bankId: string; pictures: MediaRef[]; part: number; eager?: boolean}) {
  const [activeImage, setActiveImage] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const imageAlt = part === 1 ? "照片描述题图片" : part >= 6 ? "阅读题原始材料版面" : "听力题配套图表";

  useEffect(() => {
    if (activeImage === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveImage(null);
      if (event.key === "ArrowLeft" && pictures.length > 1) setActiveImage(value => value === null ? null : (value - 1 + pictures.length) % pictures.length);
      if (event.key === "ArrowRight" && pictures.length > 1) setActiveImage(value => value === null ? null : (value + 1) % pictures.length);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [activeImage, pictures.length]);

  const close = () => {
    setActiveImage(null);
    setZoomed(false);
  };
  const move = (offset: number) => {
    setActiveImage(value => value === null ? null : (value + offset + pictures.length) % pictures.length);
    setZoomed(false);
  };

  return <>
    <div className="images">{pictures.map((picture, index) => <button className="zoomImageButton" type="button" key={`${picture.path}-${index}`} onClick={() => {setActiveImage(index); setZoomed(false);}} aria-label={`${imageAlt} ${index + 1}，点击放大`}><img src={assetUrl(bankId, picture)} alt={`${imageAlt} ${index + 1}`} loading={eager && index === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={eager && index === 0 ? "high" : "auto"}/><span>点击放大</span></button>)}</div>
    {activeImage !== null && <div className="imageLightbox" role="dialog" aria-modal="true" aria-label="题目图片放大预览" onMouseDown={event => {if (event.target === event.currentTarget) close();}}>
      <button className="imageLightboxClose" type="button" onClick={close} aria-label="关闭图片预览">×</button>
      {pictures.length > 1 && <button className="imageLightboxNav previous" type="button" onClick={() => move(-1)} aria-label="上一张图片">‹</button>}
      <div className="imageLightboxViewport" onMouseDown={event => {if (event.target === event.currentTarget) close();}}>
        <img className={zoomed ? "imageLightboxImage zoomed" : "imageLightboxImage"} src={assetUrl(bankId, pictures[activeImage])} alt={`放大预览：${imageAlt} ${activeImage + 1}`} onClick={() => setZoomed(value => !value)}/>
      </div>
      {pictures.length > 1 && <button className="imageLightboxNav next" type="button" onClick={() => move(1)} aria-label="下一张图片">›</button>}
      <div className="imageLightboxHint">点击图片可继续放大 · Esc 关闭</div>
    </div>}
  </>;
}

function pauseOtherAudio(current: HTMLAudioElement) {
  activeAudioElement = current;
  document.querySelectorAll("audio").forEach(element => {if (element !== current) element.pause();});
}

function Transcript({text, translation, showTranslation, toggleTranslation}: {text: string; translation: string; showTranslation: boolean; toggleTranslation: () => void}) {
  return <div className="transcript listeningTranscript"><pre>{text}</pre>{translation && <button className="translateBtn" aria-pressed={showTranslation} onClick={toggleTranslation}>{showTranslation ? "隐藏中文" : "翻译原文"}</button>}{showTranslation && translation && <div className="translation">{translation}</div>}</div>;
}

function QuestionBlock({item, part, chosen, showAnswer, showAnalysis, choose}: {item: Item; part: number; chosen?: string; showAnswer: boolean; showAnalysis: boolean; choose: (item: Item, label: string, answerVisible?: boolean) => void}) {
  const [showQuestionTranslation, setShowQuestionTranslation] = useState(false);
  const hiddenText = part <= 2;
  const choices = item.choices || [];
  const correctAnswer = String(item.answer || "").toUpperCase();
  return <div className="questionBlock">
    <div className="itemHeading"><PriorityBadge value={item.priority}/><span>{item.question_type || item.priority.label}</span></div>
    {!hiddenText && item.question && <><h2><span>{item.item_id}.</span> {item.question}</h2>{item.question_translation && <><button className="translateBtn questionTranslate" onClick={() => setShowQuestionTranslation(value => !value)}>{showQuestionTranslation ? "隐藏题干翻译" : "翻译题干"}</button>{showQuestionTranslation && <div className="translation">{item.question_translation}</div>}</>}</>}
    <div className={hiddenText ? "choices examHidden" : "choices"}>{choices.map((choice, index) => {
      const label = CHOICE_LABELS[index] || String(index + 1);
      const selected = chosen === label;
      const correct = label === correctAnswer;
      const state = showAnswer ? (correct ? "correct" : selected ? "incorrect" : "") : selected ? "selected" : "";
      return <button className={state} key={label} onClick={() => choose(item, label, showAnswer)} aria-label={hiddenText ? `选项 ${label}` : undefined} aria-pressed={selected}><span>{label}</span>{!hiddenText && <p>{choice}</p>}{state === "correct" && <b>✓</b>}{state === "incorrect" && <b>×</b>}</button>;
    })}</div>
    {showAnalysis && <AnswerAnalysis item={item} part={part} chosen={chosen} answerVisible={showAnswer}/>}
  </div>;
}

function AnswerAnalysis({item, part, chosen, answerVisible}: {item: Item; part: number; chosen?: string; answerVisible: boolean}) {
  const correct = chosen && chosen.toUpperCase() === String(item.answer || "").toUpperCase();
  const hasKnowledge = item.knowledge_accumulation?.schema_version === "2.0" && Boolean(item.knowledge_accumulation.vocabulary?.length || item.knowledge_accumulation.collocations?.length);
  return <div className={`explain ${answerVisible && chosen ? (correct ? "good" : "bad") : "neutral"}`}>
    <div><b>答案：{item.answer || "—"}{item.question_type ? ` · ${item.question_type}` : ""}</b></div>
    {part === 2 && item.response_style && <p><strong>回答方式：</strong>{item.response_style}</p>}
    {item.grammar_point && <p><strong>考查知识点：</strong>{item.grammar_point}</p>}
    {item.strategy && <p><strong>解题思路：</strong>{item.strategy}</p>}
    {part >= 3 && item.evidence && <p><strong>原文定位：</strong>{item.evidence}</p>}
    {item.answer_explain && <p><strong>解析：</strong>{item.answer_explain}</p>}
    {part >= 3 && Boolean(item.choice_translations?.length) && <div className="optionZh"><strong>选项释义：</strong>{item.choice_translations?.map((translation, index) => <p key={`${translation}-${index}`}>{/^[A-D][：:.]/.test(translation) ? translation : `${CHOICE_LABELS[index]}. ${translation}`}</p>)}</div>}
    {hasKnowledge && item.knowledge_accumulation && <KnowledgeCard value={item.knowledge_accumulation}/>}
  </div>;
}

function PriorityBadge({value}: {value: Priority}) {
  return <b className={`badge ${value.level.toLowerCase()}`} title={`训练优先级 ${value.level} · ${value.score} 分`}>{value.level}</b>;
}

function KnowledgeCard({value}: {value: Knowledge}) {
  return <section className="knowledge"><div className="knowledgeTitle"><span>✦</span><div><b>知识积累</b><small>Vocabulary & Collocations</small></div></div><div className="knowledgeGrid">
    {Boolean(value.vocabulary?.length) && <div><h3>重点单词</h3>{value.vocabulary?.map((entry, index) => <p key={`${entry.term}-${index}`}><strong>{entry.term}</strong><span>{entry.meaning}</span></p>)}</div>}
    {Boolean(value.collocations?.length) && <div><h3>重点短语与搭配</h3>{value.collocations?.map((entry, index) => <p key={`${entry.phrase}-${index}`}><strong>{entry.phrase}</strong><span>{entry.meaning}</span></p>)}</div>}
  </div></section>;
}

function markCloze(value: string) {
  return value.replace(/[“\"]?\b(1(?:3[1-9]|4[0-6]))\b\.?/g, "【$1】 ______ ");
}
