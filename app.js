document.addEventListener("DOMContentLoaded", () => {
  const SUPABASE_URL = "https://mjrgmppirvmwevxyabgp.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcmdtcHBpcnZtd2V2eHlhYmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDc4NTEsImV4cCI6MjA4ODMyMzg1MX0.TPXBPXQxAHSvHQFTNYzUK2TBfx3pkorFSUGJd3qEYJU";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function renderRows(data,listName) {
    if (!data || !data.length) {
      return `<div class="small mono">No entries for this mode.</div>`;
    }
    
    classChange = ""

  switch (listName) {
    case leaderboardList3Win:
      classChange = "ListThreeWin"
      break;

      case leaderboardList2Win:
      classChange = "ListTwoWin"
      break;
      
      case leaderboardList3Mac:
      classChange = "ListThreeMac"
      break;
      
      case leaderboardListCustom:
      classChange = "ListCustom"
      break;
  
    default:
      break;
  }

    return data.map((row, i) => {
      let medal = `${i + 1}.`;
      if (i === 0) medal = "🥇";
      else if (i === 1) medal = "🥈";
      else if (i === 2) medal = "🥉";

      return `
        <div class="logItem ${classChange}" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <span class="small leaderboardName"><b>${medal}</b> ${escapeHtml(row.name || "Player")}</span>
            
          </div>

          <div class="small mono " style="margin-top:4px;">
            Acc: ${row.accuracy ?? 0}% ·
            Time: ${escapeHtml(row.time_text || "—")} ·
            Avg: ${row.avg_speed_ms != null ? `${row.avg_speed_ms} ms` : "—"}
          </div>
        </div>
      `;
    }).join("");
  }

  const leaderboards = [
    {
      name: "3Win",
      table: "scores",   // <- replace with exact table name
      filterEl: document.getElementById("lbModeFilter3Win"),
      listEl: document.getElementById("leaderboardList3Win"),
      statusEl: document.getElementById("lbStatus3Win"),
    },
    {
      name: "3Mac",
      table: "scores_mac",   // <- replace with exact table name
      filterEl: document.getElementById("lbModeFilter3Mac"),
      listEl: document.getElementById("leaderboardList3Mac"),
      statusEl: document.getElementById("lbStatus3Mac"),
    },
    {
      name: "2Win",
      table: "scores_2win",   // <- replace with exact table name
      filterEl: document.getElementById("lbModeFilter2Win"),
      listEl: document.getElementById("leaderboardList2Win"),
      statusEl: document.getElementById("lbStatus2Win"),
    },
    {
      name: "Custom",
      table: "scores_custom", // <- replace with exact table name
      filterEl: document.getElementById("lbModeFilterCustom"),
      listEl: document.getElementById("leaderboardListCustom"),
      statusEl: document.getElementById("lbStatusCustom"),
    }
  ];

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    leaderboards.forEach(({ listEl, statusEl, name }) => {
      if (statusEl) statusEl.textContent = "offline";
      if (listEl) {
        listEl.innerHTML = `<div class="small mono">${name}: Supabase library not loaded</div>`;
      }
    });
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function loadLeaderboard(cfg) {
    const { name, table, filterEl, listEl, statusEl } = cfg;

    if (!listEl || !statusEl) return;

    statusEl.textContent = "loading";
    listEl.innerHTML = `<div class="small mono">Loading...</div>`;

    try {
      const selectedMode = filterEl ? filterEl.value : "all";

      let query = sb
        .from(table)
        .select("name, score, accuracy, time_text, time_ms, mode, avg_speed_ms");

      if (selectedMode !== "all") {
        query = query.eq("mode", selectedMode);
      }

      const { data, error } = await query
        .order("score", { ascending: false })
        .limit(5);

      if (error) {
        statusEl.textContent = "offline";
        listEl.innerHTML = `<div class="small mono">${name}: ${escapeHtml(error.message || "Query failed")}</div>`;
        return;
      }

      statusEl.textContent = "online";
      listEl.innerHTML = renderRows(data,listEl);
    } catch (err) {
      statusEl.textContent = "offline";
      listEl.innerHTML = `<div class="small mono">${name}: ${escapeHtml(err.message || "Unexpected error")}</div>`;
    }
  }

  leaderboards.forEach((cfg) => {
    if (cfg.filterEl) {
      cfg.filterEl.addEventListener("change", () => loadLeaderboard(cfg));
    }
  });

  Promise.all(leaderboards.map(loadLeaderboard));
});