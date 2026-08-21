# Part 6 / Part 7 图像恢复与发布流程

## 目标与边界

Part 6、7 的原始材料包含邮件、表格、聊天、广告以及双/三篇关联文本。旧流程把整页双栏 OCR 当作一条文本流，容易产生三类致命错误：下一题题号进入当前题干、左右栏选项交叉、页码或导航文字进入文章。

新流程以原始扫描图为最终依据，OCR 只提供检索和文字辅助：

1. 用题号范围识别材料标题和真实题块，不相信文件列表顺序。
2. 从 TSV 坐标计算材料与题目边界；该边界只用于 OCR，网页始终发布完整原始页面，避免表格、续页或右栏被误裁。
3. 先用每个期望题号的最下方坐标定位真实题目区，再分别识别左栏、右栏和窄/宽边界候选，不再整页串行拼接。
4. 每题必须得到精确题号、完整题干和 A–D 四项；Part 6 保留四个空格的原始页面布局。
5. 自动结果不合格时整篇 fail closed：保留旧数据并写入报告，禁止部分写回。
6. 网页优先显示裁边后的原始材料版面并支持放大；OCR 文字版折叠为辅助内容。
7. 少数自动 OCR 仍不可靠的题块必须逐图核对，并写入 `scripts/reading-layout-overrides.mjs`；覆盖项必须保留源图路径，启动时会检查证据图是否存在。

这符合现行 TOEIC 结构：Part 6 每篇 4 题，空缺可能是词、短语或整句；Part 7 包括单篇及多篇材料。结构基线见 [IIBC 官方格式](https://www.iibc-global.org/english/toeic/test/lr/about/format.html)。版面识别采用“区域检测 + 阅读顺序恢复”的思路，参考 [PaddleOCR Layout Analysis](https://www.paddleocr.ai/main/en/version3.x/module_usage/layout_analysis.html)；区域 OCR 的页面分割选择参考 [Tesseract ImproveQuality](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)。这些资料只用于校准方法，不用于猜测或补写试题内容。

## 输入来源

本地原始题库备份如果不存在，可从保留扫描图的历史提交建立只读 worktree：

```bash
git worktree add --detach /private/tmp/toeic-reading-scans aac088a0
```

扫描图根目录随后为：

```text
/private/tmp/toeic-reading-scans/public/assets
```

该目录应包含 `official-1-test-1` 至 `official-12-test-2`，每套下有 `images/part6`、`images/part7`。

## 只读验收

先运行只读模式；默认不会改 `public/data` 或 `public/assets`：

```bash
npm run recover:reading -- \
  --scan-root /private/tmp/toeic-reading-scans/public/assets \
  --report outputs/reading-layout-ocr-report.json
```

可限定题库或单篇调试：

```bash
npm run recover:reading -- \
  --scan-root /private/tmp/toeic-reading-scans/public/assets \
  --bank official-1-test-1 \
  --unit p7-176-180
```

报告中的 `ready` 必须等于 `processed`，`failed` 必须为 0。每篇保留：

- 实际参与的材料图与相邻题目候选图；
- 识别出的题号；
- 失败原因和失败时的 OCR 调试文本；
- 写回后的 OCR schema、引擎、源文件 hash 和已验证题号。

OCR 中间结果缓存在被 Git 忽略的 `outputs/reading-ocr-cache/`，缓存键包含图片字节、PSM 和输出格式。规则调整后可以快速重跑；源图发生变化时不会误用旧缓存。

## 写回与构建

只在只读验收全绿后写回：

```bash
npm run recover:reading -- \
  --scan-root /private/tmp/toeic-reading-scans/public/assets \
  --write \
  --report outputs/reading-layout-ocr-report.json

npm run build:assets
npm run build:pages
npm test
```

写回动作是篇级原子操作：先在内存中完成 OCR 和校验，再同时更新该篇 detail、bank index 与裁边图片。英文源发生变化时，旧翻译、旧证据、旧解析和旧知识卡会被失效，避免“新英文 + 旧解释”混合发布。

`build-web-assets.mjs` 会保留 index 已引用的 `reading-layout/` 产物；缺图会直接失败。

## 自动门禁

Part 6：

- 一篇必须 4 题，每题 A–D 四项；
- 原始版面图必须存在；
- 小号空格题号可能被 OCR 漏掉，但不得猜补正文，网页以原图为准；
- 文章不得含 `PART 6`、`TEST n`、翻页提示或页码。
- 句子填入题的四个长选项都必须以完整句末标点结束；截断任一项即失败；
- 选项不得夹带下一题号、另一组选项标记、孤立页码、版面符号或已知粘连词；
- 图像复核覆盖表中的每项必须有 A–D 四项和实际存在的证据图。

Part 7：

- 一篇的 expected IDs 必须全部出现且不重复；
- 一般题干必须包含问号；`closest in meaning to` 等官方句式单独允许；
- 句子插入题允许问号后继续保留待插入句；
- 当前题干不得混入同篇其他题号；
- 每题必须恰好四个非空选项；
- 选项中的明显 OCR 符号或版面残片会阻断写回；
- 文件名和页序不是证据：相邻页面也会扫描，因为部分书籍把前一篇的问题排在下一组图片的第一页。

## 人工抽检

自动全绿后仍做分层抽检：每个 Official / Test 至少检查 1 篇 Part 6、1 篇单文本 Part 7、1 篇双/三文本 Part 7。重点核对：

- 页面左上题号范围与网页题号一致；
- Part 6 四个空格及题号位置一致；
- 表格列、邮件头、聊天说话人、段落空行没有被重排；
- 第一题和最后一题都没有截断；
- A–D 选项没有跨栏；
- 放大图在桌面和手机端均可阅读。

未经本地预览确认，不推送 `main` 或 `gh-pages`。

## 本轮验收基线

- 24 套题库；Part 6 共 96 篇、Part 7 共 360 篇；合计 456 篇。
- 最新算法只读复验：456 ready / 0 failed。
- 网页材料版面产物 592 张；多材料题会完整保留全部相关原页。
- 网页图片必须保留原始扫描页 100% 宽高，不再把 OCR 推断边界用于用户可见截图。续页和右栏因此不会被裁掉。
- 每张发布图保存 `source_width`、`source_height`、完整页 `crop` 和独立的 `ocr_crop` 坐标；自动测试会拒绝任何不是完整原页的可见图片，同时要求 OCR 区域至少覆盖 90% 页宽。
- 每篇发布图、题号、A–D 选项和 index 引用由 `tests/rendered-html.test.mjs` 交叉检查。
- 桌面端默认左侧显示可缩放的原始版面、右侧显示整篇题目；中间分隔条可拖动。移动端自动改为上下布局。
