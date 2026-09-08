import { useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line,
} from "recharts";
import { Plus, X, Key, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

const PALETTE = ["#2F6F4F", "#C1622D", "#6B7A8F", "#8A6D3B", "#3E7C8C", "#9C5B5B"];

const GH = "https://api.github.com";

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } : { Accept: "application/vnd.github+json" };
}

async function fetchJson(url, token) {
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 202) return { pending: true };
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchWithRetry(url, token, tries = 3, delayMs = 1200) {
  for (let i = 0; i < tries; i++) {
    const data = await fetchJson(url, token);
    if (!data || !data.pending) return data;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

function parseRepoInput(raw) {
  let s = raw.trim();
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.replace(/\.git$/i, "").replace(/\/$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1], key: `${parts[0]}/${parts[1]}` };
}

function bytesToPercent(languages) {
  const total = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(languages)
    .map(([name, bytes]) => ({ name, pct: (bytes / total) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
}

function formatCompact(n) {
  if (n == null) return "\u2014";
  return Intl.NumberFormat("en", { notation: "compact" }).format(n);
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function RepoRadar() {
  const [input, setInput] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [repos, setRepos] = useState([]);
  const [data, setData] = useState({});
  const [loadingKeys, setLoadingKeys] = useState({});
  const [errors, setErrors] = useState({});
  const [rateLimit, setRateLimit] = useState(null);

  const loadRepo = useCallback(async (key, owner, repo, tok) => {
    setLoadingKeys((s) => ({ ...s, [key]: true }));
    setErrors((s) => ({ ...s, [key]: null }));
    try {
      const base = await fetchJson(`${GH}/repos/${owner}/${repo}`, tok);

      const remaining = base && base.message ? null : null;

      let languages = {};
      try {
        languages = await fetchJson(`${GH}/repos/${owner}/${repo}/languages`, tok);
      } catch (e) { /* non-fatal */ }

      let commitActivity = null;
      try {
        commitActivity = await fetchWithRetry(`${GH}/repos/${owner}/${repo}/stats/commit_activity`, tok, 2, 1000);
      } catch (e) { /* non-fatal */ }

      let contributorsCount = null;
      try {
        const contributors = await fetchWithRetry(`${GH}/repos/${owner}/${repo}/contributors?per_page=100&anon=1`, tok, 2, 1000);
        if (Array.isArray(contributors)) contributorsCount = contributors.length;
      } catch (e) { /* non-fatal */ }

      setData((s) => ({
        ...s,
        [key]: {
          owner, repo,
          name: base.full_name || key,
          description: base.description || "",
          stars: base.stargazers_count,
          forks: base.forks_count,
          watchers: base.subscribers_count,
          openIssues: base.open_issues_count,
          language: base.language,
          languages: bytesToPercent(languages || {}),
          sizeKb: base.size,
          license: base.license ? base.license.spdx_id : null,
          pushedAt: base.pushed_at,
          createdAt: base.created_at,
          defaultBranch: base.default_branch,
          contributorsCount,
          commitActivity: Array.isArray(commitActivity)
            ? commitActivity.slice(-26).map((w, i) => ({ week: i, commits: w.total }))
            : null,
        },
      }));
    } catch (e) {
      setErrors((s) => ({ ...s, [key]: e.message || "Failed to load" }));
    } finally {
      setLoadingKeys((s) => ({ ...s, [key]: false }));
    }
  }, []);

  const addRepo = () => {
    const parsed = parseRepoInput(input);
    if (!parsed) {
      setErrors((s) => ({ ...s, __input: "Enter as owner/repo or a github.com URL" }));
      return;
    }
    setErrors((s) => ({ ...s, __input: null }));
    if (repos.some((r) => r.key === parsed.key)) {
      setInput("");
      return;
    }
    setRepos((r) => [...r, parsed]);
    setInput("");
    loadRepo(parsed.key, parsed.owner, parsed.repo, token);
  };

  const removeRepo = (key) => {
    setRepos((r) => r.filter((x) => x.key !== key));
    setData((s) => { const n = { ...s }; delete n[key]; return n; });
    setErrors((s) => { const n = { ...s }; delete n[key]; return n; });
  };

  const refreshAll = () => {
    repos.forEach((r) => loadRepo(r.key, r.owner, r.repo, token));
  };

  const loaded = repos.map((r) => data[r.key]).filter(Boolean);

  const comparisonSeries = loaded.map((d) => ({
    name: d.name.length > 18 ? d.name.slice(0, 17) + "\u2026" : d.name,
    stars: d.stars, forks: d.forks, issues: d.openIssues,
  }));

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      background: "#EDEFEA",
      color: "#1B1F1C",
      minHeight: "100%",
      padding: "0",
      backgroundImage:
        "linear-gradient(#D8DBD2 1px, transparent 1px), linear-gradient(90deg, #D8DBD2 1px, transparent 1px)",
      backgroundSize: "28px 28px",
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 64px" }}>

        <header style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 34, fontWeight: 700, margin: 0, letterSpacing: "-0.01em",
            }}>
              Repo Radar
            </h1>
            <p style={{ margin: "6px 0 0", color: "#5A6459", fontSize: 14, maxWidth: 480 }}>
              Pull live GitHub stats for any repositories and line them up side by side.
            </p>
          </div>
          {rateLimit && (
            <div style={{ fontSize: 12, color: "#6B7A8F", fontFamily: "'IBM Plex Mono', monospace" }}>
              {rateLimit}
            </div>
          )}
        </header>

        <div style={{
          background: "#F7F8F4",
          border: "1px solid #C9CDBF",
          padding: 18,
          marginBottom: 24,
          position: "relative",
        }}>
          <CornerTicks />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRepo()}
              placeholder="owner/repo, e.g. facebook/react"
              style={{
                flex: "1 1 260px", padding: "10px 12px", fontSize: 14,
                border: "1px solid #B7BCAC", background: "#fff", color: "#1B1F1C",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
            <button
              onClick={addRepo}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
                background: "#2F6F4F", color: "#fff", border: "none", fontSize: 14,
                fontWeight: 500, cursor: "pointer",
              }}
            >
              <Plus size={16} /> Add
            </button>
            {repos.length > 0 && (
              <button
                onClick={refreshAll}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 14px",
                  background: "transparent", color: "#1B1F1C", border: "1px solid #B7BCAC",
                  fontSize: 14, cursor: "pointer",
                }}
              >
                <RefreshCw size={15} /> Refresh
              </button>
            )}
            <button
              onClick={() => setShowToken((s) => !s)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "10px 14px",
                background: "transparent", color: "#5A6459", border: "1px solid transparent",
                fontSize: 13, cursor: "pointer",
              }}
            >
              <Key size={14} /> Token {showToken ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          {errors.__input && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#C1622D", display: "flex", gap: 6, alignItems: "center" }}>
              <AlertTriangle size={14} /> {errors.__input}
            </div>
          )}
          {showToken && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #DADFCF" }}>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Personal access token (optional, kept in-memory only)"
                style={{
                  width: "100%", padding: "9px 12px", fontSize: 13,
                  border: "1px solid #B7BCAC", background: "#fff", fontFamily: "'IBM Plex Mono', monospace",
                  boxSizing: "border-box",
                }}
              />
              <p style={{ fontSize: 12, color: "#6B7A8F", margin: "6px 0 0" }}>
                Unauthenticated requests are capped at 60/hour. A token raises that to 5000/hour and is never stored beyond this session.
              </p>
            </div>
          )}
        </div>

        {repos.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9086" }}>
            <p style={{ fontSize: 14 }}>Add a repository to start comparing. Try <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>vuejs/core</code> or <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>scrapy/scrapy</code>.</p>
          </div>
        )}

        {repos.length > 0 && (
          <>
            <section style={{ marginBottom: 28, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #1B1F1C" }}>
                    {["Repository", "Stars", "Forks", "Issues", "Watchers", "Language", "Contributors", "Last push", "License", ""].map((h) => (
                      <th key={h} style={{ textAlign: h === "Repository" ? "left" : "right", padding: "8px 10px", fontWeight: 500, color: "#5A6459" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {repos.map((r, i) => {
                    const d = data[r.key];
                    const err = errors[r.key];
                    const loading = loadingKeys[r.key];
                    return (
                      <tr key={r.key} style={{ borderBottom: "1px solid #DADFCF" }}>
                        <td style={{ padding: "10px", fontFamily: "'IBM Plex Mono', monospace" }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, background: PALETTE[i % PALETTE.length], marginRight: 8 }} />
                          {r.key}
                        </td>
                        {loading ? (
                          <td colSpan={8} style={{ padding: "10px", textAlign: "center", color: "#8A9086" }}>Loading\u2026</td>
                        ) : err ? (
                          <td colSpan={8} style={{ padding: "10px", textAlign: "center", color: "#C1622D" }}>{err}</td>
                        ) : d ? (
                          <>
                            <td style={{ padding: "10px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{formatCompact(d.stars)}</td>
                            <td style={{ padding: "10px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{formatCompact(d.forks)}</td>
                            <td style={{ padding: "10px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{formatCompact(d.openIssues)}</td>
                            <td style={{ padding: "10px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{formatCompact(d.watchers)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{d.language || "\u2014"}</td>
                            <td style={{ padding: "10px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{d.contributorsCount != null ? formatCompact(d.contributorsCount) : "\u2014"}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{daysAgo(d.pushedAt) != null ? `${daysAgo(d.pushedAt)}d ago` : "\u2014"}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{d.license || "\u2014"}</td>
                          </>
                        ) : (
                          <td colSpan={8} style={{ padding: "10px", textAlign: "center", color: "#8A9086" }}>\u2014</td>
                        )}
                        <td style={{ padding: "10px", textAlign: "right" }}>
                          <button onClick={() => removeRepo(r.key)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A9086" }}>
                            <X size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {comparisonSeries.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <SectionLabel>Stars, forks and open issues</SectionLabel>
                <div style={{ height: 280, background: "#F7F8F4", border: "1px solid #C9CDBF", padding: "16px 12px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonSeries} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke="#DADFCF" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} stroke="#8A9086" />
                      <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} stroke="#8A9086" />
                      <Tooltip contentStyle={{ fontSize: 12, fontFamily: "IBM Plex Mono" }} />
                      <Bar dataKey="stars" fill="#2F6F4F" />
                      <Bar dataKey="forks" fill="#C1622D" />
                      <Bar dataKey="issues" fill="#6B7A8F" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {loaded.length > 0 && (
              <section>
                <SectionLabel>Per-repository detail</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                  {loaded.map((d, i) => (
                    <div key={d.name} style={{ background: "#F7F8F4", border: "1px solid #C9CDBF", padding: 16, position: "relative" }}>
                      <CornerTicks />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 8, height: 8, background: PALETTE[i % PALETTE.length] }} />
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 500 }}>{d.name}</span>
                      </div>
                      {d.description && <p style={{ fontSize: 12.5, color: "#5A6459", margin: "0 0 12px" }}>{d.description}</p>}

                      {d.languages.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", height: 8, width: "100%", overflow: "hidden", marginBottom: 6 }}>
                            {d.languages.map((l, j) => (
                              <div key={l.name} style={{ width: `${l.pct}%`, background: PALETTE[j % PALETTE.length] }} />
                            ))}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "#5A6459" }}>
                            {d.languages.map((l, j) => (
                              <span key={l.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 6, height: 6, background: PALETTE[j % PALETTE.length], display: "inline-block" }} />
                                {l.name} {l.pct.toFixed(0)}%
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {d.commitActivity && (
                        <div style={{ height: 60 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={d.commitActivity}>
                              <Line type="monotone" dataKey="commits" stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                          <div style={{ fontSize: 10.5, color: "#8A9086", marginTop: 2 }}>weekly commits, last 26 weeks</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#5A6459",
      marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #C9CDBF",
    }}>
      {children}
    </div>
  );
}

function CornerTicks() {
  const s = { position: "absolute", width: 8, height: 8, borderColor: "#8A9086" };
  return (
    <>
      <span style={{ ...s, top: -1, left: -1, borderTop: "1px solid", borderLeft: "1px solid" }} />
      <span style={{ ...s, top: -1, right: -1, borderTop: "1px solid", borderRight: "1px solid" }} />
      <span style={{ ...s, bottom: -1, left: -1, borderBottom: "1px solid", borderLeft: "1px solid" }} />
      <span style={{ ...s, bottom: -1, right: -1, borderBottom: "1px solid", borderRight: "1px solid" }} />
    </>
  );
}
