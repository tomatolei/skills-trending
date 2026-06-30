# 🔥 SkillTrends — GitHub Agent Skills 趋势追踪

发现 GitHub 上最热门的 AI Agent Skills，追踪 Stars、下载量、增长趋势。

## 功能

- **趋势榜单**：Most Starred / Most Downloaded / Rising Fast 三大榜单
- **分类浏览**：按领域（Coding、Design、Productivity 等）探索技能
- **生态趋势图**：30 天 Stars 增长可视化
- **精选合集**：官方/社区精选列表

## 数据采集

每天 UTC 0:00 自动运行，通过 GitHub API 采集：

- **GitHub Search API** → 按 topic（agent-skill、mcp-skill 等）发现新仓库
- **GraphQL API** → 批量获取 Stars/Forks/更新等详细指标
- **历史快照对比** → 计算增长率和 Rising Fast 排行
- **npm Registry** → 补充下载量数据

详见 [`scripts/fetch-skills.js`](scripts/fetch-skills.js) 和 [`.github/workflows/fetch-skills.yml`](.github/workflows/fetch-skills.yml)

## 本地运行

```bash
# 安装依赖（暂无额外依赖，采集脚本用 Node 原生 fetch）
# 运行采集（需要 GitHub Token）
GITHUB_TOKEN=ghp_xxx node scripts/fetch-skills.js

# 预览前端
npx serve public
```

## 部署

推送后直接部署到 Vercel / CloudStudio：

- **构建命令**：无（纯静态）
- **输出目录**：`public`
- **环境变量**：无需

## 许可证

MIT
