# GitHub-Repo-Radar

Pull live GitHub stats for any repositories and line them up side by side.

What It Does
Repo Radar is a single-file HTML tool that fetches and displays GitHub repository stats in a clean, side-by-side view. Perfect for comparing repos, tracking your projects, or keeping tabs on multiple repositories at once.

Features
Load individual repos — Add any public repo by username/repo-name
Bulk load — Pull all public repos from a GitHub user in one shot
Live stats — Stars, forks, open issues, last push date, primary language
Side-by-side comparison — See all your repos in a grid layout
Token support — Optional GitHub token for higher rate limits (60/hour without, 5000/hour with)
Zero dependencies — Just HTML, CSS, and vanilla JS. No build step, no npm, no frameworks.

Usage
Download repo-radar.html
Open it in any browser
Add repos or load all from a user
Done

Adding Repos
Individual repo:
Enter username/repo-name (e.g., torvalds/linux)
Click "Add"

All public repos from a user:
Enter a GitHub username
Click "Load All"
GitHub Token (Optional)
Without a token, you're limited to 60 API requests per hour. If you're tracking a lot of repos, add a token:

Click the "Token" button
Paste your GitHub personal access token
No special scopes needed — just basic read access
The token is stored in your browser's localStorage and never leaves your machine.

Deployment
This is a static file. Host it anywhere:

GitHub Pages — Push to a repo, enable Pages
Netlify Drop — Drag and drop at app.netlify.com/drop
Vercel — Deploy via CLI or GitHub integration
S3 + CloudFront — Upload as a static asset
Tech Stack
Vanilla JavaScript
GitHub REST API
IBM Plex Sans / Space Grotesk fonts
Zero build tools
License
MIT (or whatever you want — it's a single file, do what you want with it)
