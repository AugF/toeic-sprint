# Part 5 原题、翻译和解析恢复流程

## 本次发现

2026-09-24 对 24 套题库的 720 道 Part 5 逐题结构审计，并检查了各套中明显异常的英语内容。旧数据存在以下不同问题，不能仅靠清除特殊字符解决：

- 填空横线被识别成单横线、点号、下划线，或完全缺失。
- 双栏页面中，下一题的题号及半句混进当前题干。
- 句首、句尾或选项被截断；部分字段已串入另一题。
- 旧“翻译”直接保留英语或填空；旧“解析”套用通用模板，未解释本题。

第一轮安全写回覆盖 201 道题，仅规范已存在的空格/填空符号、移除明确的页眉和相邻题号，或依据精确匹配的外部引用修复。218 道题被标记为仍需原图核对；这些题的问题数有重叠。后续人工校订脚本可能进一步减少待核对数量，应以当前 JSON 和最新审计报告为准。**未命中规则不等于已与原书逐字验证。**

当前工作区没有 `toeic_listening_reading_banks` 原始备份，且 Git 最早题库提交、`aac088a0` 和当前分支都没有 Part 5 扫描页。恢复 Part 6/7 所用的历史图不能代替 Part 5 原图。因此本轮没有生成或伪装任何“原始图片”。

## 可确定修正的证据

