# TOEIC Sprint

一个面向 TOEIC Listening & Reading 的跨端刷题网站，收录 Official 1–12 的 Test 1 / Test 2，共 24 套、4,800 题。

## 功能

- 跨 24 套题库按 Part、P1/P2/P3、完成状态筛选，并实时显示全部、未做、已做、错题和收藏数量
- 默认以 P1（优先必刷）→ P2（重点巩固）→ P3（基础查漏）的单题队列训练
- 全部 4,800 题都有独立优先级、题型、重点标签和可解释定级理由
- Part 3、4、6、7 单题刷时仍保留共享音频或篇章，可按需展开同组题
- 听力音频、英文原文与中文翻译
- 选择后只标记对错，答案与解析由学习者主动展开
- 题型、原文定位、答题技巧和选项释义
- 从完整题目或整篇共享材料中提取可迁移的重点词与固定搭配；基础内容和低可信 OCR 不强行展示
- 答题进度保存在当前浏览器中
- 桌面与移动端响应式布局

## 本地运行

```bash
npm install
npm run prepare:banks
npm run dev
```

`prepare:banks` 只读取同级的 `toeic_listening_reading_banks` 本地原始题库，生成网站所需的最小 JSON、压缩音频和必要图片；不会修改原始 `question.json`，也不会复制 `qa` 等中间文件。

## 在线访问

<https://augf.github.io/toeic-sprint/>

站点的静态构建产物发布在 `gh-pages` 分支，供 GitHub Pages 直接托管。

## 优先级口径

定级综合参考 ETS/IIBC 官方考试结构、官方能力描述和现行重点形式，并结合高频考点、题型复现价值、认知难度和迁移价值。P1/P2/P3 是训练顺序，不是 ETS 官方难度或固定出题频率排名。
