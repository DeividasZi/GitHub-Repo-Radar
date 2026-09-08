import streamlit as st
import requests
from datetime import datetime, timezone

st.set_page_config(page_title="Repo Radar", page_icon="📡", layout="wide")

GH_API = "https://api.github.com"

# --- Helper Functions ---
def get_headers(token=None):
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

def parse_repo_input(raw):
    s = raw.strip().replace("https://github.com/", "").replace("http://github.com/", "")
    s = s.rstrip("/").removesuffix(".git")
    parts = [p for p in s.split("/") if p]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return None, None

def parse_user_input(raw):
    s = raw.strip().replace("https://github.com/", "").replace("http://github.com/", "")
    s = s.replace("orgs/", "").rstrip("/").removesuffix(".git")
    parts = [p for p in s.split("/") if p]
    return parts[0] if parts else None

def format_compact(n):
    if n is None:
        return "—"
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}k"
    return str(n)

def days_ago(date_str):
    if not date_str:
        return "—"
    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    diff = datetime.now(timezone.utc) - dt
    return diff.days

def fetch_repo_data(owner, repo, token):
    headers = get_headers(token)
    res = requests.get(f"{GH_API}/repos/{owner}/{repo}", headers=headers)
    if res.status_code != 200:
        msg = res.json().get("message", res.reason)
        return {"error": f"{res.status_code}: {msg}"}
    
    base = res.json()
    
    # Languages
    langs_res = requests.get(f"{GH_API}/repos/{owner}/{repo}/languages", headers=headers)
    top_langs = []
    if langs_res.status_code == 200:
        languages = langs_res.json()
        total_bytes = sum(languages.values()) or 1
        sorted_langs = sorted(languages.items(), key=lambda x: x[1], reverse=True)[:4]
        top_langs = [{"name": name, "pct": (b / total_bytes) * 100} for name, b in sorted_langs]
    
    # Commit participation
    commit_total = None
    commits_res = requests.get(f"{GH_API}/repos/{owner}/{repo}/stats/participation", headers=headers)
    if commits_res.status_code == 200:
        commit_data = commits_res.json()
        if "all" in commit_data:
            commit_total = sum(commit_data["all"])

    # Traffic clones/views (only with push access / personal token)
    clones = None
    views = None
    if token:
        c_res = requests.get(f"{GH_API}/repos/{owner}/{repo}/traffic/clones", headers=headers)
        if c_res.status_code == 200:
            clones = c_res.json()
        v_res = requests.get(f"{GH_API}/repos/{owner}/{repo}/traffic/views", headers=headers)
        if v_res.status_code == 200:
            views = v_res.json()

    return {
        "key": f"{owner}/{repo}",
        "description": base.get("description") or "No description provided.",
        "stars": base.get("stargazers_count", 0),
        "forks": base.get("forks_count", 0),
        "open_issues": base.get("open_issues_count", 0),
        "watchers": base.get("subscribers_count", 0),
        "languages": top_langs,
        "size_kb": base.get("size", 0),
        "pushed_at": base.get("pushed_at"),
        "commits_year": commit_total,
        "clones": clones,
        "views": views
    }

# --- State ---
if "repos" not in st.session_state:
    st.session_state.repos = {}

# --- UI Header ---
st.title("📡 Repo Radar")
st.caption("Pull live GitHub stats for any repositories and line them up side by side.")

with st.expander("🔑 GitHub Token (Optional)", expanded=False):
    token = st.text_input("Personal Access Token", type="password", help="Increases rate limit from 60/hr to 5,000/hr and unlocks traffic stats.")

col1, col2 = st.columns([1, 1])

# Input 1: Add individual repo
with col1:
    with st.container(border=True):
        st.subheader("Add Individual Repo")
        repo_input = st.text_input("Repo URL or owner/repo", placeholder="facebook/react or full URL")
        if st.button("➕ Add Repo", use_container_width=True):
            owner, repo = parse_repo_input(repo_input)
            if owner and repo:
                key = f"{owner}/{repo}"
                with st.spinner(f"Loading {key}..."):
                    st.session_state.repos[key] = fetch_repo_data(owner, repo, token)
                st.rerun()
            else:
                st.error("Invalid repo format. Use owner/repo or a github.com URL.")

# Input 2: Load all user repos
with col2:
    with st.container(border=True):
        st.subheader("Load All Public Repos")
        user_input = st.text_input("GitHub Username or Org", placeholder="octocat or profile URL")
        if st.button("👥 Load All Repos", use_container_width=True):
            user = parse_user_input(user_input)
            if user:
                with st.spinner(f"Fetching public repos for {user}..."):
                    headers = get_headers(token)
                    page = 1
                    all_fetched = []
                    while True:
                        r = requests.get(f"{GH_API}/users/{user}/repos?type=public&per_page=100&page={page}", headers=headers)
                        if r.status_code != 200:
                            st.error(f"Error fetching repos: {r.status_code}")
                            break
                        items = r.json()
                        if not items or not isinstance(items, list):
                            break
                        all_fetched.extend(items)
                        if len(items) < 100:
                            break
                        page += 1
                    
                    for item in all_fetched:
                        k = f"{item['owner']['login']}/{item['name']}"
                        if k not in st.session_state.repos:
                            st.session_state.repos[k] = fetch_repo_data(item['owner']['login'], item['name'], token)
                st.rerun()
            else:
                st.error("Invalid username or URL.")

if st.session_state.repos:
    col_clear, col_ref = st.columns([1, 5])
    with col_clear:
        if st.button("🗑️ Clear All"):
            st.session_state.repos.clear()
            st.rerun()

st.divider()

# --- Cards Display ---
if not st.session_state.repos:
    st.info("Add a repository or load all public repos from a user to get started.")
else:
    repo_keys = list(st.session_state.repos.keys())
    # Display in a 3-column responsive grid
    cols = st.columns(3)
    for idx, key in enumerate(repo_keys):
        data = st.session_state.repos[key]
        with cols[idx % 3]:
            with st.container(border=True):
                top_c1, top_c2 = st.columns([5, 1])
                with top_c1:
                    st.markdown(f"**[{key}](https://github.com/{key})**")
                with top_c2:
                    if st.button("✕", key=f"del_{key}"):
                        del st.session_state.repos[key]
                        st.rerun()

                if "error" in data:
                    st.error(f"⚠️ {data['error']}")
                else:
                    st.caption(data["description"])

                    # Stats Grid
                    s1, s2, s3, s4 = st.columns(4)
                    s1.metric("Stars", format_compact(data["stars"]))
                    s2.metric("Forks", format_compact(data["forks"]))
                    s3.metric("Issues", format_compact(data["open_issues"]))
                    s4.metric("Watchers", format_compact(data["watchers"]))

                    # Languages
                    if data["languages"]:
                        st.write("**Languages**")
                        for l in data["languages"]:
                            st.progress(min(l["pct"] / 100.0, 1.0), text=f"{l['name']}: {l['pct']:.1f}%")

                    # Traffic & Commits
                    st.caption(f"Updated {days_ago(data['pushed_at'])} days ago • {format_compact(data['size_kb'])} KB")
                    if data.get("commits_year") is not None:
                        st.caption(f"Commits (year): **{format_compact(data['commits_year'])}**")

                    if data.get("views") or data.get("clones"):
                        v_cnt = data["views"].get("count", 0) if data.get("views") else 0
                        c_cnt = data["clones"].get("count", 0) if data.get("clones") else 0
                        st.caption(f"Views: **{format_compact(v_cnt)}** | Clones: **{format_compact(c_cnt)}**")
