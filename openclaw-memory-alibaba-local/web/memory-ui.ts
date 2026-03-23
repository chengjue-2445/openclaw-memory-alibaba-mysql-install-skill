/**
 * Single-page admin UI for /plugins/memory (inline HTML/CSS/JS).
 */

export function getMemoryPanelHtml(): string {
  const css = `
:root { font-family: system-ui, sans-serif; color: #e8e8ec; background: #0f1115; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; max-width: 1400px; margin-inline: auto; }
h1 { font-size: 1.25rem; margin: 0 0 12px; font-weight: 600; }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
.toolbar label { font-size: 0.85rem; color: #a8acb8; }
.toolbar input, .toolbar select, .toolbar button {
  background: #1a1d24; border: 1px solid #2d3340; color: #e8e8ec; border-radius: 6px; padding: 6px 10px; font-size: 0.875rem;
}
.toolbar button { cursor: pointer; }
.toolbar button:hover { background: #242830; }
.toolbar button:disabled { opacity: 0.45; cursor: not-allowed; }
.tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #2d3340; padding-bottom: 8px; }
.tab {
  padding: 8px 14px; border-radius: 6px 6px 0 0; cursor: pointer; color: #8b90a0; border: none;
  background: transparent; font-size: 0.9rem;
}
.tab.active { background: #1a1d24; color: #e8e8ec; border: 1px solid #2d3340; border-bottom-color: #1a1d24; margin-bottom: -9px; }
.tab:disabled { opacity: 0.4; cursor: not-allowed; }
.banner { padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 0.875rem; display: none; }
.banner.err { display: block; background: #3d1f24; border: 1px solid #8b3a44; color: #ffb4bc; }
.banner.info { display: block; background: #1f2d3d; border: 1px solid #3a5a8b; color: #b4d4ff; }
table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2d3340; vertical-align: top; }
th { color: #8b90a0; font-weight: 500; }
tr:hover td { background: #161920; }
.text-preview { max-width: 420px; max-height: 4.5em; overflow: hidden; word-break: break-word; }
.pager { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.mono { font-family: ui-monospace, monospace; font-size: 0.78rem; }
.empty { color: #6b7080; padding: 24px; text-align: center; }
`;

  const js = buildClientScript();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>OpenClaw 记忆管理</title>
<style>${css}</style>
</head>
<body>
<h1>OpenClaw 记忆管理</h1>
<div id="banner" class="banner"></div>
<div class="tabs" id="tabs">
  <button type="button" class="tab active" data-tab="user">用户记忆</button>
  <button type="button" class="tab" data-tab="full">全文记忆</button>
  <button type="button" class="tab" data-tab="self">自进化记忆</button>
</div>
<div class="toolbar">
  <label>时间</label>
  <select id="timePreset">
    <option value="24h" selected>最近 24 小时</option>
    <option value="7d">最近 7 天</option>
    <option value="30d">最近 30 天</option>
    <option value="all">全部</option>
  </select>
  <label>agent</label>
  <select id="agentId"><option value="">（请选择）</option></select>
  <label>session</label>
  <select id="sessionId"><option value="">（请选择）</option></select>
  <label><input type="checkbox" id="includeDeleted"/> 展示已删除</label>
  <button type="button" id="btnRefresh">刷新列表</button>
  <button type="button" id="btnSoftDelete" disabled>软删所选</button>
</div>
<div id="tableWrap"></div>
<div class="pager" id="pager" style="display:none"></div>
<script>${js}</script>
</body>
</html>`;
}

function buildClientScript(): string {
  const s = `
(function () {
  var API_BASE = window.location.pathname.replace(/\\/+$/, "") + "/api";
  var params = new URLSearchParams(window.location.search);
  var token = params.get("token");

  function withAuth(url) {
    var u = url.indexOf("?") >= 0 ? url + "&" : url + "?";
    if (token) { u += "token=" + encodeURIComponent(token) + "&"; }
    return u.replace(/[&?]$/, "").replace("?&", "?");
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

  var state = {
    tab: "user",
    cfg: null,
    page: 1,
    pageSize: 100,
    total: 0,
    items: [],
    loading: false
  };

  function timeBounds() {
    var preset = document.getElementById("timePreset").value;
    var now = Date.now();
    if (preset === "all") return { timeFrom: "", timeTo: "" };
    var ms = 24 * 3600 * 1000;
    if (preset === "7d") ms *= 7;
    if (preset === "30d") ms *= 30;
    return {
      timeFrom: new Date(now - ms).toISOString(),
      timeTo: new Date(now).toISOString()
    };
  }

  function facetQuery() {
    var t = timeBounds();
    var q = new URLSearchParams();
    q.set("tab", state.tab);
    if (t.timeFrom) q.set("timeFrom", t.timeFrom);
    if (t.timeTo) q.set("timeTo", t.timeTo);
    if (document.getElementById("includeDeleted").checked) q.set("includeDeleted", "1");
    return withAuth(API_BASE + "/facets?" + q.toString());
  }

  function listQuery(page) {
    var t = timeBounds();
    var q = new URLSearchParams();
    q.set("tab", state.tab);
    var aid = document.getElementById("agentId").value.trim();
    var sid = document.getElementById("sessionId").value.trim();
    if (aid) q.set("agentId", aid);
    if (sid) q.set("sessionId", sid);
    if (t.timeFrom) q.set("timeFrom", t.timeFrom);
    if (t.timeTo) q.set("timeTo", t.timeTo);
    if (document.getElementById("includeDeleted").checked) q.set("includeDeleted", "1");
    q.set("page", String(page || 1));
    q.set("limit", String(state.pageSize));
    return withAuth(API_BASE + "/list?" + q.toString());
  }

  async function loadConfig() {
    var r = await fetch(withAuth(API_BASE + "/config"));
    if (!r.ok) throw new Error("config " + r.status);
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
  }

  async function loadFacets() {
    showBanner("", "");
    var r = await fetch(facetQuery());
    if (!r.ok) {
      var err = await r.text();
      showBanner("err", "加载下拉失败: " + r.status + " " + err);
      return;
    }
    var data = await r.json();
    var agents = data.agents || [];
    var sessions = data.sessions || [];
    var selA = document.getElementById("agentId");
    var selS = document.getElementById("sessionId");
    var prevA = selA.value;
    var prevS = selS.value;
    selA.innerHTML = '<option value="">（请选择）</option>';
    selS.innerHTML = '<option value="">（请选择）</option>';
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
    if (prevA && Array.prototype.some.call(selA.options, function (o) { return o.value === prevA; })) selA.value = prevA;
    if (prevS && Array.prototype.some.call(selS.options, function (o) { return o.value === prevS; })) selS.value = prevS;
  }

  async function loadList(page) {
    var aid = document.getElementById("agentId").value.trim();
    var sid = document.getElementById("sessionId").value.trim();
    if (!aid && !sid) {
      showBanner("info", "请至少选择 agent 或 session。");
      document.getElementById("tableWrap").innerHTML = '<p class="empty">请选择 agent 或 session 后刷新。</p>';
      document.getElementById("pager").style.display = "none";
      return;
    }
    showBanner("", "");
    state.loading = true;
    state.page = page || 1;
    try {
      var r = await fetch(listQuery(state.page));
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

  function renderTable() {
    var wrap = document.getElementById("tableWrap");
    var incDel = document.getElementById("includeDeleted").checked;
    if (!state.items.length) {
      wrap.innerHTML = '<p class="empty">暂无数据</p>';
      return;
    }
    var rows = state.items.map(function (row, i) {
      var del = incDel ? '<td>' + esc(row.isDeleted != null ? row.isDeleted : "") + "</td>" : "";
      return (
        "<tr>" +
        '<td><input type="checkbox" class="rowchk" data-i="' + i + '"/></td>' +
        '<td class="mono">' + esc(row.id) + "</td>" +
        '<td class="mono">' + esc(row.agentId) + "</td>" +
        '<td class="mono">' + esc(row.sessionId) + "</td>" +
        "<td>" + esc(row.category) + "</td>" +
        "<td>" + esc(new Date(row.createdAt).toLocaleString()) + "</td>" +
        "<td>" + esc(row.importance) + "</td>" +
        del +
        '<td><div class="text-preview">' + esc(row.text) + "</div></td>" +
        "</tr>"
      );
    }).join("");
    var headDel = incDel ? "<th>已删</th>" : "";
    wrap.innerHTML =
      "<table><thead><tr>" +
      '<th><input type="checkbox" id="chkAll"/></th>' +
      "<th>id</th><th>agent</th><th>session</th><th>category</th><th>created</th><th>importance</th>" +
      headDel +
      "<th>text</th></tr></thead><tbody>" +
      rows +
      "</tbody></table>";
    document.getElementById("chkAll").onchange = function () {
      var on = this.checked;
      document.querySelectorAll(".rowchk").forEach(function (c) { c.checked = on; });
      updateDeleteBtn();
    };
    document.querySelectorAll(".rowchk").forEach(function (c) {
      c.onchange = updateDeleteBtn;
    });
    updateDeleteBtn();
  }

  function renderPager() {
    var p = document.getElementById("pager");
    if (state.total <= state.pageSize && state.page <= 1) {
      p.style.display = state.total ? "flex" : "none";
      p.innerHTML = state.total ? "<span>共 " + state.total + " 条</span>" : "";
      return;
    }
    p.style.display = "flex";
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    p.innerHTML =
      "<span>共 " + state.total + " 条 · 第 " + state.page + " / " + pages + " 页</span>" +
      '<button type="button" id="pgPrev"' + (state.page <= 1 ? " disabled" : "") + ">上一页</button>" +
      '<button type="button" id="pgNext"' + (state.page >= pages ? " disabled" : "") + ">下一页</button>";
    document.getElementById("pgPrev").onclick = function () { loadList(state.page - 1); };
    document.getElementById("pgNext").onclick = function () { loadList(state.page + 1); };
  }

  function updateDeleteBtn() {
    var n = document.querySelectorAll(".rowchk:checked").length;
    document.getElementById("btnSoftDelete").disabled = n === 0;
  }

  async function softDelete() {
    var sel = [];
    document.querySelectorAll(".rowchk:checked").forEach(function (c) {
      var i = parseInt(c.getAttribute("data-i"), 10);
      var row = state.items[i];
      if (row && row.agentId && row.id) sel.push({ agentId: row.agentId, id: row.id });
    });
    if (!sel.length) return;
    if (!window.confirm("确认软删除所选 " + sel.length + " 条？")) return;
    var body = JSON.stringify({ items: sel });
    var r = await fetch(withAuth(API_BASE + "/soft-delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    });
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      showBanner("err", (data && data.error) ? String(data.error) : "删除失败 " + r.status);
      return;
    }
    showBanner("info", "已更新 " + (data.updated || 0) + " 条");
    await loadFacets();
    await loadList(state.page);
  }

  function onTabChange(tab) {
    if (tab === "full" && state.cfg && !state.cfg.enableFullContextMemory) return;
    if (tab === "self" && state.cfg && !state.cfg.enableSelfImprovingMemory) return;
    state.tab = tab;
    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    });
    loadFacets();
  }

  document.querySelectorAll(".tab").forEach(function (b) {
    b.onclick = function () { onTabChange(b.getAttribute("data-tab")); };
  });
  document.getElementById("timePreset").onchange = function () { loadFacets(); };
  document.getElementById("includeDeleted").onchange = function () { loadFacets(); };
  document.getElementById("btnRefresh").onclick = function () { loadList(1); };
  document.getElementById("btnSoftDelete").onclick = softDelete;

  loadConfig()
    .then(function () { return loadFacets(); })
    .catch(function (e) {
      showBanner("err", String(e));
    });
})();
`;
  return s.replace(/<\/script/gi, "<\\/script");
}
