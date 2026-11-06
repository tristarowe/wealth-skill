---
name: wealth-dashboard
description: Maintain the wealth-3-products daily per-10k income dashboard. Use when editing its layout, calendar, trend chart, data refresh, or PNG export. Do not use for unrelated web pages.
---

# 理财产品每日万收看板

静态单页看板（11 款理财产品每日万份收益），数据由 GitHub Actions 每日抓取。全部文案与口径使用中文，金额保留 2 位小数。

## 文件职责
- `index.html` — 结构、全部样式、导出 PNG 的内联脚本（html2canvas）
- `assets/dashboard.js` — IIFE 渲染：盈亏表、日历、趋势、来源卡片、产品多选，无构建步骤
- `assets/data.js` — 数据源，`window.REPORT_DATA = {asOf, products[]}`
- `daily/fetch_data.py` — 抓净值并重写 data.js；`daily/chinawealth_nv.py` — 抓取器；`daily/shot.py` — 定时截图
- `.github/workflows/daily.yml` — 每日 08:30 抓取、截图、提交、推送
- 依赖均为本地文件：`_shared/js/echarts.min.js`（SVG renderer）、`assets/html2canvas.min.js`

## 数据契约
`products[i] = {id, name, short, org, regCode, shareCode, inception, latestDate, officialAnnual, officialAsOf, dates[], nav[], per10k[], dailyAnn[]}`
- `per10k[0]` 为 null，其余由相邻 `nav` 差 ×10000 计算
- `dailyAnn` 在页面加载与手动更新时重算，不写回 data.js

## 渲染要点
- `selectedIds` 为顶部多选；`AGG` 是所选产品按日聚合，多选时表头与图例带「合计」
- 评分 `scoreFor` 使用近 30 日年化、同类均值、万收波动、前后 15 日趋势
- 日历由 `calState` 控制：年份下拉 + 月份左右箭头，边界取自 `AGG.dates` 首尾月份
- 手动更新按钮 `#refresh-data` 重新加载 data.js 后调用 `rebuildAll`，事件只在 init 绑定一次
- 趋势 `trendState.range/metric`：区间只显示日均万收/日均年化，不做区间累加
- 日历汇总只显示正收益/回撤/挂0 天数，不做月度合计

## 已确认的视觉约定
- hero 背景 `#F9FFFF`；模块标题 23px / 800 / `#B8860B`，编号与标题同字号
- 日历单元格统一 `#F8FFFF`（无色阶）；正红 `#b03123`、负绿 `#1a6b3c`、零/空 `#5d6b76`
- 星期表头蓝色加粗、14px，统一字重；日期与金额居中
- 当月最高万收在金额右侧加内联 SVG 金色大拇指，保证导出清晰
- 盈亏表今日万收列居中，最高/最低用对应拇指标记
- 产品名称最多两行；搜索只匹配产品名称；导出按钮与数据更新按钮并排于 hero 右下

## 修改后必须验证
1. Playwright（channel=chrome）打开页面，确认无 pageerror 与控制台报错
2. 桌面 1440×1000 与移动 390px 均无横向溢出（scrollWidth 等于 innerWidth）
3. 日历边界：2024-06 左箭头禁用，2026-11 右箭头禁用
4. 导出 PNG：下拉代理、按钮、表格均无裁切；导出期间隐藏 `.hero-actions`
5. 手动更新：file:// 与 http 下点击均返回「已是最新/已更新」，数据行数不变

## 常见坑
- html2canvas 渲染原生 select 会裁字：导出前把所有 select 换成 span 代理（`swapSelects`），`data-filter` 用紧凑版
- 导出宽度固定 1240px，窄窗口先撑宽再截图，裁剪到 `#sec-trend` 底部
- file:// 下 fetch/XHR 被禁，加载 data.js 只能用 script 标签
- 不引入构建工具、外部 CDN 或框架，保持单页可直接打开
- 改口径时同步更新页面「数据来源与口径」中的说明文字
