"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import type {RefObject} from "react";

type Level = "P1" | "P2" | "P3";
type Priority = {
  level: Level;
  score: number;
  label?: string;
  reason?: string;
  focus_tags?: string[];
};
type MediaRef = {path: string; asset_key?: string; exists?: boolean};
type KnowledgeEntry = {term?: string; phrase?: string; meaning?: string};
type Knowledge = {vocabulary?: KnowledgeEntry[]; collocations?: KnowledgeEntry[]};
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
  picture_path?: MediaRef;
  picture_paths?: MediaRef[];
  transcript?: string;
  transcript_translation?: string;
  passage?: string;
  passage_translation?: string;
  content_translation?: string;
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
  question_type?: string;
  priority: Priority;
};
type Saved = {answers: Record<string, string>; wrong: string[]; stars: string[]};
type PriorityFilter = "ALL" | Level;
type StatusFilter = "ALL" | "UNDONE" | "WRONG" | "STARRED";

const CHOICE_LABELS = ["A", "B", "C", "D"];
const PRIORITIES: PriorityFilter[] = ["P1", "P2", "P3", "ALL"];
const STATUS_OPTIONS: Array<{value: StatusFilter; label: string}> = [
  {value: "ALL", label: "全部"},
  {value: "UNDONE", label: "未做"},
  {value: "WRONG", label: "错题"},
  {value: "STARRED", label: "收藏"},
];
const EMPTY_SAVED: Saved = {answers: {}, wrong: [], stars: []};
const STORAGE_KEY = "toeic-global-progress-v3";
const LEVEL_RANK: Record<Level, number> = {P1: 1, P2: 2, P3: 3};

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
  return indexes.flatMap(index => {
    const bank = bankMeta.get(index.bank_id);
    if (!bank) return [];
    return index.units.flatMap(unit => unitItemSummaries(unit).map((summary, position) => {
      const itemId = summary.item_id ?? summary.id ?? unit.item_ids[position];
      const priority = summary.priority || unit.item_priorities?.[String(itemId)] || unit.priority;
      return {
        bank_id: index.bank_id,
        bank_title: index.name || bank.title,
        volume: bank.volume,
        test: bank.test,
        unit_id: unit.unit_id,
        detail_path: unit.detail_path,
        unit_title: unit.title,
        part: unit.part,
        item_id: itemId,
        item_key: summary.item_key || `${index.bank_id}/${unit.unit_id}/${itemId}`,
        question_type: summary.question_type,
        priority,
      };
    }));
  });
}

