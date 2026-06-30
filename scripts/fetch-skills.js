/**
 * GitHub Agent Skills 数据采集脚本
 *
 * 用法: GITHUB_TOKEN=ghp_xxx node scripts/fetch-skills.js
 * 定时: GitHub Actions 每日 UTC 0:00 自动运行
 *
 * 采集流程:
 *   1. GitHub Search API → 按 topic 搜索 skill 仓库
 *   2. GraphQL API → 批量拉取 Stars/Forks/更新等详细数据
 *   3. npm Registry → 补充下载量（对有 npm 包的 Skill）
 *   4. 对比历史快照 → 计算增长率、上升速度
 *   5. 输出 data/skills.json + 当日快照 data/history/YYYY-MM-DD.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const HISTORY_DIR = path.join(DATA_DIR, "history");

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("❌ 请设置 GITHUB_TOKEN 环境变量");
  process.exit(1);
}

// ============================================================
// 配置
// ============================================================

// 种子仓库列表 — 已知的热门 Skills 项目
const SEED_REPOS = [
  "anthropics/skills",
  "Awesome-Skills/awesome-skills",
  "punkpeye/awesome-claude-skills",
  "openclaw/openclaw",
  "modelcontextprotocol/servers",
  "michaelliao/awesome-mcp-servers",
  "punkpeye/awesome-mcp-servers",
  "anthropics/claude-code",
  "continuedev/continue",
  "cline/cline",
  "aider-ai/aider",
  "composiohq/composio",
  "langchain-ai/langgraph",
  "crewAIInc/crewAI",
  "microsoft/autogen",
  "mendableai/firecrawl-mcp-server",
  "browserbase/mcp-server-browserbase",
  "exa-labs/exa-mcp-server",
  "smithery-ai/smithery",
  "skillsmarket/skills-registry",
  "Agents-Builder/Agents-Builder",
  "skills-ai/skills",
  "agentsea/skillpacks",
].map((fullName) => ({ fullName, tags: [] }));

// 搜索话题 — 用于发现新仓库
const SEARCH_TOPICS = [
  "agent-skill",
  "claude-skill",
  "mcp-skill",
  "ai-skill",
  "agent-skills",
  "ai-agent",
  "mcp-server",
  "claude-skills",
];

// ============================================================
// GitHub API 封装
// ============================================================

async function graphql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function restAPI(endpoint) {
  const res = await fetch(`https://api.github.com/${endpoint}`, {
    headers: {
      Authorization: `bearer ${TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  return res.json();
}

// ============================================================
// 1. 搜索发现新仓库
// ============================================================

async function searchNewRepos() {
  console.log("🔍 搜索新 Skill 仓库...");
  const found = new Map();

  for (const topic of SEARCH_TOPICS) {
    try {
      const data = await restAPI(
        `search/repositories?q=topic:${topic}+stars:>50&sort=stars&order=desc&per_page=30`
      );
      for (const repo of data.items || []) {
        found.set(repo.full_name, {
          fullName: repo.full_name,
          url: repo.html_url,
          description: repo.description,
          tags: repo.topics || [],
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          pushedAt: repo.pushed_at,
          openIssues: repo.open_issues_count,
          license: repo.license?.spdx_id || null,
        });
      }
      await sleep(2000); // 遵守速率限制
    } catch (e) {
      console.warn(`  ⚠ 搜索 topic:${topic} 失败:`, e.message);
    }
  }

  console.log(`  发现 ${found.size} 个仓库`);
  return found;
}

// ============================================================
// 2. 批量 GraphQL 获取详细数据
// ============================================================

async function enrichWithGraphQL(repos) {
  console.log("📊 批量获取详细数据...");
  const repoNames = repos.map((r) => r.fullName);

  // GraphQL 批量查询（每批最多 20 个）
  const enriched = [];
  for (let i = 0; i < repoNames.length; i += 20) {
    const batch = repoNames.slice(i, i + 20);
    const aliases = batch.map((name, idx) => {
      const [owner, repo] = name.split("/");
      return `
        repo${idx}: repository(owner: "${owner}", name: "${repo}") {
          nameWithOwner
          stargazerCount
          forkCount
          createdAt
          updatedAt
          latestRelease { publishedAt tagName }
          primaryLanguage { name }
          licenseInfo { spdxId }
          repositoryTopics(first: 10) { nodes { topic { name } } }
        }`;
    });

    const query = `query { ${aliases.join("\n")} }`;
    try {
      const data = await graphql(query);
      const results = Object.values(data);
      for (const r of results) {
        if (!r) continue;
        const repo = repos.find((x) => x.fullName === r.nameWithOwner);
        if (repo) {
          enriched.push({
            ...repo,
            stars: r.stargazerCount,
            forks: r.forkCount,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            latestRelease: r.latestRelease?.publishedAt || null,
            primaryLanguage: r.primaryLanguage?.name || null,
            license: r.licenseInfo?.spdxId || repo.license,
            topics: r.repositoryTopics?.nodes?.map((n) => n.topic.name) || repo.tags,
          });
        }
      }
    } catch (e) {
      console.warn(`  ⚠ GraphQL 批次 ${i} 失败:`, e.message);
      enriched.push(...repos.filter((r) => batch.includes(r.fullName)));
    }
    await sleep(2000);
  }

  return enriched;
}

// ============================================================
// 3. 计算趋势数据
// ============================================================

async function computeTrends(repos) {
  console.log("📈 计算趋势...");
  const today = new Date().toISOString().slice(0, 10);

  // 读昨天的快照做对比
  const yesterday = getYesterday();
  let prevData = {};
  try {
    const raw = fs.readFileSync(path.join(HISTORY_DIR, `${yesterday}.json`), "utf-8");
    prevData = {};
    for (const s of JSON.parse(raw)) {
      prevData[s.fullName] = s;
    }
  } catch {
    console.log("  无昨日快照，使用当天数据作为基准");
  }

  const result = repos.map((repo) => {
    const prev = prevData[repo.fullName];
    const starGrowth7d = prev ? repo.stars - (prev.stars || repo.stars) : 0;
    const growthRate = prev?.stars ? ((starGrowth7d / prev.stars) * 100).toFixed(1) : "0.0";

    return {
      id: repo.fullName,
      fullName: repo.fullName,
      url: repo.url,
      description: repo.description || "",
      stars: repo.stars,
      forks: repo.forks,
      topics: repo.topics || repo.tags || [],
      language: repo.primaryLanguage || repo.language,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      latestRelease: repo.latestRelease || null,
      license: repo.license,
      openIssues: repo.openIssues,
      // 趋势指标
      starGrowth7d,
      growthRate: parseFloat(growthRate),
      // npm 数据（后续补充）
      npmDownloads: null,
      // 元数据
      fetchedAt: today,
      category: guessCategory(repo.topics || repo.tags || [], repo.description || ""),
    };
  });

  return result;
}

// ============================================================
// 4. 分类推断
// ============================================================

function guessCategory(topics, description) {
  const text = [...topics, description].join(" ").toLowerCase();
  const rules = [
    { cat: "Coding & Dev", keys: ["code", "programming", "developer", "ide", "editor", "cli", "git", "debug"] },
    { cat: "AI & ML", keys: ["ai", "ml", "machine-learning", "llm", "model", "inference", "neural", "deep-learning"] },
    { cat: "Productivity", keys: ["productivity", "automation", "workflow", "task", "notion", "calendar", "email"] },
    { cat: "Data & Analytics", keys: ["data", "analytics", "visualization", "sql", "database", "big-data", "etl"] },
    { cat: "Design & Creative", keys: ["design", "creative", "art", "image", "video", "audio", "3d", "animation"] },
    { cat: "DevOps & Infra", keys: ["devops", "infra", "cloud", "docker", "kubernetes", "ci", "deploy", "monitoring"] },
    { cat: "Web & API", keys: ["web", "api", "browser", "http", "rest", "graphql", "scraping", "crawler"] },
    { cat: "Security", keys: ["security", "auth", "encryption", "vulnerability", "penetration"] },
    { cat: "Finance", keys: ["finance", "trading", "stock", "crypto", "blockchain", "quant"] },
  ];

  for (const rule of rules) {
    if (rule.keys.some((k) => text.includes(k))) return rule.cat;
  }
  return "Other";
}

// ============================================================
// 5. npm 下载量（可选）
// ============================================================

async function fetchNpmDownloads(skills) {
  console.log("📦 查询 npm 下载量...");
  for (const skill of skills) {
    const npmName = guessNpmName(skill.fullName, skill.description, skill.topics);
    if (!npmName) continue;

    try {
      const res = await fetch(`https://api.npmjs.org/downloads/point/last-week/${npmName}`);
      if (res.ok) {
        const data = await res.json();
        skill.npmDownloads = data.downloads || 0;
      }
    } catch {
      // npm 查询静默失败
    }
    await sleep(500);
  }
  return skills;
}

function guessNpmName(fullName, description, topics) {
  // 尝试从仓库名推断 npm 包名
  const [, repo] = fullName.split("/");
  const candidates = [repo];
  if (topics) candidates.push(...topics.filter((t) => !t.includes("-skill") && !t.includes("mcp")));
  // 只对明显有 npm 包的仓库查询
  const text = [description, ...candidates].join(" ").toLowerCase();
  if (text.includes("npm") || text.includes("package") || text.includes("install") || text.includes("npx")) {
    return repo;
  }
  return null;
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
  console.log("🚀 GitHub Skills 数据采集开始\n");

  // 1. 搜索发现
  const discovered = await searchNewRepos();

  // 2. 合并种子仓库（种子仓库中不在搜索结果的）
  for (const seed of SEED_REPOS) {
    if (!discovered.has(seed.fullName)) {
      try {
        const [owner, repo] = seed.fullName.split("/");
        const data = await restAPI(`repos/${owner}/${repo}`);
        discovered.set(seed.fullName, {
          fullName: data.full_name,
          url: data.html_url,
          description: data.description,
          tags: data.topics || [],
          language: data.language,
          stars: data.stargazers_count,
          forks: data.forks_count,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          pushedAt: data.pushed_at,
          openIssues: data.open_issues_count,
          license: data.license?.spdx_id || null,
        });
        await sleep(1000);
      } catch (e) {
        console.warn(`  ⚠ 种子仓库 ${seed.fullName} 获取失败:`, e.message);
      }
    }
  }

  // 3. 转换成数组，GraphQL 补充数据
  const repoList = Array.from(discovered.values());
  const enriched = await enrichWithGraphQL(repoList);

  // 4. 计算趋势
  const skills = await computeTrends(enriched);

  // 5. npm 下载量
  await fetchNpmDownloads(skills);

  // 6. 排序输出
  skills.sort((a, b) => b.stars - a.stars);

  // 保存当日快照
  const today = new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(HISTORY_DIR, `${today}.json`), JSON.stringify(skills, null, 2));

  // 生成汇总数据（前端用）
  const summary = {
    updatedAt: new Date().toISOString(),
    totalSkills: skills.length,
    totalStars: skills.reduce((s, r) => s + r.stars, 0),
    categories: [...new Set(skills.map((s) => s.category))].sort(),
    mostStarred: skills.slice(0, 20),
    risingFast: skills
      .filter((s) => s.growthRate > 0)
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 20),
    // npmDownloads 暂时不单独做榜单（数据不完整）
    allSkills: skills,
  };

  fs.writeFileSync(path.join(DATA_DIR, "skills.json"), JSON.stringify(summary, null, 2));

  console.log(`\n✅ 采集完成！`);
  console.log(`   总计: ${skills.length} 个 Skills`);
  console.log(`   总星数: ${(summary.totalStars / 1000).toFixed(0)}k`);
  console.log(`   分类: ${summary.categories.length} 个`);
  console.log(`   数据已保存到 data/skills.json`);
}

main().catch((e) => {
  console.error("❌ 采集失败:", e);
  process.exit(1);
});
