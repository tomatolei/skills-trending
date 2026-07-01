/**
 * GitHub Agent Skills 数据采集脚本（免 Token 版）
 *
 * 无需 GITHUB_TOKEN 即可运行，使用 GitHub Search API 免认证额度。
 * 认证后额度更高，数据更全。
 *
 * 用法:
 *   node scripts/fetch-skills.js                # 免认证模式
 *   GITHUB_TOKEN=ghp_xxx node scripts/fetch-skills.js  # 认证模式
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const HISTORY_DIR = path.join(DATA_DIR, "history");

const TOKEN = process.env.GITHUB_TOKEN || "";

// ============================================================
// 配置
// ============================================================

// 搜索策略 — 多维度搜索覆盖最大范围
const SEARCH_QUERIES = [
  { q: "topic:claude-skills", label: "Claude Skills" },
  { q: "topic:agent-skills", label: "Agent Skills" },
  { q: "topic:mcp-server", label: "MCP Server" },
  { q: "topic:ai-agent+stars:>500", label: "AI Agent" },
  { q: "claude skill in:name,description,readme+stars:>100", label: "Claude Skill (keyword)" },
  { q: "agent skill in:name,description+stars:>200", label: "Agent Skill (keyword)" },
  { q: "topic:awesome-claude", label: "Awesome Claude" },
  { q: "topic:llm-agent+stars:>1000", label: "LLM Agent" },
  { q: "topic:mcp+stars:>200", label: "MCP" },
  { q: "topic:ai-tools+stars:>1000", label: "AI Tools" },
  { q: "topic:skills+stars:>100", label: "Skills (GitHub Topic)" },
  { q: "skills+stars:>5000+language:markdown", label: "Skills (Keyword)" },
];

// 种子仓库 — 确保热门项目一定被收录
const SEED_REPOS = [
  "anthropics/skills",
  "punkpeye/awesome-claude-skills",
  "modelcontextprotocol/servers",
  "cline/cline",
  "continuedev/continue",
  "aider-ai/aider",
  "browser-use/browser-use",
  "mendableai/firecrawl",
  "langchain-ai/langgraph",
  "crewAIInc/crewAI",
  "microsoft/autogen",
  "VoltAgent/awesome-agent-skills",
  "obra/superpowers",
  "nicbarker/awesome-agent-skills",
  "kortix-ai/awesome-claude-skills",
];

// ============================================================
// GitHub API 封装
// ============================================================

function getHeaders() {
  const headers = { "User-Agent": "SkillTrends-Bot/1.0", Accept: "application/vnd.github.v3+json" };
  if (TOKEN) headers.Authorization = `token ${TOKEN}`;
  return headers;
}

async function searchRepos(query, perPage = 100, page = 1) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function getRepo(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Repo ${res.status}`);
  return res.json();
}

async function getReadmeSummary(owner, repo) {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/readme`;
    const res = await fetch(url, { headers: { ...getHeaders(), Accept: "application/vnd.github.v3+json" } });
    if (!res.ok) return null;
    const data = await res.json();
    // content is base64 encoded
    const content = Buffer.from(data.content || "", "base64").toString("utf-8");
    return content.slice(0, 800).replace(/\n+/g, " ").trim();
  } catch {
    return null;
  }
}

// ============================================================
// 1. 搜索发现仓库
// ============================================================

async function discoverRepos() {
  console.log("🔍 搜索 GitHub 仓库...\n");
  const found = new Map();

  for (const { q, label } of SEARCH_QUERIES) {
    try {
      process.stdout.write(`  [${label}] 搜索中... `);
      const data = await searchRepos(q, 100);
      const count = data.items?.length || 0;
      console.log(`找到 ${count} 个 (总计 ${data.total_count})`);

      for (const repo of data.items || []) {
        if (!found.has(repo.full_name)) {
          found.set(repo.full_name, {
            fullName: repo.full_name,
            url: repo.html_url,
            description: repo.description || "",
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            watchers: repo.watchers_count,
            openIssues: repo.open_issues_count,
            language: repo.language,
            topics: repo.topics || [],
            createdAt: repo.created_at,
            updatedAt: repo.updated_at,
            pushedAt: repo.pushed_at,
            license: repo.license?.spdx_id || null,
            homepage: repo.homepage || null,
            archived: repo.archived,
          });
        }
      }

      // 免认证 10次/分钟，认证 30次/分钟，安全间隔
      await sleep(TOKEN ? 2000 : 7000);
    } catch (e) {
      console.warn(`  ⚠ [${label}] 失败: ${e.message}`);
      if (e.message.includes("403")) {
        console.warn("  ⚠ 触发速率限制，等待 30 秒...");
        await sleep(30000);
      }
    }
  }

  console.log(`\n  📦 搜索阶段共发现 ${found.size} 个不重复仓库\n`);
  return found;
}

// ============================================================
// 2. 补充种子仓库
// ============================================================

async function addSeedRepos(repos) {
  console.log("🌱 补充种子仓库...");
  for (const fullName of SEED_REPOS) {
    if (repos.has(fullName)) continue;
    try {
      const [owner, repo] = fullName.split("/");
      const data = await getRepo(owner, repo);
      repos.set(fullName, {
        fullName: data.full_name,
        url: data.html_url,
        description: data.description || "",
        stars: data.stargazers_count,
        forks: data.forks_count,
        watchers: data.watchers_count,
        openIssues: data.open_issues_count,
        language: data.language,
        topics: data.topics || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        pushedAt: data.pushed_at,
        license: data.license?.spdx_id || null,
        homepage: data.homepage || null,
        archived: data.archived,
      });
      console.log(`  ✓ ${fullName} (${data.stargazers_count} stars)`);
      await sleep(TOKEN ? 1000 : 3000);
    } catch (e) {
      console.warn(`  ⚠ ${fullName}: ${e.message}`);
    }
  }
  console.log();
  return repos;
}

// ============================================================
// 3. 分类推断
// ============================================================

function guessCategory(topics, description) {
  const text = [...topics, description].join(" ").toLowerCase();
  const rules = [
    { cat: "Coding & Dev", keys: ["code", "programming", "developer", "ide", "editor", "cli", "git", "debug", "refactor", "lint"] },
    { cat: "AI & ML", keys: ["ai", "ml", "machine-learning", "llm", "model", "inference", "neural", "deep-learning", "embedding", "rag"] },
    { cat: "Productivity", keys: ["productivity", "automation", "workflow", "task", "notion", "calendar", "email", "schedule", "plan"] },
    { cat: "Data & Analytics", keys: ["data", "analytics", "visualization", "sql", "database", "big-data", "etl", "chart", "dashboard"] },
    { cat: "Design & Creative", keys: ["design", "creative", "art", "image", "video", "audio", "3d", "animation", "ui", "ux", "figma"] },
    { cat: "DevOps & Infra", keys: ["devops", "infra", "cloud", "docker", "kubernetes", "ci", "deploy", "monitoring", "server"] },
    { cat: "Web & API", keys: ["web", "api", "browser", "http", "rest", "graphql", "scraping", "crawler", "fetch"] },
    { cat: "Security", keys: ["security", "auth", "encryption", "vulnerability", "penetration", "pentest"] },
    { cat: "Knowledge & Docs", keys: ["knowledge", "docs", "documentation", "wiki", "note", "memory", "context", "rag"] },
    { cat: "Communication", keys: ["chat", "slack", "discord", "telegram", "message", "notification"] },
  ];
  for (const rule of rules) {
    if (rule.keys.some((k) => text.includes(k))) return rule.cat;
  }
  return "Other";
}

// ============================================================
// 4. 计算趋势 & 排名
// ============================================================

function computeStats(repos) {
  console.log("📈 计算趋势与排名...");

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 读历史快照
  let prevData = {};
  const historyFile = path.join(HISTORY_DIR, `${getYesterday()}.json`);
  try {
    if (fs.existsSync(historyFile)) {
      const raw = fs.readFileSync(historyFile, "utf-8");
      for (const s of JSON.parse(raw)) {
        prevData[s.fullName] = s;
      }
      console.log("  ✓ 找到昨日快照，计算增长率");
    }
  } catch {
    console.log("  无历史快照，增长率设为 0");
  }

  const skills = repos.map((repo) => {
    const prev = prevData[repo.fullName];
    const prevStars = prev?.stars || repo.stars;
    const starGrowth = prev ? repo.stars - prevStars : 0;
    const growthRate = prevStars > 0 ? ((starGrowth / prevStars) * 100) : 0;

    // 根据创建时间判断是否为"新星"
    const createdAt = new Date(repo.createdAt);
    const ageDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    const isRising = ageDays < 90 && repo.stars > 100;

    // 计算 stars/天 指标（衡量热度）
    const starsPerDay = ageDays > 0 ? (repo.stars / ageDays) : 0;

    return {
      id: repo.fullName,
      fullName: repo.fullName,
      url: repo.url,
      description: repo.description,
      stars: repo.stars,
      forks: repo.forks,
      watchers: repo.watchers,
      openIssues: repo.openIssues,
      language: repo.language,
      topics: repo.topics,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      pushedAt: repo.pushedAt,
      license: repo.license,
      homepage: repo.homepage,
      archived: repo.archived,
      // 趋势指标
      starGrowth,
      growthRate: parseFloat(growthRate.toFixed(1)),
      starsPerDay: parseFloat(starsPerDay.toFixed(1)),
      ageDays,
      isRising,
      // 分类
      category: guessCategory(repo.topics, repo.description),
    };
  });

  return skills;
}

// ============================================================
// 5. 生成前端数据
// ============================================================

function generateOutput(skills) {
  console.log("\n📦 生成输出文件...");

  // 排序
  const byStars = [...skills].sort((a, b) => b.stars - a.stars);
  const byRising = [...skills]
    .filter((s) => s.stars > 50)
    .sort((a, b) => b.starsPerDay - a.starsPerDay);

  // Most Downloaded: 优先有 homepage/npm 链接的，按 stars 排
  const byDownloads = [...skills]
    .filter((s) => s.forks > 10)
    .sort((a, b) => b.forks - a.forks);

  // 分类统计
  const categoryMap = {};
  for (const s of skills) {
    if (!categoryMap[s.category]) categoryMap[s.category] = [];
    categoryMap[s.category].push(s);
  }

  const categories = Object.entries(categoryMap)
    .map(([name, items]) => ({
      name,
      count: items.length,
      totalStars: items.reduce((s, r) => s + r.stars, 0),
      top: [...items].sort((a, b) => b.stars - a.stars).slice(0, 5).map((r) => r.fullName),
    }))
    .sort((a, b) => b.count - a.count);

  // 精选合集 — 从 topics 中识别 awesome/official/community
  const awesomeLists = byStars.filter((s) =>
    s.topics.some((t) => t.includes("awesome")) || s.fullName.toLowerCase().includes("awesome")
  ).slice(0, 10);

  const official = byStars.filter((s) =>
    ["anthropics", "openai", "microsoft", "google", "meta"].some((org) =>
      s.fullName.toLowerCase().startsWith(org + "/")
    )
  ).slice(0, 10);

  const community = byStars.filter((s) =>
    !awesomeLists.includes(s) && !official.includes(s)
  ).slice(0, 10);

  const summary = {
    meta: {
      updatedAt: new Date().toISOString(),
      version: "1.0",
      source: "GitHub Search API",
      authenticated: !!TOKEN,
    },
    stats: {
      totalSkills: skills.length,
      totalStars: skills.reduce((s, r) => s + r.stars, 0),
      totalForks: skills.reduce((s, r) => s + r.forks, 0),
      categories: categories.length,
      collections: awesomeLists.length + official.length + community.length,
      newThisWeek: skills.filter((s) => s.ageDays < 7).length,
    },
    categories,
    mostStarred: byStars.slice(0, 50).map(formatSkill),
    mostDownloaded: byDownloads.slice(0, 50).map(formatSkill),
    risingFast: byRising.slice(0, 50).map(formatSkill),
    awesomeLists: awesomeLists.slice(0, 10).map(formatSkill),
    official: official.slice(0, 10).map(formatSkill),
    community: community.slice(0, 10).map(formatSkill),
    allSkills: byStars.map(formatSkill),
  };

  // 确保目录存在
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

  // 写主数据文件
  fs.writeFileSync(path.join(DATA_DIR, "skills.json"), JSON.stringify(summary, null, 2));
  console.log(`  ✓ data/skills.json (${(JSON.stringify(summary).length / 1024).toFixed(0)} KB)`);

  // 写历史快照
  const today = new Date().toISOString().slice(0, 10);
  const snapshot = skills.map((s) => ({
    fullName: s.fullName,
    stars: s.stars,
    forks: s.forks,
    fetchedAt: today,
  }));
  fs.writeFileSync(path.join(HISTORY_DIR, `${today}.json`), JSON.stringify(snapshot, null, 2));
  console.log(`  ✓ data/history/${today}.json`);

  // 也写一份到 public/ 供前端直接 fetch
  const publicDataDir = path.join(ROOT, "public", "data");
  if (!fs.existsSync(publicDataDir)) fs.mkdirSync(publicDataDir, { recursive: true });
  fs.writeFileSync(path.join(publicDataDir, "skills.json"), JSON.stringify(summary, null, 2));
  console.log(`  ✓ public/data/skills.json`);

  return summary;
}

function formatSkill(s) {
  return {
    fullName: s.fullName,
    url: s.url,
    description: s.description,
    stars: s.stars,
    forks: s.forks,
    language: s.language,
    topics: s.topics,
    category: s.category,
    growthRate: s.growthRate,
    starsPerDay: s.starsPerDay,
    ageDays: s.ageDays,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    license: s.license,
    homepage: s.homepage,
    readmeApiUrl: `https://api.github.com/repos/${s.fullName}/readme`,
  };
}

// ============================================================
// 工具函数
// ============================================================

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("====================================");
  console.log("  🚀 GitHub Skills 数据采集");
  console.log(`  模式: ${TOKEN ? "认证 (5000次/小时)" : "免认证 (60次/小时)"}`);
  console.log(`  时间: ${new Date().toISOString()}`);
  console.log("====================================\n");

  // 1. 搜索发现
  const discovered = await discoverRepos();

  // 2. 补充种子
  await addSeedRepos(discovered);

  // 3. 计算趋势
  const skills = computeStats(Array.from(discovered.values()));

  // 4. 生成输出
  const summary = generateOutput(skills);

  console.log("\n====================================");
  console.log("  ✅ 采集完成！");
  console.log(`  总计: ${summary.stats.totalSkills} 个 Skills`);
  console.log(`  总星数: ${(summary.stats.totalStars / 1000).toFixed(0)}k`);
  console.log(`  总 Fork: ${summary.stats.totalForks.toLocaleString()}`);
  console.log(`  分类: ${summary.stats.categories} 个`);
  console.log(`  合集: ${summary.stats.collections} 个`);
  console.log("====================================\n");
}

main().catch((e) => {
  console.error("❌ 采集失败:", e);
  process.exit(1);
});