function compareOfficial(a: DrillRef, b: DrillRef) {
  return a.volume - b.volume || a.test - b.test || a.part - b.part ||
    String(a.item_id).localeCompare(String(b.item_id), undefined, {numeric: true});
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [indexes, setIndexes] = useState<BankIndex[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [bankFilter, setBankFilter] = useState("ALL");
  const [partFilter, setPartFilter] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("P1");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [priorityOrder, setPriorityOrder] = useState(true);
  const [position, setPosition] = useState(0);
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [saved, setSaved] = useState<Saved>(EMPTY_SAVED);
  const [stickyKey, setStickyKey] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [relatedAnalysis, setRelatedAnalysis] = useState<Record<string, boolean>>({});
  const [sideOpen, setSideOpen] = useState(false);
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
  const queue = useMemo(() => {
    const refs = allRefs.filter(ref => {
      if (bankFilter !== "ALL" && ref.bank_id !== bankFilter) return false;
      if (partFilter && ref.part !== partFilter) return false;
      if (priorityFilter !== "ALL" && ref.priority.level !== priorityFilter) return false;
      if (ref.item_key !== stickyKey && statusFilter === "UNDONE" && saved.answers[ref.item_key]) return false;
      if (ref.item_key !== stickyKey && statusFilter === "WRONG" && !saved.wrong.includes(ref.item_key)) return false;
      if (ref.item_key !== stickyKey && statusFilter === "STARRED" && !saved.stars.includes(ref.item_key)) return false;
      return true;
    });
    return refs.sort((a, b) => priorityOrder
      ? LEVEL_RANK[a.priority.level] - LEVEL_RANK[b.priority.level] || b.priority.score - a.priority.score || compareOfficial(a, b)
      : compareOfficial(a, b));
  }, [allRefs, bankFilter, partFilter, priorityFilter, statusFilter, priorityOrder, saved, stickyKey]);

  const current = queue[position];
  const currentItem = detail?.items.find(item => String(item.item_id) === String(current?.item_id));
  const doneCount = useMemo(() => allRefs.reduce((total, ref) => total + (saved.answers[ref.item_key] ? 1 : 0), 0), [allRefs, saved.answers]);
  const totalCount = catalog?.totals.questions || allRefs.length || 4800;
  const donePercent = totalCount ? Math.round(doneCount / totalCount * 100) : 0;

  useEffect(() => {
    setPosition(0);
    setStickyKey("");
  }, [bankFilter, partFilter, priorityFilter, statusFilter, priorityOrder]);

  useEffect(() => {
    if (position >= queue.length) setPosition(Math.max(0, queue.length - 1));
  }, [position, queue.length]);

  useEffect(() => {
    setShowTranscript(false);
    setShowTranslation(false);
    setShowAnalysis(false);
    setShowGroup(false);
    setRelatedAnalysis({});
    audio.current?.pause();
  }, [current?.item_key]);

  useEffect(() => {
    if (!current) {
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
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [current?.detail_path]);

  const go = (next: number) => {
    setStickyKey("");
    setPosition(Math.max(0, Math.min(queue.length - 1, next)));
    window.scrollTo({top: 0, behavior: "smooth"});
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag || "")) return;
      if (event.key === "ArrowRight") go(position + 1);
      if (event.key === "ArrowLeft") go(position - 1);
      if (event.key === " ") {
        event.preventDefault();
        if (audio.current) audio.current.paused ? audio.current.play() : audio.current.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [position, queue.length]);

  const choose = (item: Item, label: string) => {
    const key = item.item_key;
    const correct = label.toUpperCase() === String(item.answer || "").toUpperCase();
    if (key === current?.item_key) setStickyKey(key);
    setSaved(previous => ({
      ...previous,
      answers: {...previous.answers, [key]: label},
      wrong: correct ? previous.wrong.filter(value => value !== key) : [...new Set([...previous.wrong, key])],
    }));
  };
  const toggleStar = () => {
    if (!current) return;
    setStickyKey(current.item_key);
    setSaved(previous => ({
      ...previous,
      stars: previous.stars.includes(current.item_key)
        ? previous.stars.filter(value => value !== current.item_key)
        : [...previous.stars, current.item_key],
    }));
  };

  const context = detail?.context || {};
  const audioSrc = current ? assetUrl(current.bank_id, context.audio_path) : "";
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
  const isStarred = current ? saved.stars.includes(current.item_key) : false;

  if (!catalog && !loadError) return <main className="loading"><div className="loader"/>正在载入 24 套官方题库目录…</main>;

  return <main className="shell globalPractice">
    <header>
      <button className="menu" onClick={() => setSideOpen(value => !value)} aria-label="打开筛选器">☰</button>
      <div className="brand"><span className="mark">T</span><div><b>TOEIC SPRINT</b><small>24 套官方题库 · 优先级单题刷</small></div></div>
      <div className="headerProgress"><span>{doneCount} / {totalCount}</span><div><i style={{width: `${donePercent}%`}}/></div><b>{donePercent}%</b></div>
    </header>
    <div className="layout">
      <aside className={sideOpen ? "open" : ""}>
        <div className="asideTitle">训练筛选 <button onClick={() => setSideOpen(false)}>×</button></div>
        <label className="filterLabel" htmlFor="bank-filter">题库</label>
        <select id="bank-filter" className="bankSelect" value={bankFilter} onChange={event => setBankFilter(event.target.value)}>
          <option value="ALL">全部官方题库（{allRefs.length || totalCount} 题）</option>
          {catalog?.banks.map(bank => <option key={bank.bank_id} value={bank.bank_id}>Official {bank.volume} · Test {bank.test}</option>)}
        </select>

        <div className="filterLabel">Part</div>
        <div className="partFilters">
          <button className={partFilter === 0 ? "on" : ""} onClick={() => setPartFilter(0)}>全部</button>
          {Array.from({length: 7}, (_, index) => index + 1).map(part => <button key={part} className={partFilter === part ? "on" : ""} onClick={() => setPartFilter(part)}><b>{part}</b><small>{partCounts[part]}</small></button>)}
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
          {STATUS_OPTIONS.map(option => <button key={option.value} className={statusFilter === option.value ? "on" : ""} onClick={() => setStatusFilter(option.value)}>{option.label}</button>)}
        </div>
        <div className="priorityLegend"><p><b className="badge p1">P1</b> 高频核心 · 优先必刷</p><p><b className="badge p2">P2</b> 重点题型 · 稳定巩固</p><p><b className="badge p3">P3</b> 基础覆盖 · 查漏补缺</p></div>
        <div className="asideHint"><b>快捷键</b><p><kbd>←</kbd> <kbd>→</kbd> 切题</p><p><kbd>Space</kbd> 播放 / 暂停</p></div>
      </aside>

      <section className="content">
        {loadError && <div className="loadNotice">{loadError}</div>}
        <div className="topline globalTopline">
          <div><span className="eyebrow">PRIORITY DRILL · {bankFilter === "ALL" ? "ALL 24 TESTS" : current?.bank_title}</span><h1>{partFilter ? `Part ${partFilter} 专项训练` : "全题库优先级刷题"}</h1></div>
          <div className="topTools"><button className={priorityOrder ? "orderBtn on" : "orderBtn"} onClick={() => setPriorityOrder(value => !value)}>{priorityOrder ? "优先级顺序" : "官方顺序"}</button><div className="groupCount">{queue.length ? `${position + 1} / ${queue.length} 题` : "0 题"}</div></div>
        </div>

        {indexLoading ? <div className="detailLoading"><div className="loader"/>正在汇总 4,800 题的优先级索引…</div> : !current ? <div className="empty"><b>当前筛选下没有题目</b><p>可以切换优先级、Part 或完成状态继续训练。</p><button onClick={() => {setBankFilter("ALL"); setPartFilter(0); setPriorityFilter("P1"); setStatusFilter("ALL");}}>恢复 P1 必刷队列</button></div> : <>
          <div className="questionNav globalQuestionNav">
            <span>{current.bank_title} · Part {current.part}</span>
            <div className="miniProgress"><i style={{width: `${(position + 1) / queue.length * 100}%`}}/></div>
            <span>题 {current.item_id}</span>
            <button className={isStarred ? "starred" : ""} onClick={toggleStar} title={isStarred ? "取消收藏" : "收藏此题"}>{isStarred ? "★" : "☆"}</button>
          </div>
          <div className="priorityBrief compactPriority">
            <PriorityBadge value={current.priority}/>
            <div><b>{current.question_type || current.priority.label || current.unit_title || "重点题型训练"}</b>{current.priority.reason && <p>{current.priority.reason}</p>}{Boolean(current.priority.focus_tags?.length) && <div>{current.priority.focus_tags?.map(tag => <span key={tag}>{tag}</span>)}</div>}</div>
          </div>

          {detailLoading && <div className="detailLoading"><div className="loader"/>正在按需载入当前题目…</div>}
          {detailError && <div className="empty compactEmpty"><b>题目载入失败</b><p>{detailError}</p></div>}
          {detail && currentItem && <article>
            {current.part <= 4 && audioSrc && <AudioBar audio={audio} src={audioSrc} canShowTranscript={Boolean(transcript)} showTranscript={showTranscript} toggleTranscript={() => setShowTranscript(value => !value)} showAnalysis={showAnalysis} toggleAnalysis={() => setShowAnalysis(value => !value)}/>}
            {current.part <= 4 && !audioSrc && <div className="materialActions"><button className="analysisBtn" onClick={() => setShowAnalysis(value => !value)}>{showAnalysis ? "隐藏解析" : "查看解析"}</button>{transcript && <button className="translateBtn" onClick={() => setShowTranscript(value => !value)}>{showTranscript ? "隐藏原文" : "查看原文"}</button>}</div>}

            {current.part === 1 && <div className={showTranscript ? "part1Material withTranscript" : "part1Material"}>
              {pictures.length > 0 && <PictureGrid bankId={current.bank_id} pictures={pictures} part={current.part}/>}
              {showTranscript && transcript && <Transcript text={transcript} translation={transcriptTranslation} showTranslation={showTranslation} toggleTranslation={() => setShowTranslation(value => !value)}/>}
            </div>}
            {current.part >= 2 && current.part <= 4 && <>
              {pictures.length > 0 && <PictureGrid bankId={current.bank_id} pictures={pictures} part={current.part}/>}
              {showTranscript && transcript && <Transcript text={transcript} translation={transcriptTranslation} showTranslation={showTranslation} toggleTranslation={() => setShowTranslation(value => !value)}/>}
            </>}
            {current.part >= 5 && passage && <div className={current.part === 6 ? "passage cloze" : "passage"}>{current.part === 6 ? markCloze(passage) : passage}</div>}
            {current.part >= 5 && <div className="actionRow readingActions">
              {passageTranslation && <button className="translateBtn" onClick={() => setShowTranslation(value => !value)}>{showTranslation ? "隐藏中文" : "翻译原文"}</button>}
              <button className="analysisBtn" onClick={() => setShowAnalysis(value => !value)}>{showAnalysis ? "隐藏解析" : "查看解析"}</button>
            </div>}
            {current.part >= 5 && showTranslation && passageTranslation && <div className="translation">{passageTranslation}</div>}

            <QuestionBlock key={currentItem.item_key} item={currentItem} part={current.part} chosen={saved.answers[currentItem.item_key]} reveal={showAnalysis} choose={choose}/>

            {[3, 4, 6, 7].includes(current.part) && detail.items.length > 1 && <section className="relatedGroup">
              <button className="groupToggle" onClick={() => setShowGroup(value => !value)}>{showGroup ? "收起同组题目" : `展开同组另外 ${detail.items.length - 1} 题`}</button>
              {showGroup && <div className="relatedList">{detail.items.filter(item => item.item_key !== currentItem.item_key).map(item => <div className="relatedQuestion" key={item.item_key}>
                <div className="relatedHeading"><span>同组题 {item.item_id}</span><PriorityBadge value={item.priority}/><button onClick={() => setRelatedAnalysis(previous => ({...previous, [item.item_key]: !previous[item.item_key]}))}>{relatedAnalysis[item.item_key] ? "隐藏解析" : "查看解析"}</button></div>
                <QuestionBlock item={item} part={current.part} chosen={saved.answers[item.item_key]} reveal={Boolean(relatedAnalysis[item.item_key])} choose={choose}/>
              </div>)}</div>}
            </section>}
          </article>}
          <div className="bottom"><button disabled={position === 0} onClick={() => go(position - 1)}>← 上一题</button><button disabled={position >= queue.length - 1} onClick={() => go(position + 1)}>下一题 →</button></div>
        </>}
      </section>
    </div>
  </main>;
}

function AudioBar({audio, src, canShowTranscript, showTranscript, toggleTranscript, showAnalysis, toggleAnalysis}: {audio: RefObject<HTMLAudioElement | null>; src: string; canShowTranscript: boolean; showTranscript: boolean; toggleTranscript: () => void; showAnalysis: boolean; toggleAnalysis: () => void}) {
  return <div className="audio"><button className="playBtn" onClick={() => audio.current && (audio.current.paused ? audio.current.play() : audio.current.pause())}>▶</button><div className="audioLabel"><b>听力音频</b><small>空格键暂停 / 继续</small></div><audio ref={audio} controls src={src}/><div className="audioActions">{canShowTranscript && <button className="translateBtn" onClick={toggleTranscript}>{showTranscript ? "隐藏原文" : "查看原文"}</button>}<button className="analysisBtn" onClick={toggleAnalysis}>{showAnalysis ? "隐藏解析" : "查看解析"}</button></div></div>;
}

function PictureGrid({bankId, pictures, part}: {bankId: string; pictures: MediaRef[]; part: number}) {
  return <div className="images">{pictures.map((picture, index) => <img key={`${picture.path}-${index}`} src={assetUrl(bankId, picture)} alt={part === 1 ? "照片描述题图片" : "听力题配套图表"}/>)}</div>;
}

function Transcript({text, translation, showTranslation, toggleTranslation}: {text: string; translation: string; showTranslation: boolean; toggleTranslation: () => void}) {
  return <div className="transcript listeningTranscript"><pre>{text}</pre>{translation && <button className="translateBtn" onClick={toggleTranslation}>{showTranslation ? "隐藏中文" : "翻译原文"}</button>}{showTranslation && translation && <div className="translation">{translation}</div>}</div>;
}

function QuestionBlock({item, part, chosen, reveal, choose}: {item: Item; part: number; chosen?: string; reveal: boolean; choose: (item: Item, label: string) => void}) {
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
      const state = reveal && correct ? "correct" : selected ? (correct ? "correct" : "incorrect") : "";
      return <button className={state} key={label} onClick={() => choose(item, label)} aria-label={hiddenText ? `选项 ${label}` : undefined}><span>{label}</span>{!hiddenText && <p>{choice}</p>}{state === "correct" && <b>✓</b>}{state === "incorrect" && <b>×</b>}</button>;
    })}</div>
    {reveal && <AnswerAnalysis item={item} part={part} chosen={chosen}/>}
  </div>;
}

function AnswerAnalysis({item, part, chosen}: {item: Item; part: number; chosen?: string}) {
  const correct = chosen && chosen.toUpperCase() === String(item.answer || "").toUpperCase();
  const hasKnowledge = Boolean(item.knowledge_accumulation?.vocabulary?.length || item.knowledge_accumulation?.collocations?.length);
  return <div className={`explain ${chosen ? (correct ? "good" : "bad") : "neutral"}`}>
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
