/**
 * Single-page admin UI for /plugins/memory (inline HTML/CSS/JS).
 */

export function getMemoryPanelHtml(): string {
  const css = `
/* 与 OpenClaw Observability 面板一致的浅色卡片 + 红色主色 */
:root {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #212121;
  background: #f5f5f5;
  --oc-accent: #d32f2f;
  --oc-accent-hover: #b71c1c;
  --oc-secondary: #7e57c2;
  --oc-border: #e0e0e0;
  --oc-muted: #757575;
  --oc-card: #ffffff;
  --oc-page: #f5f5f5;
}
* { box-sizing: border-box; }
input[type="checkbox"] { accent-color: var(--oc-accent); }
body {
  margin: 0;
  padding: 20px 20px 32px;
  max-width: 1400px;
  margin-inline: auto;
  min-height: 100vh;
  background: var(--oc-page);
}
.page-header {
  margin-bottom: 16px;
}
h1 {
  font-size: 1.35rem;
  margin: 0;
  font-weight: 600;
  color: #212121;
  letter-spacing: -0.02em;
}
.panel-card {
  background: var(--oc-card);
  border-radius: 10px;
  border: 1px solid var(--oc-border);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  padding: 16px 18px;
  margin-bottom: 14px;
  min-width: 0;
  max-width: 100%;
}
.panel-card--flush {
  padding: 12px 0 0;
  overflow: hidden;
}
.panel-card--flush .tabs {
  padding: 0 18px 12px;
  margin-bottom: 0;
}
.panel-card--flush #tableWrap {
  padding: 0 18px 16px;
}
.toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
}
.toolbar-row--filters {
  padding-top: 4px;
  border-top: 1px solid #eeeeee;
}
.toolbar-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-left: auto;
}
.toolbar-row--filters select#sessionId {
  min-width: 12rem;
}
.toolbar label { font-size: 0.8125rem; color: var(--oc-muted); font-weight: 500; }
.toolbar input, .toolbar select, .toolbar button {
  background: #fff;
  border: 1px solid var(--oc-border);
  color: #212121;
  border-radius: 8px;
  padding: 7px 11px;
  font-size: 0.875rem;
}
.toolbar button { cursor: pointer; font-weight: 500; }
.toolbar button:hover { background: #fafafa; border-color: #bdbdbd; }
.toolbar button:disabled { opacity: 0.45; cursor: not-allowed; }
#btnRefresh, #btnDeleteSelected, #btnInsertMemory {
  min-height: 36px;
}
#btnInsertMemory {
  background: var(--oc-accent);
  border-color: var(--oc-accent);
  color: #fff;
}
#btnInsertMemory:hover {
  background: var(--oc-accent-hover);
  border-color: var(--oc-accent-hover);
}
.modal-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-backdrop.open { display: flex; }
.modal-dialog {
  background: var(--oc-card);
  border: 1px solid var(--oc-border);
  border-radius: 12px;
  padding: 20px 22px;
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15);
}
.modal-dialog h2 { font-size: 1.05rem; margin: 0 0 10px; color: #212121; font-weight: 600; }
.modal-note { font-size: 0.8125rem; color: var(--oc-muted); margin: 0 0 14px; line-height: 1.5; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
.add-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; margin-bottom: 10px; }
.add-row label { min-width: 88px; padding-top: 8px; font-size: 0.8125rem; color: var(--oc-muted); font-weight: 500; }
.add-row input[type="text"], .add-row select, .add-row textarea {
  flex: 1;
  min-width: 200px;
  background: #fff;
  border: 1px solid var(--oc-border);
  color: #212121;
  border-radius: 8px;
  padding: 8px 11px;
  font-size: 0.875rem;
}
.add-row textarea { min-height: 100px; resize: vertical; font-family: inherit; }
.modal-actions button {
  background: #fff;
  border: 1px solid var(--oc-border);
  color: #424242;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}
.modal-actions button:hover { background: #fafafa; }
.modal-actions button.primary {
  background: var(--oc-accent);
  border-color: var(--oc-accent);
  color: #fff;
}
.modal-actions button.primary:hover {
  background: var(--oc-accent-hover);
  border-color: var(--oc-accent-hover);
}
.tabs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.tab {
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  color: #616161;
  border: none;
  background: transparent;
  font-size: 0.9rem;
  font-weight: 500;
}
.tab:hover { background: #f5f5f5; color: #212121; }
.tab.active {
  background: var(--oc-accent);
  color: #fff;
}
.tab.active:hover { background: var(--oc-accent-hover); color: #fff; }
.tab:disabled { opacity: 0.4; cursor: not-allowed; }
.banner { padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; font-size: 0.875rem; display: none; }
.banner.err {
  display: block;
  background: #ffebee;
  border: 1px solid #ffcdd2;
  color: #c62828;
}
.banner.info {
  display: block;
  background: #e3f2fd;
  border: 1px solid #90caf9;
  color: #1565c0;
}
table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
th, td {
  text-align: left;
  padding: 12px 14px;
  border-bottom: 1px solid #eeeeee;
  vertical-align: top;
}
th {
  color: #9e9e9e;
  font-weight: 600;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
tr:hover td { background: #fafafa; }
.text-cell { max-width: 560px; }
.text-preview {
  max-width: 420px;
  max-height: 4.5em;
  overflow: hidden;
  word-break: break-word;
  border-radius: 6px;
  padding: 2px 4px;
  margin: -2px -4px;
  color: #424242;
}
.text-preview:not(.text-preview-short) { cursor: pointer; outline: none; }
.text-preview:not(.text-preview-short):hover { background: #f5f5f5; }
.text-preview.text-preview-short { max-height: none; overflow: visible; max-width: 100%; }
.text-preview.expanded { max-height: none; overflow: visible; }
.text-hint {
  font-size: 0.72rem;
  color: var(--oc-muted);
  margin-top: 6px;
  user-select: none;
  cursor: pointer;
}
.batch-group {
  margin-bottom: 14px;
  border: 1px solid var(--oc-border);
  border-radius: 10px;
  padding: 12px 14px;
  background: #fafafa;
  box-shadow: none;
}
.batch-group:last-child { margin-bottom: 0; }
.batch-summary {
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: #424242;
  padding: 4px 2px;
  list-style-position: outside;
}
.batch-group table { margin-top: 12px; }
/* 用户/自进化/全文列表共用固定列宽，避免各 Tab 错位 */
table.mem-admin-table {
  table-layout: fixed;
  width: 100%;
}
table.mem-admin-table .fm-session-cell,
table.mem-admin-table .fm-cat-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
table.mem-admin-table .fm-time-cell,
table.mem-admin-table .fm-imp-cell,
table.mem-admin-table th.fm-th-cat,
table.mem-admin-table th.fm-th-time,
table.mem-admin-table th.fm-th-imp {
  white-space: nowrap;
}
table.mem-admin-table .fm-time-cell,
table.mem-admin-table .fm-imp-cell {
  overflow: hidden;
  text-overflow: ellipsis;
}
table.mem-admin-table .text-cell {
  max-width: none;
}
table.mem-admin-table .text-preview {
  max-width: 100%;
}
.fm-col-chk { width: 2.5rem; }
.fm-col-agent { width: 4.25rem; }
.fm-col-session { width: 18%; }
/* 用户/自进化：类型列收窄，时间/权重列加宽，配合 nowrap 避免表头与单元格断行 */
.fm-col-cat { width: 6.75rem; }
/* 全文记忆「类型」：约 7 个汉字可视宽度（含间隔号等，略大于 7em） */
.fm-col-cat-full { width: 11rem; min-width: 11rem; }
.fm-col-time { width: 13rem; }
.fm-col-imp { width: 6.5rem; }
.fm-col-seq { width: 2.5rem; }
.fm-col-text { width: auto; }
.pager {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 0;
  padding: 14px 18px 16px;
  flex-wrap: wrap;
  font-size: 0.875rem;
  color: var(--oc-muted);
}
.pager button {
  background: #fff;
  border: 1px solid var(--oc-border);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 0.8125rem;
  cursor: pointer;
  font-weight: 500;
  color: #424242;
}
.pager button:hover:not(:disabled) { background: #fafafa; }
.pager button:disabled { opacity: 0.4; cursor: not-allowed; }
.pager-jump {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
  flex-wrap: wrap;
}
.pager-jump label {
  font-size: 0.8125rem;
  color: var(--oc-muted);
  font-weight: 500;
}
.pager-jump input[type="number"] {
  width: 4.25rem;
  padding: 5px 8px;
  border: 1px solid var(--oc-border);
  border-radius: 8px;
  font-size: 0.8125rem;
  text-align: center;
}
.pager-jump-suffix { font-size: 0.8125rem; color: var(--oc-muted); }
.toolbar .time-quick-btns {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.toolbar button.btn-quick-time {
  padding: 5px 10px;
  font-size: 0.78rem;
  font-weight: 500;
  background: #fafafa;
  border: 1px solid var(--oc-border);
  color: #424242;
}
.toolbar button.btn-quick-time:hover {
  background: #f0f0f0;
  border-color: #bdbdbd;
}
.toolbar button.btn-quick-time.time-range-source-active {
  border-color: var(--oc-accent);
  background: #ffebee;
  color: var(--oc-accent);
  box-shadow: 0 0 0 1px rgba(211, 47, 47, 0.2);
}
.toolbar button.btn-quick-time.time-range-source-active:hover {
  background: #ffcdd2;
  border-color: var(--oc-accent-hover);
}
.toolbar input[type="datetime-local"].time-range-source-active {
  border-color: var(--oc-accent);
  color: #b71c1c;
  box-shadow: 0 0 0 1px rgba(211, 47, 47, 0.2);
}
.toolbar input[type="datetime-local"] {
  min-width: 11.5rem;
  padding: 6px 10px;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; color: #424242; }
.empty { color: var(--oc-muted); padding: 32px; text-align: center; font-size: 0.9rem; }
.inj-plain { display: block; margin: 4px 0; }
.inj-block { margin: 8px 0; }
.inj-open-modal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  font-family: inherit;
}
.inj-open-modal--primary {
  background: var(--oc-accent);
  color: #fff;
}
.inj-open-modal--primary:hover { background: var(--oc-accent-hover); }
.inj-open-modal--secondary {
  background: #fff;
  color: var(--oc-secondary);
  border: 1px solid #d1c4e9;
}
.inj-open-modal--secondary:hover { background: #f3e5f5; }
.inj-open-modal--neutral {
  background: #fff;
  color: #616161;
  border: 1px solid var(--oc-border);
}
.inj-open-modal--neutral:hover { background: #fafafa; }
.inj-fold-pre--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.modal-dialog-wide { max-width: min(920px, 96vw); }
.text-peek-pre {
  margin: 0 0 12px;
  max-height: min(72vh, 640px);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.8125rem;
  color: #212121;
  background: #fafafa;
  border: 1px solid var(--oc-border);
  border-radius: 8px;
  padding: 14px;
  line-height: 1.5;
}
/* —— 记忆大盘（对齐 Observability 浅色卡片 + 红/紫点缀） */
.dash-wrap {
  padding: 0 18px 16px;
}
.dash-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
/* KPI 第一行：6 格横向等分铺满 */
.dash-kpi-grid--strip {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
@media (max-width: 1100px) {
  .dash-kpi-grid--strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .dash-kpi-grid--strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.dash-kpi-card {
  background: #fff;
  border: 1px solid var(--oc-border);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.dash-kpi-label {
  font-size: 0.65rem;
  color: #9e9e9e;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.dash-kpi-value {
  font-size: 1.45rem;
  font-weight: 700;
  color: #212121;
  margin-top: 8px;
  line-height: 1.15;
}
.dash-kpi-sub {
  font-size: 0.75rem;
  color: var(--oc-muted);
  margin-top: 6px;
}
.dash-imp-bar {
  display: flex;
  height: 6px;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 10px;
}
.dash-imp-seg-low { background: #7e57c2; flex: 0 0 auto; min-width: 2px; }
.dash-imp-seg-mid { background: #ff9800; flex: 0 0 auto; min-width: 2px; }
.dash-imp-seg-high { background: #d32f2f; flex: 0 0 auto; min-width: 2px; }
.dash-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}
.dash-row--trend {
  grid-template-columns: 1fr;
}
.dash-row--trend .dash-card {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.dash-row--dist {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 960px) {
  .dash-row { grid-template-columns: 1fr; }
  .dash-row--dist { grid-template-columns: 1fr; }
}
.dash-card {
  background: #fff;
  border: 1px solid var(--oc-border);
  border-radius: 10px;
  padding: 16px 18px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.dash-card-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0 0 14px;
  color: #424242;
}
/* 写入趋势：固定绘图高度 + 像素柱高，避免 % 高度与 X 轴标签抢空间导致“突出”错位 */
.dash-chart {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 4px;
  margin-top: 4px;
  max-width: 100%;
  min-width: 0;
}
.dash-chart-y {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  flex-shrink: 0;
  width: 2.5rem;
  padding-right: 8px;
  border-right: 1px solid #e0e0e0;
  font-size: 0.68rem;
  color: #9e9e9e;
  line-height: 1;
  box-sizing: border-box;
}
.dash-chart-y-tick { font-variant-numeric: tabular-nums; }
.dash-chart-bars-wrap {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}
/* 列多时仍保持最小列宽，由 .dash-chart-bars 变宽 + wrap 横向滚动看全图 */
.dash-chart-bars-wrap--dense .dash-chart-col {
  min-width: 26px;
}
.dash-chart-bars-wrap--dense .dash-chart-x-label {
  font-size: 0.5rem;
}
.dash-chart-bars-wrap--dense .dash-x-l1,
.dash-chart-bars-wrap--dense .dash-x-l2 {
  font-size: 0.5rem;
}
.dash-chart-bars {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 4px;
  min-height: 0;
  border-bottom: 2px solid #e0e0e0;
  padding: 0 4px 0;
  box-sizing: border-box;
  /* 列少：至少占满可视区，列均分拉满横轴；列多：按列 min-width 变宽，外层 wrap 可横向滚动 */
  width: fit-content;
  min-width: 100%;
}
.dash-chart-col {
  flex: 1 1 0;
  min-width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.dash-chart-bar-track {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
}
.dash-chart-bar {
  width: min(100%, 20px);
  min-height: 0;
  background: var(--oc-accent);
  border-radius: 4px 4px 0 0;
  cursor: default;
  transition: opacity 0.12s, filter 0.12s;
  flex-shrink: 0;
}
.dash-chart-bar:hover {
  opacity: 0.92;
  filter: brightness(1.05);
}
.dash-chart-x-label {
  font-size: 0.58rem;
  color: #757575;
  margin-top: 8px;
  text-align: center;
  line-height: 1.2;
  max-width: 100%;
  white-space: normal;
  word-break: keep-all;
}
.dash-chart-x-label .dash-x-l1 { display: block; color: #616161; font-weight: 500; }
.dash-chart-x-label .dash-x-l2 { display: block; color: #9e9e9e; margin-top: 2px; }
.dash-dist-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 188px;
  gap: 14px;
  padding: 8px 4px 4px;
}
.dash-legend--below {
  width: 100%;
  max-width: 220px;
  margin: 0 auto;
}
.dash-donut-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.dash-donut {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
}
.dash-donut-center {
  position: absolute;
  inset: 34px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 1px #f5f5f5 inset;
}
.dash-donut-total { font-size: 1.25rem; font-weight: 700; color: #212121; }
.dash-donut-cap { font-size: 0.65rem; color: #9e9e9e; margin-top: 2px; }
.dash-legend { display: flex; flex-direction: column; gap: 8px; font-size: 0.8125rem; color: #424242; }
.dash-legend-item { display: flex; align-items: center; gap: 8px; }
.dash-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.dash-table-wrap { overflow-x: auto; }
table.dash-top-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
table.dash-top-table th,
table.dash-top-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #eeeeee;
  text-align: left;
}
table.dash-top-table th {
  font-size: 0.68rem;
  color: #9e9e9e;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.dash-empty {
  color: var(--oc-muted);
  font-size: 0.875rem;
  padding: 28px;
  text-align: center;
}
`;

  const js = buildClientScript();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>RDSClaw 记忆管理</title>
<style>${css}</style>
</head>
<body>
<div class="page-header">
  <h1>RDSClaw 记忆管理</h1>
</div>
<div id="banner" class="banner"></div>
<div class="panel-card panel-card--flush">
<div class="tabs" id="tabs">
  <button type="button" class="tab active" data-tab="dash">记忆大盘</button>
  <button type="button" class="tab" data-tab="user">用户记忆</button>
  <button type="button" class="tab" data-tab="self">自进化记忆</button>
  <button type="button" class="tab" data-tab="full">全文记忆</button>
</div>
</div>
<div class="panel-card">
<div class="toolbar">
  <div class="toolbar-row toolbar-row--time">
    <label for="timeFromInput">开始时间</label>
    <input type="datetime-local" id="timeFromInput" step="1" autocomplete="off"/>
    <label for="timeToInput">结束时间</label>
    <input type="datetime-local" id="timeToInput" step="1" autocomplete="off"/>
    <span class="time-quick-btns" aria-label="快捷时间范围">
      <button type="button" class="btn-quick-time" id="btnTime24h" title="结束为当前时刻，开始为 24 小时前">最近24小时</button>
      <button type="button" class="btn-quick-time" id="btnTime7d" title="结束为当前时刻，开始为 7 天前">最近7天</button>
      <button type="button" class="btn-quick-time" id="btnTime30d" title="结束为当前时刻，开始为 30 天前">最近30天</button>
    </span>
  </div>
  <div class="toolbar-row toolbar-row--filters">
    <label for="agentId">Agent</label>
    <select id="agentId"><option value="">（请选择）</option></select>
    <label for="sessionId">会话</label>
    <select id="sessionId"><option value="">全部</option></select>
    <span id="memoryTypeFilterWrap">
    <label for="memoryTypeFilter">记忆类型</label>
    <select id="memoryTypeFilter"><option value="">全部</option></select>
    </span>
    <span id="toolbarSortWrap">
    <label for="sortOrder">排序</label>
    <select id="sortOrder">
      <option value="desc" selected>逆序（新→旧）</option>
      <option value="asc">顺序（旧→新）</option>
    </select>
    </span>
    <span class="toolbar-actions">
      <button type="button" id="btnRefresh">刷新</button>
      <button type="button" id="btnDeleteSelected" disabled>删除所选</button>
      <button type="button" id="btnInsertMemory">插入记忆</button>
    </span>
  </div>
</div>
</div>
<div id="insertModal" class="modal-backdrop" aria-hidden="true">
  <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="insertModalTitle">
    <h2 id="insertModalTitle">插入记忆</h2>
    <p class="modal-note">仅做 embedding 后写入数据库；不经过相似度去重与 LLM 冲突处理。会话固定为 manual_insert，记忆权重固定为 1。</p>
    <div class="add-row">
      <label>Agent ID</label>
      <input type="text" id="addAgentId" placeholder="必填，例如 main" autocomplete="off"/>
    </div>
    <div class="add-row">
      <label>记忆类型</label>
      <select id="addCategory"></select>
    </div>
    <div class="add-row">
      <label>正文</label>
      <textarea id="addText" placeholder="记忆内容"></textarea>
    </div>
    <div class="modal-actions">
      <button type="button" id="btnModalCancel">取消</button>
      <button type="button" class="primary" id="btnModalInsert">确定插入</button>
    </div>
  </div>
</div>
<div id="textPeekModal" class="modal-backdrop" aria-hidden="true">
  <div class="modal-dialog modal-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="textPeekTitle">
    <h2 id="textPeekTitle">记忆召回信息</h2>
    <pre id="textPeekBody" class="text-peek-pre"></pre>
    <div class="modal-actions">
      <button type="button" class="primary" id="btnTextPeekClose">关闭</button>
    </div>
  </div>
</div>
<div class="panel-card panel-card--flush">
<div id="dashWrap" class="dash-wrap"></div>
<div id="tableWrap" style="display:none"></div>
<div class="pager" id="pager" style="display:none"></div>
</div>
<script>${js}</script>
</body>
</html>`;
}

function buildClientScript(): string {
  // 外层是模板字符串反引号：内层不要用 \ 转义双引号，否则生成到浏览器里的 JS 会断串（例如 class="mono"）。
  const s = `
(function () {
  // 与 rds-claw-observability-plugin 一致：127.0.0.1 与 localhost 在网关 Control UI / WS 策略上不等价，统一跳到 localhost。
  try {
    if (window.location.hostname === "127.0.0.1") {
      var _ocRedir =
        window.location.protocol +
        "//localhost" +
        (window.location.port ? ":" + window.location.port : "") +
        window.location.pathname +
        window.location.search +
        window.location.hash;
      window.location.replace(_ocRedir);
    }
  } catch (_ocRedirErr) {}

  var LS_TOKEN_KEY = "openclaw_memory_gateway_token";

  function readTokenFromQueryString(qs) {
    if (!qs || qs.charAt(0) !== "?") {
      return "";
    }
    var t = new URLSearchParams(qs.slice(1)).get("token");
    return t && String(t).trim() ? String(t).trim() : "";
  }

  /** 与观测插件一致：支持 JSON 包一层 token / gatewayToken / settings.* */
  function tryTokenFromJsonString(raw) {
    if (!raw || typeof raw !== "string") {
      return "";
    }
    var st = raw.trim();
    if (!st) {
      return "";
    }
    if (st.charAt(0) === "{") {
      try {
        var obj = JSON.parse(st);
        if (obj && typeof obj === "object") {
          if (typeof obj.token === "string" && obj.token.trim()) {
            return obj.token.trim();
          }
          if (typeof obj.gatewayToken === "string" && obj.gatewayToken.trim()) {
            return obj.gatewayToken.trim();
          }
          if (obj.settings && typeof obj.settings === "object") {
            if (typeof obj.settings.token === "string" && obj.settings.token.trim()) {
              return obj.settings.token.trim();
            }
            if (typeof obj.settings.gatewayToken === "string" && obj.settings.gatewayToken.trim()) {
              return obj.settings.gatewayToken.trim();
            }
          }
        }
      } catch (e) {}
    }
    return st;
  }

  function readTokenFromStorage(storage, key) {
    try {
      if (!storage || typeof storage.getItem !== "function") {
        return "";
      }
      return tryTokenFromJsonString(storage.getItem(key) || "");
    } catch (e) {
      return "";
    }
  }

  function persistToken(t) {
    try {
      localStorage.setItem(LS_TOKEN_KEY, t);
    } catch (e) {}
  }

  function getGatewayToken() {
    var fromSearch = readTokenFromQueryString(window.location.search);
    if (fromSearch) {
      persistToken(fromSearch);
      return fromSearch;
    }
    var hash = window.location.hash || "";
    var qm = hash.indexOf("?");
    if (qm >= 0) {
      var fromHash = readTokenFromQueryString(hash.slice(qm));
      if (fromHash) {
        persistToken(fromHash);
        return fromHash;
      }
    }
    var ocKeys = [
      "openclaw.control.token.v1",
      "openclaw.control.settings.v1",
      "openclaw.gateway.token",
      "gateway.token",
      "gatewayToken",
      "token"
    ];
    var i;
    for (i = 0; i < ocKeys.length; i++) {
      var tk = readTokenFromStorage(window.localStorage, ocKeys[i]);
      if (tk) {
        persistToken(tk);
        return tk;
      }
      tk = readTokenFromStorage(window.sessionStorage, ocKeys[i]);
      if (tk) {
        persistToken(tk);
        return tk;
      }
    }
    try {
      var legacy = localStorage.getItem(LS_TOKEN_KEY);
      legacy = legacy ? tryTokenFromJsonString(legacy) : "";
      return legacy && String(legacy).trim() ? String(legacy).trim() : "";
    } catch (e) {
      return "";
    }
  }

  /** 与网关 isLocalClient 一致：仅这些主机用 Control UI 客户端 + allowInsecureAuth 即可；其它主机需 probe + dangerouslyDisableDeviceAuth 等 */
  function isMemoryPanelLoopbackHost() {
    var h = (location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  }

  function hintGatewayControlUiInsecureAuth() {
    if (isMemoryPanelLoopbackHost()) {
      return (
        " 解决办法：编辑 ~/.openclaw/openclaw.json，在 gateway.controlUi 中加入 \\"allowInsecureAuth\\": true，保存后执行 openclaw gateway restart，再刷新本页。" +
        " 请用 http://localhost 打开本机面板（从 127.0.0.1 访问会自动跳转）；不要用局域网 IP，除非按下文配置。"
      );
    }
    return (
      " 解决办法（任选其一）：(1) 用本机浏览器打开 http://127.0.0.1:<网关端口>/plugins/memory?token=…，并设置 gateway.controlUi.allowInsecureAuth 为 true；" +
      "(2) 若必须从其它机器/局域网 IP 访问，在 gateway.controlUi 设置 \\"dangerouslyDisableDeviceAuth\\": true 后重启 gateway（会降低设备绑定安全策略）；" +
      "(3) 使用 HTTPS 并完成网关设备配对。"
    );
  }

  /**
   * 同源 POST：仅需 gateway token（Authorization Bearer 或 URL ?token=），不经 WebSocket operator scope。
   * 本机 localhost 也走此路径，避免 WS 上 memory.admin.* 因 scope/载荷格式问题被映射成模糊的 config 502。
   */
  async function fetchMemoryApiHttp(method, params) {
    var tok = getGatewayToken();
    var headers = { "Content-Type": "application/json" };
    if (tok) {
      headers["Authorization"] = "Bearer " + tok;
    }
    var callUrl = "/plugins/memory/api/v1/call";
    if (tok) {
      callUrl += "?token=" + encodeURIComponent(tok);
    }
    var resp;
    try {
      resp = await fetch(callUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ method: method, params: params || {} })
      });
    } catch (e) {
      return {
        ok: false,
        status: 0,
        json: function () {
          return Promise.resolve({ error: String(e) });
        },
        text: function () {
          return Promise.resolve(String(e));
        }
      };
    }
    var j;
    try {
      j = await resp.json();
    } catch (e2) {
      j = { error: "invalid JSON response" };
    }
    if (resp.ok) {
      return {
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve(j);
        },
        text: function () {
          return Promise.resolve("");
        }
      };
    }
    var st = resp.status;
    if (j && typeof j.status === "number" && Number.isFinite(j.status)) {
      st = j.status;
    }
    return {
      ok: false,
      status: st,
      json: function () {
        return Promise.resolve(j);
      },
      text: function () {
        return Promise.resolve(String((j && j.error) || resp.status));
      }
    };
  }

  /** 与原先 fetch 类似的接口：ok / status / json() / text()（一律走同源 HTTP，与 token 行为一致） */
  async function fetchMemoryApi(method, params) {
    var p = params || {};
    return fetchMemoryApiHttp(method, p);
  }

  function showBanner(kind, msg) {
    var el = document.getElementById("banner");
    el.className = "banner " + (kind || "");
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function categoryLabel(c) {
    var m = state.cfg && state.cfg.categoryLabelsZh;
    return (m && m[c]) ? m[c] : String(c);
  }

  var state = {
    tab: "dash",
    cfg: null,
    page: 1,
    pageSize: 100,
    total: 0,
    items: [],
    loading: false,
    selectedAgentId: "",
    selectedSessionId: "",
    sortOrderByTab: { user: "desc", self: "desc", full: "desc" },
    /** 非 null 表示当前起止时间来自「最近 N ms」快捷；刷新时先按此刻重算，避免结束时间停在旧时刻 */
    timeQuickMs: null,
    categoryFilterByTab: { user: "", self: "", full: "" }
  };

  var MS_QUICK_24H = 24 * 3600 * 1000;
  var MS_QUICK_7D = 7 * 24 * 3600 * 1000;
  var MS_QUICK_30D = 30 * 24 * 3600 * 1000;

  /** 快捷与自定义时间来源：快捷则高亮对应按钮，否则高亮起止输入框 */
  function syncTimeRangeHighlight() {
    var q24 = document.getElementById("btnTime24h");
    var q7 = document.getElementById("btnTime7d");
    var q30 = document.getElementById("btnTime30d");
    var fi = document.getElementById("timeFromInput");
    var ti = document.getElementById("timeToInput");
    [q24, q7, q30].forEach(function (b) {
      if (b) b.classList.remove("time-range-source-active");
    });
    if (fi) fi.classList.remove("time-range-source-active");
    if (ti) ti.classList.remove("time-range-source-active");

    var m = state.timeQuickMs;
    if (m === MS_QUICK_24H && q24) {
      q24.classList.add("time-range-source-active");
    } else if (m === MS_QUICK_7D && q7) {
      q7.classList.add("time-range-source-active");
    } else if (m === MS_QUICK_30D && q30) {
      q30.classList.add("time-range-source-active");
    } else {
      if (fi) fi.classList.add("time-range-source-active");
      if (ti) ti.classList.add("time-range-source-active");
    }
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** datetime-local 用本地时间，含秒（step=1） */
  function toDatetimeLocalValue(d) {
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate()) +
      "T" +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes()) +
      ":" +
      pad2(d.getSeconds())
    );
  }

  function applyQuickRangeMs(ms) {
    var now = Date.now();
    var from = new Date(now - ms);
    var to = new Date(now);
    var fi = document.getElementById("timeFromInput");
    var ti = document.getElementById("timeToInput");
    if (fi) fi.value = toDatetimeLocalValue(from);
    if (ti) ti.value = toDatetimeLocalValue(to);
    state.timeQuickMs = ms;
    syncTimeRangeHighlight();
  }

  /** 返回 { timeFrom, timeTo } ISO 字符串，或 { error: string } */
  function readTimeRange() {
    var fromEl = document.getElementById("timeFromInput");
    var toEl = document.getElementById("timeToInput");
    var fromV = fromEl && fromEl.value;
    var toV = toEl && toEl.value;
    if (!fromV || !toV) {
      return { error: "请填写开始时间与结束时间（可使用「最近24小时」等快捷填充）" };
    }
    var fromMs = new Date(fromV).getTime();
    var toMs = new Date(toV).getTime();
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      return { error: "时间格式无效" };
    }
    if (fromMs > toMs) {
      return { error: "开始时间不能晚于结束时间" };
    }
    return {
      timeFrom: new Date(fromMs).toISOString(),
      timeTo: new Date(toMs).toISOString()
    };
  }

  function listQueryParams(page, tr) {
    var t = tr != null ? tr : readTimeRange();
    if (t.error) {
      return t;
    }
    var aid = state.selectedAgentId.trim();
    var sid = state.selectedSessionId.trim();
    var ord = document.getElementById("sortOrder");
    var sortDesc = !!(ord && ord.value === "desc");
    var catF = state.categoryFilterByTab[state.tab] || "";
    var o = {
      tab: state.tab,
      agentId: aid,
      timeFrom: t.timeFrom,
      timeTo: t.timeTo,
      page: page || 1,
      limit: state.pageSize,
      sortDesc: sortDesc
    };
    if (sid) o.sessionId = sid;
    if (catF) o.category = catF;
    return { params: o };
  }

  function syncMemoryTypeFilterSelect() {
    var sel = document.getElementById("memoryTypeFilter");
    if (!sel || !state.cfg || !state.cfg.memoryTypeFilterOptions) {
      return;
    }
    if (state.tab === "dash") {
      return;
    }
    var tabKey = state.tab;
    var opts = state.cfg.memoryTypeFilterOptions[tabKey] || [];
    var saved = state.categoryFilterByTab[tabKey] || "";
    sel.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "全部";
    sel.appendChild(allOpt);
    opts.forEach(function (row) {
      var o = document.createElement("option");
      o.value = row.category;
      o.textContent = row.labelZh;
      sel.appendChild(o);
    });
    var ok = saved && Array.prototype.some.call(sel.options, function (opt) { return opt.value === saved; });
    if (ok) {
      sel.value = saved;
    } else {
      sel.value = "";
      state.categoryFilterByTab[tabKey] = "";
    }
  }

  function fillAddCategorySelect() {
    var sel = document.getElementById("addCategory");
    if (!sel || !state.cfg || !state.cfg.tabCategories) return;
    var tabKey = state.tab === "dash" ? "user" : state.tab;
    var cats = state.cfg.tabCategories[tabKey] || [];
    sel.innerHTML = "";
    cats.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = categoryLabel(c);
      sel.appendChild(o);
    });
  }

  function openInsertModal() {
    if (!state.cfg) {
      showBanner("err", "配置尚未加载完成");
      return;
    }
    fillAddCategorySelect();
    var aid = document.getElementById("addAgentId");
    if (aid && state.selectedAgentId.trim()) {
      aid.value = state.selectedAgentId.trim();
    }
    var modal = document.getElementById("insertModal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    if (aid) aid.focus();
  }

  function closeInsertModal() {
    var modal = document.getElementById("insertModal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  async function loadConfig() {
    var r = await fetchMemoryApi("memory.admin.config", {});
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        var detailAuth = await r.json().catch(function () {
          return {};
        });
        var errLow = String(detailAuth.error || "").toLowerCase();
        var hintScope =
          r.status === 403 && errLow.indexOf("scope") >= 0
            ? isMemoryPanelLoopbackHost()
              ? " 已通过 token 连接但仍缺少 scope：请在 openclaw.json 的 gateway.controlUi 设置 allowInsecureAuth: true（回环访问），保存后重启 gateway。"
              : " 已通过 token 连接但仍缺少 scope：非本机 hostname 访问时请设置 gateway.controlUi.dangerouslyDisableDeviceAuth: true，或改用 http://127.0.0.1 打开面板并配合 allowInsecureAuth: true；保存后重启 gateway。"
            : "";
        throw new Error(
          (r.status === 401
            ? "未授权：请在 URL 使用 ?token=（与 ~/.openclaw/openclaw.json 中 gateway.auth.token 一致），hash 路由可用 #/path?token=；请求 /plugins/memory/api/v1/call 时会携带该 token（Bearer 与 query）。成功一次后会写入本机 localStorage。"
            : "拒绝访问：" + (detailAuth.error ? String(detailAuth.error) : (await r.text().catch(function () { return ""; }))) + hintScope)
        );
      }
      if (r.status === 0) {
        var detail0 = await r.json().catch(function () {
          return {};
        });
        var msg0 = detail0 && detail0.error != null ? String(detail0.error) : await r.text().catch(function () { return ""; });
        var low0 = msg0.toLowerCase();
        var hintHandshake =
          low0.indexOf("device identity") >= 0 || low0.indexOf("control ui") >= 0 ? hintGatewayControlUiInsecureAuth() : "";
        throw new Error(
          msg0
            ? "无法请求记忆 API（网络或网关错误）：" + msg0 + hintHandshake
            : "无法请求记忆 API（请确认网关已启动、页面与网关同源，且 token 正确）。仍失败请查看 gateway 日志。"
        );
      }
      throw new Error("config " + r.status);
    }
    state.cfg = await r.json();
    var fullTab = document.querySelector('[data-tab="full"]');
    var selfTab = document.querySelector('[data-tab="self"]');
    if (!state.cfg.enableFullContextMemory) {
      fullTab.disabled = true;
      fullTab.title = "已在配置中关闭全文记忆";
    }
    if (!state.cfg.enableSelfImprovingMemory) {
      selfTab.disabled = true;
      selfTab.title = "已在配置中关闭自进化记忆";
    }
    fillAddCategorySelect();
    syncMemoryTypeFilterSelect();
  }

  function ensureSelectOption(sel, value) {
    if (!value) return;
    var exists = Array.prototype.some.call(sel.options, function (o) { return o.value === value; });
    if (!exists) {
      var o = document.createElement("option");
      o.value = value;
      o.textContent = value + "（当前筛选）";
      sel.appendChild(o);
    }
  }

  function maybeAutoLoadList() {
    if (state.selectedAgentId.trim()) {
      loadList(1);
    } else {
      showBanner("info", "请先选择 Agent。");
      document.getElementById("tableWrap").innerHTML = '<p class="empty">空列表（未选择 Agent）。</p>';
      document.getElementById("pager").style.display = "none";
    }
  }

  function maybeAutoLoadForCurrentTab() {
    if (state.tab === "dash") {
      loadDashboard();
    } else {
      maybeAutoLoadList();
    }
  }

  function updateToolbarForTab() {
    var isDash = state.tab === "dash";
    var sw = document.getElementById("toolbarSortWrap");
    if (sw) {
      sw.style.display = isDash ? "none" : "";
    }
    var delBtn = document.getElementById("btnDeleteSelected");
    if (delBtn) {
      delBtn.style.display = isDash ? "none" : "";
    }
    var insBtn = document.getElementById("btnInsertMemory");
    if (insBtn) {
      insBtn.style.display = isDash ? "none" : "";
    }
    var mtw = document.getElementById("memoryTypeFilterWrap");
    if (mtw) {
      mtw.style.display = isDash ? "none" : "";
    }
    if (!isDash) {
      syncMemoryTypeFilterSelect();
    }
    var dashW = document.getElementById("dashWrap");
    var tblW = document.getElementById("tableWrap");
    if (dashW) {
      dashW.style.display = isDash ? "block" : "none";
    }
    if (tblW) {
      tblW.style.display = isDash ? "none" : "block";
    }
  }

  function renderDashboard(data) {
    var USER_CATS = ["user_memory_fact", "user_memory_preference", "user_memory_decision"];
    var SELF_CATS = ["self_improving_learnings", "self_improving_errors", "self_improving_feature_requests"];
    var FULL_CATS = [
      "full_context_memory",
      "full_context_user",
      "full_context_assistant",
      "full_context_system",
      "full_context_tool",
      "full_context_tool_result",
      "full_context_others"
    ];
    var COL_USER = ["#c62828", "#e53935", "#ff8a80"];
    var COL_SELF = ["#4527a0", "#7e57c2", "#b39ddb"];
    var COL_FULL = ["#e65100", "#f57c00", "#ff9800", "#ffb74d", "#5d4037", "#546e7a", "#78909c"];
    function trendXLabelHtml(fullLab) {
      var lab = String(fullLab || "");
      var sp = lab.indexOf(" ");
      if (sp > 0) {
        return (
          '<span class="dash-x-l1">' +
          esc(lab.slice(0, sp)) +
          '</span><span class="dash-x-l2">' +
          esc(lab.slice(sp + 1)) +
          "</span>"
        );
      }
      if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(lab)) {
        return '<span class="dash-x-l1">' + esc(lab.slice(5)) + "</span>";
      }
      return esc(lab);
    }
    function buildConicGradient(segs, colors) {
      var tot = 0;
      segs.forEach(function (x) {
        tot += x.count;
      });
      if (tot <= 0) {
        return "#eeeeee";
      }
      var d = 0;
      var parts = [];
      segs.forEach(function (x, i) {
        var span = (x.count / tot) * 360;
        if (span <= 0) {
          return;
        }
        var c = colors[i % colors.length];
        parts.push(c + " " + d + "deg " + (d + span) + "deg");
        d += span;
      });
      if (!parts.length) {
        return "#eeeeee";
      }
      return "conic-gradient(" + parts.join(",") + ")";
    }
    function kindDonutCard(title, keys, colors) {
      var byCat = data.byCategory || {};
      var segs = [];
      keys.forEach(function (k) {
        var n = byCat[k];
        if (typeof n === "number" && n > 0) {
          segs.push({ key: k, count: n });
        }
      });
      segs.sort(function (a, b) {
        return b.count - a.count;
      });
      var sum = 0;
      segs.forEach(function (x) {
        sum += x.count;
      });
      if (sum === 0) {
        return (
          '<div class="dash-card"><h3 class="dash-card-title">' +
          esc(title) +
          '</h3><div class="dash-dist-inner"><p class="dash-empty">暂无数据</p></div></div>'
        );
      }
      var grad = buildConicGradient(segs, colors);
      var leg = "";
      segs.forEach(function (x, idx) {
        leg +=
          '<div class="dash-legend-item"><span class="dash-dot" style="background:' +
          colors[idx % colors.length] +
          '"></span>' +
          esc(categoryLabel(x.key)) +
          " · " +
          x.count +
          "</div>";
      });
      return (
        '<div class="dash-card"><h3 class="dash-card-title">' +
        esc(title) +
        '</h3><div class="dash-dist-inner">' +
        '<div class="dash-donut" style="background:' +
        grad +
        '"><div class="dash-donut-center"><span class="dash-donut-total">' +
        sum +
        '</span><span class="dash-donut-cap">条</span></div></div>' +
        '<div class="dash-legend dash-legend--below">' +
        leg +
        "</div></div></div>"
      );
    }
    var u = data.byKind ? data.byKind.user || 0 : 0;
    var s = data.byKind ? data.byKind.self || 0 : 0;
    var f = data.byKind ? data.byKind.full || 0 : 0;
    var maxB = 0;
    var buckets = data.byBucket || [];
    buckets.forEach(function (b) {
      if (b.count > maxB) {
        maxB = b.count;
      }
    });
    var plotH = 200;
    var scaleMax = maxB > 0 ? maxB : 1;
    var yTicks = [];
    var yi;
    for (yi = 4; yi >= 0; yi--) {
      yTicks.push(Math.round((scaleMax * yi) / 4));
    }
    var yAxisHtml = '<div class="dash-chart-y" style="height:' + plotH + 'px">';
    yTicks.forEach(function (tick) {
      yAxisHtml += '<span class="dash-chart-y-tick">' + tick + "</span>";
    });
    yAxisHtml += "</div>";
    var barsHtml = "";
    if (buckets.length === 0) {
      barsHtml = '<p class="dash-empty" style="padding:40px 8px">当前时间范围内无写入分布数据</p>';
    } else {
      buckets.forEach(function (b) {
        var cnt = b.count || 0;
        var barPx = scaleMax > 0 ? Math.round((cnt / scaleMax) * plotH) : 0;
        if (cnt > 0 && barPx < 2) {
          barPx = 2;
        }
        var tip = esc(b.label) + "：" + String(cnt) + " 条";
        barsHtml +=
          '<div class="dash-chart-col">' +
          '<div class="dash-chart-bar-track" style="height:' +
          plotH +
          'px">' +
          '<div class="dash-chart-bar" style="height:' +
          barPx +
          'px" title="' +
          tip +
          '"></div></div>' +
          '<div class="dash-chart-x-label" title="' +
          esc(b.label) +
          '">' +
          trendXLabelHtml(b.label) +
          "</div></div>";
      });
      var barsWrapCls =
        buckets.length > 16
          ? "dash-chart-bars-wrap dash-chart-bars-wrap--dense"
          : "dash-chart-bars-wrap";
      barsHtml =
        '<div class="dash-chart">' +
        yAxisHtml +
        '<div class="' +
        barsWrapCls +
        '"><div class="dash-chart-bars">' +
        barsHtml +
        "</div></div></div>";
    }
    var ua = data.uniqueAgents != null ? data.uniqueAgents : 0;
    var us = data.uniqueSessions != null ? data.uniqueSessions : 0;
    var kpi =
      '<div class="dash-kpi-grid dash-kpi-grid--strip">' +
      '<div class="dash-kpi-card"><div class="dash-kpi-label">总条数</div><div class="dash-kpi-value">' +
      (data.total != null ? data.total : 0) +
      '</div><div class="dash-kpi-sub">当前筛选范围内全部类别</div></div>' +
      '<div class="dash-kpi-card"><div class="dash-kpi-label">用户记忆</div><div class="dash-kpi-value">' +
      u +
      "</div></div>" +
      '<div class="dash-kpi-card"><div class="dash-kpi-label">自进化记忆</div><div class="dash-kpi-value">' +
      s +
      "</div></div>" +
      '<div class="dash-kpi-card"><div class="dash-kpi-label">全文记忆</div><div class="dash-kpi-value">' +
      f +
      "</div></div>" +
      '<div class="dash-kpi-card"><div class="dash-kpi-label">独立 Agent</div><div class="dash-kpi-value">' +
      ua +
      '</div><div class="dash-kpi-sub">去重计数</div></div>' +
      '<div class="dash-kpi-card"><div class="dash-kpi-label">独立会话</div><div class="dash-kpi-value">' +
      us +
      '</div><div class="dash-kpi-sub">去重计数</div></div>' +
      "</div>";
    var distRow =
      '<div class="dash-row dash-row--dist">' +
      kindDonutCard("用户记忆分布", USER_CATS, COL_USER) +
      kindDonutCard("自进化记忆分布", SELF_CATS, COL_SELF) +
      kindDonutCard("全文记忆分布", FULL_CATS, COL_FULL) +
      "</div>";
    var topA = data.topAgents || [];
    var agentsRows = "";
    topA.forEach(function (r) {
      agentsRows +=
        '<tr><td class="mono">' +
        esc(r.agentId) +
        "</td><td>" +
        esc(String(r.count)) +
        "</td></tr>";
    });
    if (!agentsRows) {
      agentsRows = '<tr><td colspan="2" class="dash-empty" style="padding:16px">暂无数据</td></tr>';
    }
    var topS = data.topSessions || [];
    var sessRows = "";
    topS.forEach(function (r) {
      sessRows +=
        '<tr><td class="mono" title="' +
        esc(r.sessionId) +
        '">' +
        esc(r.sessionId.length > 36 ? r.sessionId.slice(0, 18) + "…" : r.sessionId) +
        "</td><td>" +
        esc(String(r.count)) +
        "</td></tr>";
    });
    if (!sessRows) {
      sessRows = '<tr><td colspan="2" class="dash-empty" style="padding:16px">暂无数据</td></tr>';
    }
    var topAgentsTable =
      '<div class="dash-table-wrap"><table class="dash-top-table"><thead><tr><th>Agent</th><th>条数</th></tr></thead><tbody>' +
      agentsRows +
      "</tbody></table></div>";
    var topSessionsTable =
      '<div class="dash-table-wrap"><table class="dash-top-table"><thead><tr><th>会话</th><th>条数</th></tr></thead><tbody>' +
      sessRows +
      "</tbody></table></div>";
    var html =
      kpi +
      '<div class="dash-row dash-row--trend">' +
      '<div class="dash-card"><h3 class="dash-card-title">写入趋势</h3>' +
      barsHtml +
      "</div></div>" +
      distRow +
      '<div class="dash-row">' +
      '<div class="dash-card"><h3 class="dash-card-title">热门 Agent</h3>' +
      topAgentsTable +
      "</div>" +
      '<div class="dash-card"><h3 class="dash-card-title">热门会话</h3>' +
      topSessionsTable +
      "</div>" +
      "</div>";
    document.getElementById("dashWrap").innerHTML = html;
  }

  async function loadDashboard() {
    if (state.tab !== "dash") {
      return;
    }
    var tr = readTimeRange();
    if (tr.error) {
      showBanner("err", tr.error);
      document.getElementById("dashWrap").innerHTML = '<p class="dash-empty">' + esc(tr.error) + "</p>";
      return;
    }
    var aid = state.selectedAgentId.trim();
    if (!aid) {
      showBanner("info", "请先选择 Agent。");
      document.getElementById("dashWrap").innerHTML = '<p class="dash-empty">请先选择 Agent 后再查看记忆大盘。</p>';
      return;
    }
    showBanner("", "");
    state.loading = true;
    var sid = state.selectedSessionId.trim();
    try {
      var dashParams = {
        timeFrom: tr.timeFrom,
        timeTo: tr.timeTo,
        agentId: aid
      };
      if (sid) dashParams.sessionId = sid;
      var r = await fetchMemoryApi("memory.admin.dashboard", dashParams);
      var data = await r.json().catch(function () {
        return {};
      });
      if (!r.ok) {
        showBanner("err", (data && data.error) ? String(data.error) : "大盘加载失败 " + r.status);
        document.getElementById("dashWrap").innerHTML = '<p class="dash-empty">加载失败</p>';
        return;
      }
      showBanner("", "");
      renderDashboard(data);
    } finally {
      state.loading = false;
    }
  }

  async function loadFacets(opts) {
    var autoLoad = !opts || opts.autoLoad !== false;
    showBanner("", "");
    var r = await fetchMemoryApi("memory.admin.facets", { tab: state.tab });
    if (!r.ok) {
      var err = await r.text();
      var hint401 = r.status === 401 ? " 需要 Token：URL ?token= 或 #/path?token=（与 gateway.auth.token 一致）" : "";
      var hint403 =
        r.status === 403 && String(err).toLowerCase().indexOf("scope") >= 0
          ? isMemoryPanelLoopbackHost()
            ? " 请在 openclaw.json 设置 gateway.controlUi.allowInsecureAuth: true 后重启 gateway。"
            : " 请在 openclaw.json 设置 gateway.controlUi.dangerouslyDisableDeviceAuth: true（或改用 127.0.0.1 打开）后重启 gateway。"
          : "";
      showBanner("err", "加载下拉失败: " + r.status + " " + err + hint401 + hint403);
      return;
    }
    var data = await r.json().catch(function () {
      return {};
    });
    var agents = data.agents || [];
    var sessions = data.sessions || [];
    var selA = document.getElementById("agentId");
    var selS = document.getElementById("sessionId");

    selA.innerHTML = '<option value="">（请选择）</option>';
    selS.innerHTML = '<option value="">全部</option>';
    agents.forEach(function (a) {
      var o = document.createElement("option");
      o.value = a;
      o.textContent = a;
      selA.appendChild(o);
    });
    sessions.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      selS.appendChild(o);
    });
    var curAgent = state.selectedAgentId.trim();
    if (agents.length > 0 && (!curAgent || agents.indexOf(curAgent) < 0)) {
      curAgent = agents.indexOf("main") >= 0 ? "main" : agents[0];
      state.selectedAgentId = curAgent;
    }
    ensureSelectOption(selA, state.selectedAgentId.trim());
    ensureSelectOption(selS, state.selectedSessionId.trim());
    selA.value = state.selectedAgentId.trim();
    selS.value = state.selectedSessionId.trim();
    state.selectedAgentId = selA.value.trim();
    state.selectedSessionId = selS.value.trim();

    if (agents.length === 0 && sessions.length === 0) {
      ensureSelectOption(selA, "main");
      if (!state.selectedAgentId.trim()) {
        state.selectedAgentId = "main";
        selA.value = "main";
      }
    }

    if (autoLoad) maybeAutoLoadForCurrentTab();
  }

  async function loadList(page) {
    if (state.tab === "dash") {
      return;
    }
    var aid = state.selectedAgentId.trim();
    if (!aid) {
      showBanner("info", "请先选择 Agent。");
      document.getElementById("tableWrap").innerHTML = '<p class="empty">请选择 Agent 后刷新。</p>';
      document.getElementById("pager").style.display = "none";
      return;
    }
    showBanner("", "");
    var tr = readTimeRange();
    if (tr.error) {
      showBanner("err", tr.error);
      document.getElementById("pager").style.display = "none";
      return;
    }
    state.loading = true;
    state.page = page || 1;
    try {
      var lq = listQueryParams(state.page, tr);
      if (lq.error) {
        showBanner("err", lq.error);
        document.getElementById("pager").style.display = "none";
        return;
      }
      var r = await fetchMemoryApi("memory.admin.list", lq.params);
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        showBanner("err", (data && data.error) ? String(data.error) : "列表请求失败 " + r.status);
        return;
      }
      state.total = data.total || 0;
      state.items = data.items || [];
      renderTable();
      renderPager();
    } finally {
      state.loading = false;
    }
  }

  /** 按开闭标签切分，避免正则 [\s\S]*? 与模板转义导致漏掉 </...> 后的正文。 */
  function splitInjectBlocks(raw) {
    if (!raw) return null;
    var lower = raw.toLowerCase();
    var parts = [];
    var pos = 0;
    var foundAny = false;
    while (true) {
      var ir = lower.indexOf("<relevant-memories", pos);
      var ik = lower.indexOf("<knowledge-context", pos);
      var openIdx = -1;
      var closeNeedle = "";
      if (ir >= 0 && (ik < 0 || ir <= ik)) {
        openIdx = ir;
        closeNeedle = "</relevant-memories";
      } else if (ik >= 0) {
        openIdx = ik;
        closeNeedle = "</knowledge-context";
      } else {
        break;
      }
      if (openIdx > pos) {
        parts.push({ t: "p", s: raw.slice(pos, openIdx) });
      }
      var cs = lower.indexOf(closeNeedle, openIdx);
      if (cs < 0) return null;
      var gt = raw.indexOf(">", cs);
      if (gt < 0) return null;
      var endEx = gt + 1;
      parts.push({ t: "i", s: raw.slice(openIdx, endEx) });
      pos = endEx;
      foundAny = true;
    }
    if (!foundAny) return null;
    if (pos < raw.length) {
      parts.push({ t: "p", s: raw.slice(pos) });
    }
    return parts;
  }

  function injectLinkLabel(block) {
    var b = (block || "").toLowerCase();
    if (b.indexOf("<relevant-memories") >= 0) {
      return "记忆召回信息";
    }
    if (b.indexOf("<knowledge-context") >= 0) {
      return "知识上下文信息";
    }
    return "注入片段信息";
  }

  function injectModalTitleClass(block) {
    var b = (block || "").toLowerCase();
    if (b.indexOf("<relevant-memories") >= 0) {
      return "inj-open-modal--primary";
    }
    if (b.indexOf("<knowledge-context") >= 0) {
      return "inj-open-modal--secondary";
    }
    return "inj-open-modal--neutral";
  }

  function modalTitleForInjectClass(cls) {
    if (cls.indexOf("inj-open-modal--primary") >= 0) {
      return "记忆召回信息";
    }
    if (cls.indexOf("inj-open-modal--secondary") >= 0) {
      return "知识上下文信息";
    }
    return "注入片段信息";
  }

  function buildTextCellWithInjectFold(raw) {
    var sp = splitInjectBlocks(raw);
    if (!sp) {
      return null;
    }
    var html = "";
    sp.forEach(function (part) {
      if (part.t === "p") {
        if (!part.s) {
          return;
        }
        var pl = part.s.length > 200;
        html +=
          '<span class="' +
          (pl ? "text-preview inj-plain" : "text-preview text-preview-short inj-plain") +
          '"' +
          (pl ? ' role="button" tabindex="0" title="点击展开或收起"' : "") +
          ">" +
          esc(part.s) +
          "</span>";
      } else {
        var ic = injectModalTitleClass(part.s);
        html +=
          '<div class="inj-block">' +
          '<button type="button" class="inj-open-modal ' +
          ic +
          '" title="在弹窗中查看全文">' +
          esc(injectLinkLabel(part.s)) +
          "</button>" +
          '<pre class="inj-fold-pre--hidden" aria-hidden="true">' +
          esc(part.s) +
          "</pre></div>";
      }
    });
    return html;
  }

  function buildOneRow(row, i, extraCols) {
    var raw = row.text == null ? "" : String(row.text);
    var mixed = buildTextCellWithInjectFold(raw);
    var seqCell = "";
    if (extraCols) {
      seqCell = '<td class="mono">' + esc(row.seqInBatch != null ? String(row.seqInBatch) : "") + "</td>";
    }
    var sessTitle = ' title="' + esc(row.sessionId || "") + '"';
    var sessCls = "mono fm-session-cell";
    var catTdOpen = '<td class="fm-cat-cell">';
    var textTd;
    if (mixed) {
      textTd = '<td><div class="text-cell text-cell-mixed">' + mixed + "</div></td>";
    } else {
      var long = raw.length > 200;
      var prevCls = "text-preview" + (long ? "" : " text-preview-short");
      var prevAttrs = long ? ' role="button" tabindex="0" title="点击展开或收起全文"' : "";
      var hint = long ? '<div class="text-hint">点击上文或此处展开全文</div>' : "";
      textTd =
        '<td><div class="text-cell">' +
        "<div " +
        prevAttrs +
        ' class="' +
        prevCls +
        '">' +
        esc(raw) +
        "</div>" +
        hint +
        "</div></td>";
    }
    return (
      "<tr>" +
      '<td><input type="checkbox" class="rowchk" data-i="' + i + '"/></td>' +
      '<td class="mono">' + esc(row.agentId) + "</td>" +
      "<td" +
      sessTitle +
      ' class="' +
      sessCls +
      '">' +
      esc(row.sessionId) +
      "</td>" +
      catTdOpen +
      esc(categoryLabel(row.category)) +
      "</td>" +
      '<td class="fm-time-cell">' + esc(new Date(row.createdAt).toLocaleString()) + "</td>" +
      (extraCols ? "" : '<td class="fm-imp-cell mono">' + esc(row.importance) + "</td>") +
      seqCell +
      textTd +
      "</tr>"
    );
  }

  function renderTable() {
    var wrap = document.getElementById("tableWrap");
    if (!state.items.length) {
      wrap.innerHTML = '<p class="empty">暂无数据</p>';
      return;
    }
    if (state.tab === "full") {
      var groups = [];
      var cur = null;
      state.items.forEach(function (row, idx) {
        var bid = row.batchId && String(row.batchId).length ? String(row.batchId) : "";
        if (!cur || cur.batchId !== bid) {
          cur = { batchId: bid, rows: [] };
          groups.push(cur);
        }
        cur.rows.push({ row: row, idx: idx });
      });
      var colgroup =
        "<colgroup>" +
        '<col class="fm-col-chk"/>' +
        '<col class="fm-col-agent"/>' +
        '<col class="fm-col-session"/>' +
        '<col class="fm-col-cat-full"/>' +
        '<col class="fm-col-time"/>' +
        '<col class="fm-col-seq"/>' +
        '<col class="fm-col-text"/>' +
        "</colgroup>";
      var thead =
        "<thead><tr>" +
        '<th><input type="checkbox" class="batch-chk-all" title="本对话轮次全选"/></th>' +
        "<th>Agent</th><th>会话</th><th class='fm-th-cat fm-th-cat-full'>类型</th><th class='fm-th-time'>时间</th><th>序</th><th>正文</th></tr></thead>";
      var blocks = groups.map(function (g) {
        var label = g.batchId
          ? "对话轮次 · " + esc(g.batchId.slice(0, 8)) + "… · " + g.rows.length + " 条（组内正序）"
          : "其他 · " + g.rows.length + " 条";
        var bodyRows = "";
        g.rows.forEach(function (pair) {
          bodyRows += buildOneRow(pair.row, pair.idx, true);
        });
        return (
          '<details class="batch-group" open>' +
          '<summary class="batch-summary">' +
          label +
          "</summary>" +
          '<table class="mem-admin-table">' +
          colgroup +
          thead +
          "<tbody>" +
          bodyRows +
          "</tbody></table></details>"
        );
      });
      wrap.innerHTML = blocks.join("");
    } else {
      var rows = state.items.map(function (row, i) {
        return buildOneRow(row, i, false);
      }).join("");
      var listColgroup =
        "<colgroup>" +
        '<col class="fm-col-chk"/>' +
        '<col class="fm-col-agent"/>' +
        '<col class="fm-col-session"/>' +
        '<col class="fm-col-cat"/>' +
        '<col class="fm-col-time"/>' +
        '<col class="fm-col-imp"/>' +
        '<col class="fm-col-text"/>' +
        "</colgroup>";
      wrap.innerHTML =
        '<table class="mem-admin-table">' +
        listColgroup +
        "<thead><tr>" +
        '<th><input type="checkbox" id="chkAll"/></th>' +
        "<th>Agent</th><th>会话</th><th class='fm-th-cat'>记忆类型</th><th class='fm-th-time'>记忆时间</th><th class='fm-th-imp'>记忆权重</th><th>正文</th></tr></thead><tbody>" +
        rows +
        "</tbody></table>";
    }
    var masterChk = document.getElementById("chkAll");
    if (masterChk) {
      masterChk.onchange = function () {
        var on = masterChk.checked;
        document.querySelectorAll(".rowchk").forEach(function (c) {
          c.checked = on;
        });
        updateDeleteBtn();
      };
    }
    wrap.querySelectorAll(".batch-chk-all").forEach(function (bc) {
      bc.onchange = function () {
        var det = bc.closest("details");
        if (!det) {
          return;
        }
        var on = bc.checked;
        det.querySelectorAll(".rowchk").forEach(function (c) {
          c.checked = on;
        });
        updateDeleteBtn();
      };
    });
    document.querySelectorAll(".rowchk").forEach(function (c) {
      c.onchange = updateDeleteBtn;
    });
    updateDeleteBtn();
  }

  function renderPager() {
    var p = document.getElementById("pager");
    if (state.tab === "dash") {
      p.style.display = "none";
      p.innerHTML = "";
      return;
    }
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.total <= state.pageSize && state.page <= 1) {
      p.style.display = state.total ? "flex" : "none";
      p.innerHTML = state.total ? "<span>共 " + state.total + " 条</span>" : "";
      return;
    }
    p.style.display = "flex";
    p.innerHTML =
      "<span>共 " + state.total + " 条 · 第 " + state.page + " / " + pages + " 页</span>" +
      '<button type="button" id="pgPrev"' + (state.page <= 1 ? " disabled" : "") + ">上一页</button>" +
      '<button type="button" id="pgNext"' + (state.page >= pages ? " disabled" : "") + ">下一页</button>" +
      '<span class="pager-jump">' +
      '<label for="pgJumpInput">跳到</label>' +
      '<input type="number" id="pgJumpInput" min="1" max="' +
      pages +
      '" step="1" value="' +
      state.page +
      '"/>' +
      '<span class="pager-jump-suffix">页</span>' +
      '<button type="button" id="pgGo">跳转</button>' +
      "</span>";
    document.getElementById("pgPrev").onclick = function () { loadList(state.page - 1); };
    document.getElementById("pgNext").onclick = function () { loadList(state.page + 1); };
    function doJump() {
      var inp = document.getElementById("pgJumpInput");
      var n = parseInt(inp && inp.value, 10);
      if (!Number.isFinite(n)) {
        return;
      }
      n = Math.max(1, Math.min(pages, n));
      loadList(n);
    }
    document.getElementById("pgGo").onclick = doJump;
    document.getElementById("pgJumpInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        doJump();
      }
    });
  }

  function updateDeleteBtn() {
    var n = document.querySelectorAll(".rowchk:checked").length;
    document.getElementById("btnDeleteSelected").disabled = n === 0;
  }

  async function deleteSelected() {
    var sel = [];
    document.querySelectorAll(".rowchk:checked").forEach(function (c) {
      var i = parseInt(c.getAttribute("data-i"), 10);
      var row = state.items[i];
      if (row && row.agentId && row.id) sel.push({ agentId: row.agentId, id: row.id });
    });
    if (!sel.length) return;
    if (!window.confirm("确认永久删除所选 " + sel.length + " 条？此操作不可恢复。")) return;
    var r = await fetchMemoryApi("memory.admin.delete", { items: sel });
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      showBanner("err", (data && data.error) ? String(data.error) : "删除失败 " + r.status);
      return;
    }
    showBanner("info", "已删除 " + (data.deleted || 0) + " 条");
    await loadFacets({ autoLoad: false });
    if (state.tab === "dash") {
      await loadDashboard();
    } else {
      await loadList(state.page);
    }
  }

  async function addMemory() {
    var agentId = document.getElementById("addAgentId").value.trim();
    var category = document.getElementById("addCategory").value;
    var text = document.getElementById("addText").value;
    if (!agentId) {
      showBanner("err", "请填写 Agent ID");
      return;
    }
    if (!category) {
      showBanner("err", "请选择记忆类型");
      return;
    }
    if (!String(text).trim()) {
      showBanner("err", "请填写正文");
      return;
    }
    showBanner("", "");
    var r = await fetchMemoryApi("memory.admin.add", { agentId: agentId, category: category, text: text });
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      showBanner("err", (data && data.error) ? String(data.error) : "添加失败 " + r.status);
      return;
    }
    showBanner("info", "已插入记忆（未做去重/冲突检测）");
    document.getElementById("addText").value = "";
    closeInsertModal();
    await loadFacets({ autoLoad: false });
    if (state.selectedAgentId.trim() === agentId || state.selectedSessionId.trim() === "manual_insert") {
      if (state.tab === "dash") {
        await loadDashboard();
      } else {
        await loadList(1);
      }
    }
  }

  function onTabChange(tab) {
    if (tab === "full" && state.cfg && !state.cfg.enableFullContextMemory) return;
    if (tab === "self" && state.cfg && !state.cfg.enableSelfImprovingMemory) return;
    state.tab = tab;
    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    });
    var so = document.getElementById("sortOrder");
    if (so) {
      so.value = state.sortOrderByTab[tab] || "desc";
    }
    updateToolbarForTab();
    fillAddCategorySelect();
    if (tab === "dash") {
      loadDashboard();
      renderPager();
    } else {
      loadFacets();
    }
  }

  document.querySelectorAll(".tab").forEach(function (b) {
    b.onclick = function () { onTabChange(b.getAttribute("data-tab")); };
  });
  document.getElementById("agentId").addEventListener("change", function () {
    state.selectedAgentId = this.value.trim();
    maybeAutoLoadForCurrentTab();
  });
  document.getElementById("sessionId").addEventListener("change", function () {
    state.selectedSessionId = this.value.trim();
    maybeAutoLoadForCurrentTab();
  });
  document.getElementById("memoryTypeFilter").addEventListener("change", function () {
    if (state.tab === "dash") {
      return;
    }
    state.categoryFilterByTab[state.tab] = this.value.trim();
    loadList(1);
  });
  function onTimeFilterChange() {
    showBanner("", "");
    loadFacets();
  }
  function onTimeManualChange() {
    state.timeQuickMs = null;
    syncTimeRangeHighlight();
    onTimeFilterChange();
  }
  document.getElementById("timeFromInput").addEventListener("change", onTimeManualChange);
  document.getElementById("timeToInput").addEventListener("change", onTimeManualChange);
  document.getElementById("btnTime24h").onclick = function () {
    applyQuickRangeMs(24 * 3600 * 1000);
    onTimeFilterChange();
  };
  document.getElementById("btnTime7d").onclick = function () {
    applyQuickRangeMs(7 * 24 * 3600 * 1000);
    onTimeFilterChange();
  };
  document.getElementById("btnTime30d").onclick = function () {
    applyQuickRangeMs(30 * 24 * 3600 * 1000);
    onTimeFilterChange();
  };
  document.getElementById("sortOrder").addEventListener("change", function () {
    if (state.tab === "dash") {
      return;
    }
    state.sortOrderByTab[state.tab] = this.value;
    loadList(1);
  });
  document.getElementById("btnRefresh").onclick = function () {
    if (state.timeQuickMs != null) {
      applyQuickRangeMs(state.timeQuickMs);
    }
    if (state.tab === "dash") {
      loadDashboard();
    } else {
      loadList(1);
    }
  };
  document.getElementById("btnDeleteSelected").onclick = deleteSelected;
  document.getElementById("btnInsertMemory").onclick = openInsertModal;
  document.getElementById("btnModalCancel").onclick = closeInsertModal;
  document.getElementById("btnModalInsert").onclick = addMemory;
  document.getElementById("insertModal").addEventListener("click", function (e) {
    if (e.target === this) closeInsertModal();
  });
  function closeTextPeekModal() {
    var m = document.getElementById("textPeekModal");
    if (!m) return;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    var b = document.getElementById("textPeekBody");
    if (b) b.textContent = "";
    var titleEl = document.getElementById("textPeekTitle");
    if (titleEl) titleEl.textContent = "记忆召回信息";
  }
  document.getElementById("btnTextPeekClose").onclick = closeTextPeekModal;
  document.getElementById("textPeekModal").addEventListener("click", function (e) {
    if (e.target === this) closeTextPeekModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var pm = document.getElementById("textPeekModal");
    if (pm && pm.classList.contains("open")) {
      closeTextPeekModal();
      return;
    }
    if (document.getElementById("insertModal").classList.contains("open")) {
      closeInsertModal();
    }
  });

  function toggleTextCellPreview(cell) {
    var prev = cell.querySelector(".text-preview");
    if (!prev || prev.classList.contains("text-preview-short")) return;
    prev.classList.toggle("expanded");
    var hint = cell.querySelector(".text-hint");
    if (hint) {
      hint.textContent = prev.classList.contains("expanded") ? "点击上文或此处收起全文" : "点击上文或此处展开全文";
    }
  }

  document.getElementById("tableWrap").addEventListener("click", function (e) {
    var om = e.target.closest && e.target.closest(".inj-open-modal");
    if (om) {
      e.preventDefault();
      e.stopPropagation();
      var pre = om.nextElementSibling;
      if (pre && pre.tagName === "PRE") {
        document.getElementById("textPeekBody").textContent = pre.textContent;
        var titleEl = document.getElementById("textPeekTitle");
        if (titleEl) {
          titleEl.textContent = modalTitleForInjectClass(om.className || "");
        }
        document.getElementById("textPeekModal").classList.add("open");
        document.getElementById("textPeekModal").setAttribute("aria-hidden", "false");
      }
      return;
    }
    var hint = e.target.closest && e.target.closest(".text-hint");
    var cell = hint ? hint.closest(".text-cell") : e.target.closest && e.target.closest(".text-cell");
    if (!cell) return;
    if (e.target.closest && e.target.closest("input, button, a, label, summary")) return;
    if (hint || (e.target.closest && e.target.closest(".text-preview"))) {
      toggleTextCellPreview(cell);
    }
  });

  document.getElementById("tableWrap").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var prev = e.target.classList && e.target.classList.contains("text-preview") ? e.target : null;
    if (!prev || prev.classList.contains("text-preview-short")) return;
    e.preventDefault();
    var cell = prev.closest(".text-cell");
    if (cell) toggleTextCellPreview(cell);
  });

  applyQuickRangeMs(24 * 3600 * 1000);
  updateToolbarForTab();
  loadConfig()
    .then(function () { return loadFacets(); })
    .catch(function (e) {
      showBanner("err", String(e));
    });
})();
`;
  return s.replace(/<\/script/gi, "<\\/script");
}
