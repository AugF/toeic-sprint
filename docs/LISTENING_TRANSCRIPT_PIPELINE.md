# Part 1–4 听力原文 Pipeline

## 问题与原则

旧题库把答案册或扫描页 OCR 文字直接当作听力原文，页眉、圈号、栏线和相邻题号会混入网页。Part 1–2 甚至可能把被 OCR 截断的选项当作录音内容。新流程把对应 MP3 作为唯一内容依据，OCR 只参与覆盖率审计，绝不直接写回原文。

现行 TOEIC 结构以官方说明为基线：Part 1 每题四个照片描述；Part 2 每题一个问题或陈述加三个回答；Part 3 每段对话对应三题；Part 4 每段独白对应三题。参考 [IIBC 官方考试格式](https://www.iibc-global.org/english/toeic/test/lr/about/format.html) 和 [ETS TOEIC Listening and Reading Tests](https://www.ets.org/toeic/test-takers/about/listening-reading.html)。语音识别采用 Whisper；其鲁棒语音识别方法参考 [OpenAI Whisper 论文](https://arxiv.org/abs/2212.04356)。互联网资料只用于确认考试结构与转写方法，不用于补写或猜测具体试题。

## 可复现流程

1. 从 `public/data/banks/*/units/*.json` 找出 Part 1–4 的 1,296 个训练单元。
2. 根据 `context.audio_path.asset_key` 找到发布层同一题的 MP3，并计算音频 SHA-256。
3. 使用 `whisper.cpp` 的 `large-v3-turbo-q5_0` 英文模型转写；缓存键包含模型与音频 SHA，任务中断后可继续。
4. 按正式录音结构解析：
   - Part 1 必须得到 A–D 四句；
   - Part 2 得到问题/陈述与 A–C；若录音含 `Number N`，必须与文件题号一致。允许切片恰好漏掉题号，但不允许听到其他题号；
   - Part 3/4 必须锚定与题组一致的 `N through M` 和 `refer to the following ...` 引导语，兼容 conversation、talk、instructions、broadcast 等官方材料类型及少量 ASR 标点偏差；发布时去掉引导语，只保留材料正文。
5. 拒绝导航语、下一题、`BLANK_AUDIO`、OCR 装饰字符、缺项、静音重复和明显截断。重复检测覆盖单词连发以及 2–6 词短语的周期循环，避免 `don't you`、`two weeks` 一类 Whisper 静音幻觉伪装成长正文。长材料只有在能可靠找到第一道题题干边界时才与旧 OCR 的正文区比较；否则跳过 OCR 比较，改用音频时长与正文词数（语速覆盖率）判断完整性。OCR 永不拼回新文本。
6. 每篇成功写入 `context.transcript_source`，记录 schema、模型、音频 hash、模型 hash 和质量指标。源英文变化时删除旧翻译，避免“新英文 + 旧中文”混用；中文必须在后续独立翻译门禁通过后再恢复。
7. 1,296 个单元全部通过 `--check` 是必要的结构门禁，但不是逐句完整性的证明。还需执行下方音频完整性审计，对风险项独立分窗复核，不能把“无异常符号”当成“没有漏句”。
8. 英文通过后，再由本地模型翻译；Part 1/2 严格保持四行及 A–D/A–C 标签，Part 3/4 允许中文自然合并相邻英文句子，但仍检查非空、异常字符和中文覆盖率。中文结果绑定英文 SHA-256，英文一旦变化就自动失效。`--check` 不只核对字段和 SHA，还会重新执行内容门禁；仅复制英文、中文覆盖率不足或标签错位的历史值一律视为待处理，防止“有翻译字段但页面仍显示英文”的假通过。
9. Part 3/4 的展示断句由确定性后处理生成，并保护 `a.m.`、`p.m.`、`Mr.`、`Ms.`、`Dr.`、`St.` 等常见缩写，避免把一个时间或称谓拆成两行。流程还会移除因 ASR 标点误判而单独残留的 `and chart.` / `and schedule.` 等图表引导片段，并修复 `www. example. com` 形式的域名空格。网页端把 Part 3/4 按连续段落显示，Part 1/2 仍保留题目与选项逐行结构。后处理版本写入 `context.transcript_source.postprocess_version`；规则升级后用 `--reformat` 迁移现有数据，发生变化的英文会主动清除旧翻译，再由翻译步骤按新 SHA 补齐。
10. 听力题面另设独立门禁：Part 1/2 的题干和选项直接由已通过音频门禁的原文重建；Part 3/4 先确定性修复孤立符号、尾随相邻题号、`Aregional` / `Ata hotel` 等粘连，再仅对串入邻题或被截断的少数项使用本地模型校对。模型输入包含已校验原文和中文辅助，但答案字母、选项顺序及数量固定不变。每组写入 `context.item_text_source`，发布前必须全库通过题面检查。

## 命令

只审计现有网页数据：

```bash
node scripts/rebuild-listening-transcripts.mjs
```

音频转写并原子写回（模型保存在 git 忽略目录）：

```bash
node scripts/rebuild-listening-transcripts.mjs \
  --model outputs/models/ggml-large-v3-turbo-q5_0.bin \
  --concurrency 2 --threads 5 --write
```

Apple Silicon 上可使用持久化 MLX worker；模型只加载一次，输出仍经过完全相同的结构与截断门禁：

```bash
node scripts/rebuild-listening-transcripts.mjs \
  --engine mlx \
  --python outputs/mlx-venv/bin/python \
  --model outputs/models/mlx-large-v3-turbo-4bit \
  --retry-mode none --write
```

主批次结束后，只对未通过单元启用提示与重叠分段回退：

```bash
node scripts/rebuild-listening-transcripts.mjs \
  --engine mlx --python outputs/mlx-venv/bin/python \
  --model outputs/models/mlx-large-v3-turbo-4bit \
  --pending-only --retry-mode all --write
```

若整段音频因低码率或削波只识别出开头、结尾，则按停顿点划分为重叠时间窗口，分别转写后去除交叠重复；每个窗口必须能独立回听核对，最终正文仍要通过题号、语速、重复和截断门禁。修复来源标记为 `segmented_audio`，不得把题目答案直接拼成原文。

只升级已通过原文的确定性断句格式（不重新跑语音识别）：

```bash
node scripts/rebuild-listening-transcripts.mjs --reformat --write
```

发布前硬门禁：

```bash
node scripts/rebuild-listening-transcripts.mjs --check
```

生成并校验与当前英文同源的中文译文：

```bash
node scripts/translate-listening-transcripts-ollama.mjs \
  --generate --model gemma4:latest \
  --batch-units 4 --batch-chars 4000 --concurrency 4
node scripts/translate-listening-transcripts-ollama.mjs --check
```

如果英文变化仅来自上述确定性展示清理，并且上一版本地构建仍保存着已校验译文，可以执行严格迁移。脚本只有在“旧英文经过当前 `sentenceLines()` 后与新英文逐字一致”时才复用译文；若删除的是独立图表引导首行，会同步删除中文首行并更新英文 SHA。任何额外内容差异都会拒绝迁移：

```bash
node scripts/migrate-listening-translation-cleanup.mjs
node scripts/translate-listening-transcripts-ollama.mjs --check
```

重建并校验听力题干、选项（先执行确定性步骤，再修复剩余异常项）：

```bash
node scripts/repair-listening-items-ollama.mjs --write
node scripts/repair-listening-items-ollama.mjs \
  --generate --model gemma4:latest --batch-units 1 --concurrency 4
node scripts/repair-listening-items-ollama.mjs --check
```

对于把结构化内容返回到 `thinking` 而非 `response` 的推理模型，翻译脚本兼容两个字段；无论使用哪个字段，仍须经过相同的 JSON、中文覆盖率、行数和选项标签门禁。批次失败会自动二分重试，已成功单元按英文 SHA 跳过，因此可安全中断续跑。

## 人工复核

自动转写失败项会列出 bank、unit 和失败原因，不会写入猜测文本。常见失败包括低码率下的专有名词、录音窗口只输出后半段、题号未识别或选项标签缺失。处理时应回听对应 MP3；公开网页或搜索结果可以协助确认通用公司/地点拼写，但必须与录音一致，且不得用第三方答案页面替代音频证据。

## 2026-09-24：漏句专项复核

### 根因与实际范围

本次对 1,296 个单元逐一验证发布音频 SHA，并对照同音频、同模型缓存的原始识别内容。发现 24 个明显低词速片段，另有 2 个因重复文本或只漏中间一句而未触发词速阈值的片段，全部位于 Part 4。旧的结构校验没有发现这些问题：文本虽然有完整句子，却常常只剩录音后半段。

独立分窗识别进一步确认：部分音频第一窗识别出了 `Questions ... refer to ...` 后便停止输出，而下一窗从第 21 秒开始，造成中间十多秒的正文缺失。没有把模型缓存中的较长结果直接当成事实，而是用不带 OCR 提示的 20 秒音频窗、15 秒步长重新识别；对引导语吞掉正文的情况，从第 5 或 6 秒再次独立识别，并逐句核对重叠区。

已补回 26 段原文并完整重译中文，净增约 1,135 个英文单词；另修复 13 处残留的 `and list of classes.`、`information and map.` 等引导片段。Part 1–3 本轮全量风险审计未定位到同类确定漏段，不代表已逐句人工回听全部录音。Official 10 Test 2 第 98–100 题中的人名 So-hyun 仍有拼写不确定性，已在复核来源中留注；没有拿第三方答案猜补。

### 可复核命令与证据

```bash
# 只读：比较逐词顺序、开头/结尾、替代转写与音频时长
npm run audit:listening-completeness

# 只修复精确匹配的中英文引导残片，默认只报告
node scripts/repair-listening-intro-fragments.mjs

# 应用人工审核过的英文及中文；整批 preflight 通过后才写
node scripts/apply-listening-completeness-review.mjs \
  --manifest outputs/listening-completeness-reviewed.json --write

node scripts/translate-listening-transcripts-ollama.mjs --check
node scripts/rebuild-listening-transcripts.mjs --check
node scripts/sync-reviewed-data-index.mjs
npm test
npm run build:pages
```

本地证据保存在 `outputs/listening-completeness-asr-samples.json`（独立音频窗及识别时间戳）、`listening-completeness-fixes.json`（复核候选）、`listening-completeness-zh-a.json` / `-zh-b.json`（完整人工中文）和 `listening-completeness-reviewed.json`（可应用 manifest）。`prepare-listening-completeness-review.mjs` 可合并这三份审阅结果，再调用同一应用器。`outputs/` 不上传，发布 JSON 只保存源音频 hash、旧/新文本 hash、复核区间和方法，不复制音频或原始 ASR 缓存。

应用器校验题库/单元身份、真实音频 hash、旧英文 hash 和完整中译；任一项不符，整批不写。已复核英文不能被普通 ASR 重建静默覆盖；需要新的复核 manifest。旧字数统计移入复核历史，新统计重新计算。英文改变必须同步更新中文及来源，英文未变时重建不再无条件删除中文。

后续分窗流程升级为 `intro_aware_windows_v3`：保存每窗 raw 和时间戳，从识别出的引导结束时间另开一窗，旧的 0/21/42 秒缓存不得直接复用。解析层同时修复 Part 1 最后一个选项仅保留第一句的潜在风险，以及 Part 3/4 用贪婪正则吞掉开场白的风险。识别材料名采用明确名单，未知引导语报错而不是猜测截断位置。

低词速、跨转写差异和测试通过都只是风险信号或结构保证。仍须关注正常词速中的漏句、片段重复、姓名与数字，不得宣称全库已经逐字无误。变更后先本地 review，由用户确认再发布。
