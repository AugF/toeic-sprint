# 阅读辅助内容的受控恢复

本次审计发现 `recover-reading-layout.mjs` 在每次 OCR 成功后都会无条件删除正文翻译。题干或选项只要发生字符变化，也会删除题干翻译、选项翻译和解析，后续没有补齐步骤。旧 `enrich-banks-compact.mjs` 还曾用英文夹中文词义注释充当整段翻译，用套话充当解析，因此“字段非空”不等于内容可用。

## 恢复范围与依据

`scripts/restore-reading-study-aids.mjs --write` 仅处理 Part 6、Part 7。候选来源为本地 Git 中的 `aac088a0`，按 bank、unit、item ID 定位，不按数组位置猜测题目。该历史版本也是 OCR 派生数据，不能整份回滚。

- 题干翻译：原英文题干完全匹配才可恢复。
- 选项翻译：该索引的英文选项完全匹配才可恢复；缺失位置保留空字符串，禁止压缩数组造成 A/B/C/D 错位。
- 原文翻译：全文完全匹配才可恢复。
- 解析：全文、题干、全部有序选项和答案都匹配，且解析具体有效，才可恢复。
- 匹配只统一 Unicode、弯引号和空白，不删除词语、数字或使用相似度放行。
- 拒绝 OCR 不清提示、英文夹中文注释、空泛解析套话以及与答案标签冲突的解析。
- 旧原文定位须同时能在现有正文中找到，并与具体解析有可核对的英文短语联系。无法证明的定位不显示；旧段号/句号不沿用。

未补齐的字段通过 `study_aid_status` 标记 `pending`。选项翻译还支持 `partial`；没有题干的 Part 6 标记 `question_translation: not_applicable`。这些状态表示真实缺口，不是生成了新的译文或完整解析。

首次恢复了 155 条题干翻译、841 条选项翻译、1 篇全文翻译。没有历史解析能同时满足全部匹配和质量条件；已有的 53 条具体解析保留。其余内容需要重新核对原始扫描并生成，不能把本轮报告当作“全题库翻译和解析已完成”。可用 `node scripts/restore-reading-study-aids.mjs --baseline-ref a4bcb11c` 只读复算本轮修改前的恢复计数；结果在 `outputs/reading-study-aid-recovery-baseline.json`。最近一次实际写入结果在 `outputs/reading-study-aid-recovery-report.json`。

## 后续 OCR 与校验

`scripts/reading-study-aids.mjs` 统一管理依赖失效。重复 OCR 或仅换行、空白变化不会清空已有辅助内容。正文变化会使正文翻译和依赖正文的解析失效，但保留未改变的题干、选项翻译；选项变更仅清除发生变化的索引译文，同时使解析失效。

运行 `node --test tests/reading-study-aids.test.mjs` 验证重复运行、正文改变、选项重排、字段独立恢复、错误模板拒绝和错误定位剔除。恢复命令不带 `--write` 时只检查，将结果写到独立的 `outputs/reading-study-aid-recovery-check.json`，不会覆盖首次写入报告。

请勿直接重新运行 `build-multi-bank.mjs` 覆盖已修复的发布数据；该脚本仍会从旧 `question.enriched.json` 重新构建。新的生成流程必须把已验证的字段及其来源同步为权威输入，或在构建后执行有版本约束的恢复步骤，并核对 `study_aid_status`，不能以“有值”作为发布门槛。
