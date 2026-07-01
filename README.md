# SkillTrends

> 发现、追踪、探索 GitHub 上最热门的 Agent Skills 仓库。
> Discover, track, and explore the most popular Agent Skills repositories on GitHub.

[English](#english) | [中文](#中文)

---

## 中文

### 简介

SkillTrends 是一个专门用于追踪 GitHub 上 Agent Skills 生态的开源项目。自动采集、排名、展示 Claude Skills、MCP Servers、AI Agent 工具等相关仓库的数据，帮助开发者快速发现优质 Skills 资源。

### 功能特性

- **三维度排名** — 按 Stars、Forks、日增速度三个维度实时排名
- **全文搜索** — 支持按仓库名、描述、Topic 搜索
- **分类浏览** — 10 大分类（Coding & Dev / AI & ML / DevOps / Web / Mobile 等）
- **趋势可视化** — Canvas 绘制的 30 天 Stars 增长曲线
- **仓库详情** — 指标卡片 + 趋势图 + 同类推荐 + README 预览
- **双语支持** — 中文 / English 一键切换，全站 i18n
- **管理后台** — 查看数据状态、触发更新、管理 GitHub Actions 定时任务
- **零外部依赖** — 纯 HTML/CSS/JS，无 CDN，无框架，离线可用

### 技术栈

| 层面 | 技术 |
|---|---|
| 前端 | 纯 HTML5 + CSS3 + Vanilla JS（零依赖） |
| 图表 | Canvas API 自绘（无 Chart.js） |
| 数据 | GitHub Search API（免 Token 60次/h，认证后 5000次/h） |
| 部署 | 静态站点，Vercel / GitHub Pages / 任意静态托管 |
| 自动化 | GitHub Actions 每日 UTC 0:00 自动采集 |

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/tomatolei/skills-trending.git
cd skills-trending

# 采集最新数据（需要网络，GitHub API 有速率限制）
node scripts/fetch-skills.js

# 启动本地预览（任意静态服务器均可）
npx serve public
# 或
python3 -m http.server 3000 -d public
```

### 数据结构

```
public/data/skills.json
{
  "meta": { "updatedAt": "...", "version": "1.0" },
  "stats": { "totalSkills": 450, "totalStars": 4788595, ... },
  "categories": [ { "name": "Coding & Dev", "count": 323, ... } ],
  "mostStarred": [ ... ],   // Top 50 by stars
  "mostDownloaded": [ ... ],  // Top 50 by forks
  "risingFast": [ ... ],      // Top 50 by starsPerDay
  "allSkills": [ ... ]        // 全量仓库数据
}
```

### 自动采集

项目已配置 GitHub Actions（`.github/workflows/fetch-skills.yml`），每天 UTC 0:00 自动运行采集脚本并将结果 commit 回仓库。

手动触发：进入仓库 **Actions** 标签页 → 选择 **Fetch Skills Data** → **Run workflow**

### 部署

#### Vercel（推荐）

1. 导入仓库 `tomatolei/skills-trending`
2. 设置 **Output Directory** 为 `public`
3. 点击 Deploy

#### GitHub Pages

```bash
# 将 public/ 目录推送到 gh-pages 分支
git subtree push --prefix public origin gh-pages
```

---

## English

### Introduction

SkillTrends is an open-source project dedicated to tracking the Agent Skills ecosystem on GitHub. It automatically collects, ranks, and displays data from repositories related to Claude Skills, MCP Servers, AI Agent tools, and more — helping developers quickly discover high-quality Skills resources.

### Features

- **Multi-dimensional Rankings** — Real-time rankings by Stars, Forks, and daily growth rate
- **Full-text Search** — Search by repo name, description, or topics
- **Category Browsing** — 10 categories (Coding & Dev / AI & ML / DevOps / Web / Mobile, etc.)
- **Trend Visualization** — 30-day Stars growth chart drawn with Canvas API
- **Repository Details** — Metrics cards + trend chart + similar recommendations + README preview
- **Bilingual** — One-click switch between Chinese / English, full-site i18n
- **Admin Dashboard** — View data status, trigger updates, manage GitHub Actions schedules
- **Zero Dependencies** — Pure HTML/CSS/JS, no CDN, no frameworks, works offline

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 + CSS3 + JS (zero dependencies) |
| Charts | Canvas API (no Chart.js) |
| Data | GitHub Search API (60 req/h unauthenticated, 5000 req/h authenticated) |
| Deployment | Static site — Vercel / GitHub Pages / any static host |
| Automation | GitHub Actions, daily at UTC 0:00 |

### Run Locally

```bash
# Clone the repo
git clone https://github.com/tomatolei/skills-trending.git
cd skills-trending

# Collect latest data (requires network, GitHub API rate limited)
node scripts/fetch-skills.js

# Start local preview (any static server works)
npx serve public
# or
python3 -m http.server 3000 -d public
```

### Data Structure

```
public/data/skills.json
{
  "meta": { "updatedAt": "...", "version": "1.0" },
  "stats": { "totalSkills": 450, "totalStars": 4788595, ... },
  "categories": [ { "name": "Coding & Dev", "count": 323, ... } ],
  "mostStarred": [ ... ],   // Top 50 by stars
  "mostDownloaded": [ ... ],  // Top 50 by forks
  "risingFast": [ ... ],      // Top 50 by starsPerDay
  "allSkills": [ ... ]        // Full repository data
}
```

### Automated Data Collection

The project includes a GitHub Actions workflow (`.github/workflows/fetch-skills.yml`) that runs daily at UTC 0:00 to collect fresh data and auto-commit results back to the repository.

Manual trigger: Go to **Actions** tab → select **Fetch Skills Data** → **Run workflow**

### Deployment

#### Vercel (Recommended)

1. Import repo `tomatolei/skills-trending`
2. Set **Output Directory** to `public`
3. Click Deploy

#### GitHub Pages

```bash
git subtree push --prefix public origin gh-pages
```

---

## 项目结构 / Project Structure

```
skills-trending/
├── public/
│   ├── index.html          # 首页 / Home
│   ├── ranking.html        # 排行榜 / Rankings
│   ├── detail.html        # 仓库详情 / Repository Detail
│   ├── admin.html         # 管理后台 / Admin Dashboard
│   └── data/
│       └── skills.json    # 采集数据 / Collected Data
├── scripts/
│   ├── fetch-skills.js   # 数据采集脚本 / Data Collection Script
│   └── inject-superpowers.cjs  # 手动注入脚本 / Manual Injection Script
├── data/
│   ├── skills.json        # 源数据（同 public/data/）/ Source Data
│   └── history/         # 每日快照 / Daily Snapshots
└── .github/
    └── workflows/
        └── fetch-skills.yml  # 自动采集定时任务 / Auto-collection Cron
```

## 许可证 / License

MIT © 2026 SkillTrends Contributors

## 贡献 / Contributing

欢迎提交 Issue 和 PR！/ Issues and PRs are welcome!

- 报告 Bug：请附上截图和数据 / Report bugs with screenshots and data
- 新增数据源：修改 `scripts/fetch-skills.js` 的 `SEARCH_QUERIES` / Add data sources via `SEARCH_QUERIES`
- 新功能建议：开 Issue 讨论 / New feature? Open an Issue first

---

<p align="center">
  SkillTrends © 2026 · Data from <a href="https://github.com">GitHub API</a>
</p>