Official 1 Test 1 第 101 题的 `ager` 修复为 `agenda`。金泽大学学术资料中的例 (14a)、`RD1_101` 与本地题干及四选项一致，支持该单词修正：[穴埋め問題の文法論](https://kanazawa-u.repo.nii.ac.jp/record/2002264/files/2436-3464-28-1-37.pdf)。网址、例号、原始 OCR 和新文本校验值均记录在该题 `content_review` 中。

其他严重缺句不根据正确选项反向编造，不用模型把错句润色成另一道题。尤其是 Official 7 Test 2 第 113 题、Official 5 Test 2 第 121 题等，需要先取得原扫描页。

## 数据契约

- `content_review.original_question`、`original_choices`：首次修改前的原始 OCR；重复运行不覆盖。
- `content_review.text_sha256`：当前题干和四选项的摘要。
- `content_review_status: "source_required"`：题干/选项还不能可靠还原。
- `content_review_issues`：缺空、截断、跨栏、异常字符等具体原因。
- `study_aid_status.question_translation / choice_translations / analysis`：分别为 `pending`、`ready` 或 `partial`，禁止一个字段的通过状态替代另外两个。
- `source_images`：原图恢复后写入与网页现有图片一致的引用：`path: "part5-source/q101.jpg"`（银行内相对路径）、`asset_key: "official-1-test-1/part5-source/q101.jpg"`、`exists: true`，并记录显示尺寸、原始尺寸和裁剪坐标。不能在 path 中再次加 `assets/<bank>`，否则网页会生成重复路径。
- `prefer_source_image: true`：内容尚不可靠时默认直接展示已核对的原图。
- `content_review_status: "source_image_available"`：已有原图兜底，但 OCR 仍待校订；这不表示翻译/解析可恢复为 ready。

待校对只改变状态，保留旧字段以便追踪。网页不应把待校对内容当作已完成翻译或可信解析呈现。答案字母和选项顺序保持不变；仅规范格式不能证明答案字母正确。

## 运行步骤

1. `node scripts/recover-part5-source.mjs` 先生成只读审计报告。
2. 审阅 `outputs/part5-source-recovery-report.json`。报告包含每道异常题、原因和源图是否存在。
3. `node scripts/recover-part5-source.mjs --write` 应用可确定的安全规则和待校对状态。
4. 运行人工复核的翻译/解析脚本，再做完整页面检查。人工内容必须以修正后的题干和正确答案组成完整句子，中文中将对应答案加粗。

不要在已经有人工复核内容时盲目重跑源数据导入，覆盖 `source_images`、状态和人工结果。今后生成新题库时，构建过程必须保留这些字段，并将网页需要的 `part5-source` 图片纳入发布清单。待原图完整恢复后，才能把缺图计数作为发布前零缺失门禁；在此之前应明确报告缺口。

## 取得原图后的定位与裁图

原始页可以包含多道题。先按银行/套题定位，再用印刷题号和 A–D 四个选项核对，不能只相信图片文件名或页序。

1. 对原页按左右栏分别 OCR，获取题号的坐标，确定当前题号到本栏下一题号之间的候选框。
2. 逐框检查：题号、完整题干、A–D 四项全部可见，且没有相邻题的句子。跨页或无法确认边界时保留完整原页，先不裁切。
3. 在源图 manifest 中记录已复核映射、源图 SHA-256 和像素裁剪框。`reviewed: true` 是人工已看过原图的记录，不得由 OCR 自动置真。
4. 运行下面的命令发布原图引用；省略 `crop` 可发布完整页。保留源图分辨率，JPEG 使用高质量编码。

```bash
node scripts/recover-part5-source.mjs \
  --scan-root /absolute/path/to/restored-scans \
  --source-manifest /absolute/path/to/reviewed-part5-sources.json \
  --write
```

Manifest 格式如下，SHA-256 必须来自真实文件：

```json
{
  "items": [
    {
      "bank_id": "official-1-test-1",
      "item_id": 101,
      "source": "official_1/test_1/reading-page.jpg",
      "sha256": "<真实文件的SHA-256>",
      "reviewed": true,
      "crop": {"x": 80, "y": 320, "width": 880, "height": 430}
    }
  ]
}
```

脚本拒绝重复题号映射、路径越界、缺失源图、哈希不一致和越出图像边界的裁剪框。发布路径为 `public/assets/<bank>/part5-source/q<id>.jpg`，并同步登记 bank index 当前 unit 的 `asset_refs`；已有原图也不自动证明 OCR 或解析正确。

## 验收

`node --test tests/part5-source.test.mjs` 覆盖填空规范化、连字符保留、不补造缺句、跨题污染识别、参考证据记录、源图映射门禁和重复运行一致性。

页面验收应检查：有问题的题默认显示已核对的原图、图片可以放大、图片中的题号与当前题一致、选项顺序和字母未变化、中文是代入答案后的完整句子、待复核内容没有冒充正确解析。没有原图的严重坏题只能明确显示待恢复状态，不能将“字符清洁”当成“题目完整”。

## 后续批次：143 题人工复核与默认套题恢复

2026-09-24 本轮覆盖 7 套题库的 143 题：Official 1 Test 1 新增14题、Official 1 Test 2 11题、Official 2 Test 1 23题、Official 2 Test 2 15题、Official 11 Test 1 30题、Official 11 Test 2 22题、Official 12 Test 2 28题。加上上一批保留的16题，当前159道 Part 5 已有完整句子中译、具体解析和四项释义；没有把其余题一并标记为完成。

### 默认题库的14处恢复

修复题号为102、105、117、118、120–128、130。恢复遗漏的填空位置、need to、should、句末地名/时间等，移除跨栏混入的 `ting.`、`this year`、`should`、`in Seoul`；117仅清理选项B/C/D的乱码后缀。答案字母不变。默认 Official 1 Test 1 的30题至此均有完整文字和复核辅助内容。

证据是[无批注练习文本](https://qa5.3study.com/RES/Files/3c0648e0-ff88-4b3d-ae03-9aa9db4671bb.pdf)第1–4页、[教师批注版本](https://qa5.3study.com/RES/Files/041e4095-b458-4644-a742-70344379baa8.pdf)及逐题其他交叉引用。它们是重新排版的参考资料，**不是已取得的原书截图**，本轮网页没有把这些页面标作“原始图片”。PDF截图/下载未成功时只用可核对文字，明确记录未完成图像核验；Gauth取得的头像图已排除，绝不拿文件名或页面缩略图充当试题图。

参考资料也可能有差异：126题保留当前题干的 `at Bescura Cars`，不照搬重排版中的 `of`；根据[语言学校对此题的讲解](https://www.language-center.com.tw/toeic/exam/skill-1.html)及其他匹配文本，仅恢复 `has` 和 `younger`。所有证据URL、题号/页码、旧题干及四选项都固化在 `scripts/reviews/part5-official1-test1-restored-reviewed.json`，本地详细取证报告在 `outputs/part5-default-evidence.json`。

### 写回与保护

`scripts/reviews/part5-*-reviewed.json` 保存人工审阅结果；`apply-part5-reviewed-aids.mjs` 在写入前对整批执行如下校验：

1. 当前题库/题号、完整旧题干、有序四选项和答案必须与记录精确匹配；任何不符整批不写。
2. 残缺题不能仅靠翻译被标为完成；只有带明确审阅记录、来源URL和定位的文字恢复记录才能解除待核对状态。
3. 8道 Official 2 题目只删除单个已核对的栏间孤立数字；校验不允许同时增删任何其他英文单词。
4. 中译必须填入正确选项后翻译整句，并用 `**` 标记答案所对应的中文部分；不能把整个修饰短语都当作答案加粗。解析说明具体词性、语法或词义，四项中文释义不得缺项或换序。
5. 删除旧的伪“原文定位”和通用策略，记录题干/选项/答案哈希。OCR流程及上一版46题脚本重跑时，必须保护仍与该哈希匹配的新人工结果，不能反复覆盖。
6. 另一位复核者交叉检查语义。本轮修正了“维持低成本”被误译为“降低成本”、`were followed by` 被强化为因果关系等细节。

```bash
node scripts/apply-part5-reviewed-aids.mjs          # preflight / dry run
node scripts/apply-part5-reviewed-aids.mjs --write  # exact reviewed inputs only
node scripts/recover-part5-source.mjs              # read-only updated gap report
node scripts/sync-reviewed-data-index.mjs
node --test tests/part5-review-batch.test.mjs tests/part5-reviewed-aids.test.mjs tests/part5-source.test.mjs
npm test
npm run build:pages
```

本轮结束时，720题中仍有204题存在需原始材料核验的文本问题，561题的整句翻译/具体解析尚未完成。它们不能通过批量机器润色强行变成“ready”；先取得可信文本或正确原图再处理。正式发布仍需用户先本地 review。

## 后续批次：自然留空与整句完整性复查

2026-09-24 继续处理：Part5 页面不再直接显示连续横线，而在渲染层把 `[-_—]{2,}` 标记变成固定 `4ch` 的无边框留白，并提供“填空”的无障碍标签。数据保留原始标记，不使用会被 HTML 合并、丢失填空位置的普通单个空格，也不修改正常单词中的连字符。其他 Part 的文本、选项、手动查看答案及清空逻辑不变。

### 内容结果

- 新修复42题：Official1 Test2的19题、Official2 Test1的7题、Official2 Test2的15题，以及Official8 Test1的116题。
- Official1和Official2的两套题（共120题）均有完整题干、填入答案后的中译、具体考点解析和四选项释义。本轮之后共有201题的完整中译和具体解析已就绪，其余519题仍待补齐，不用“英文可读”冒充中文完成。
- 全720题重新通读题干、有序选项及代入现有正确选项后的句子。当前557题完整可读、154题明确缺损、9题需进一步核实。可读不等于已对每题原书影像逐字验证，也不替代答案键权威校验。
- Official8 Test1第116题是本轮新发现的漏检：原句有句号，但 `should` 后漏掉 `cause`。匹配[讲解原句和四选项](https://makoomori.hatenablog.com/entry/2022/06/18/100421)及独立题号记录后恢复动词，保留答案 `minimal`，禁止为了让坏句勉强成立而改成另一个选项。

### 参考核对与来源边界

Official1 Test2使用[Test54参考文本](https://qa5.3study.com/RES/Files/b1a3c62e-d07c-459a-8a65-d796a13aa648.pdf)与[对应编号541–570的独立文本](https://pdfcoffee.com/1000-cau-giai-de-toeic-format-moi-2019-pdf-free.html)交叉核对。参考文本的教学批注不并入选项；Securitas保留与本地和独立来源一致的拼写，不照抄另一资料中的Securities。

按照PDF技能的视觉核验流程，Official2 Test1的[大学站点参考扫描](https://moodle.univ-lyon1.fr/pluginfile.php/2661369/mod_folder/content/0/TEST%201.pdf?forcedownload=1)已成功下载并渲染打印页42–44，逐栏检查题号、完整句子和四项选项；只在临时目录用于核验，没有把整份试卷重复放进网站资产。Official2 Test2对照[Test57文字版](https://qa5.3study.com/RES/Files/f22050b9-cffa-4cc7-b4ef-196525d1abf4.pdf)及[另一批注版本](https://qa5.3study.com/RES/Files/d6e91bec-d88d-4f8f-9569-8402b8357ead.pdf)。两者第125题专名存在Aeronamic/Aerodynamic差异，保持本地及第二参考支持的Aeronamic，不凭词形常见程度替换专名。

两批41题均经过第二位复核者的语言检查，8T1第116题由主流程核对两个精确来源。原题与原选项、改动和URL保存在三个 `*-restored-reviewed.json` 文件中。只用文字核验的题不标为原图已确认。

### 可重复执行的完整性门禁

`scripts/audit-part5-completeness.mjs` 默认只读，检查单个填空、句末截断、邻题号、选项污染、已知错接片段，以及代入答案后的明显语法破损。**有句号和四个选项不能直接判断通过**。

`scripts/reviews/part5-completeness-baseline.json` 只存本次实际通读的720个题号和精确输入hash，便于在没有ignored outputs的全新工作区复现结果。输入包含题干、有序选项与答案，任一改变都会使旧人工判断失效。新修复题依据自己的人工复核记录重新评估，仍需通过结构和已知语义缺损检查。

`--write` 只对人工确认、精确hash匹配的阻断记录设置待核实，不自动“修复”启发式命中的句子，更不改答案。第116题修复后不再命中旧坏句hash。

```bash
node scripts/apply-part5-reviewed-aids.mjs --write
node scripts/sync-reviewed-data-index.mjs
npm run audit:part5-completeness
npm test
npm run build:pages
```

验收包括全部720题填空渲染、Official1/2共120题完整辅助内容、缺失句中动词的回归、旧输入hash失效、批处理幂等。仍先给本地预览，不自动发布。

### 展示反馈：填空改为下划线

用户随后要求取消纯留白：当前 Part5 填空统一展示为固定 `4ch` 宽的连续下划线（CSS 底边），不再显示分段的 `-------`，也不只留空。仍只改变呈现，JSON 标记、来源指纹、题干、选项和答案保持不变；回归检查要求下划线底边存在，并继续覆盖全部720题。
