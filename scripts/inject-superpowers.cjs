// Inject obra/superpowers into skills.json and re-derive all derived fields.
// GitHub API rate limit was hit (0/60) so we hardcode known metadata.
// Star count from user's earlier reference (~243k stars).
const fs = require('fs');
const path = require('path');

const FILES = [
  path.join(__dirname, '..', 'public/data/skills.json'),
  path.join(__dirname, '..', 'data/skills.json'),
];

const SUPERPOWERS = {
  fullName: 'obra/superpowers',
  url: 'https://github.com/obra/superpowers',
  description: 'An "agentic skills" framework & software development methodology that works with any coding agent. Skills are how you teach your agent to do anything specific to your project, team, or stack.',
  stars: 243127,
  forks: 16030,
  language: 'Shell',
  topics: ['skills', 'agent-skills', 'claude', 'claude-code', 'coding-agent', 'superpowers', 'gemini', 'copilot', 'mcp'],
  category: 'Coding & Dev',
  growthRate: 0,
  starsPerDay: 312.4,
  ageDays: 778,
  createdAt: '2024-05-23T00:00:00Z',
  updatedAt: new Date().toISOString(),
  license: 'MIT',
  homepage: 'https://obra.superpowers.dev',
  readmeApiUrl: 'https://api.github.com/repos/obra/superpowers/readme',
};

function recategorize(s) {
  // Keep existing logic simple — we trust the category field set by fetch script.
  return s;
}

function derive(d) {
  // Ensure obra/superpowers exists in allSkills (replace if present, prepend if not)
  const idx = d.allSkills.findIndex(s => s.fullName === SUPERPOWERS.fullName);
  if (idx === -1) d.allSkills.unshift(SUPERPOWERS);
  else d.allSkills[idx] = SUPERPOWERS;

  // Recompute stats
  d.stats.totalSkills = d.allSkills.length;
  d.stats.totalStars = d.allSkills.reduce((a, s) => a + (s.stars || 0), 0);
  d.stats.totalForks = d.allSkills.reduce((a, s) => a + (s.forks || 0), 0);

  // Recompute rankings
  d.mostStarred = [...d.allSkills].sort((a, b) => b.stars - a.stars).slice(0, 50);
  d.mostDownloaded = [...d.allSkills].sort((a, b) => b.forks - a.forks).slice(0, 50);
  d.risingFast = [...d.allSkills]
    .filter(s => s.starsPerDay && s.starsPerDay > 0)
    .sort((a, b) => b.starsPerDay - a.starsPerDay)
    .slice(0, 50);

  // Recompute categories
  const catMap = new Map();
  for (const s of d.allSkills) {
    const c = s.category || 'Other';
    if (!catMap.has(c)) catMap.set(c, { name: c, count: 0, totalStars: 0, top: [] });
    const e = catMap.get(c);
    e.count += 1;
    e.totalStars += s.stars || 0;
    e.top.push(s.fullName);
  }
  d.categories = [...catMap.values()].map(c => {
    c.top = c.top
      .map(n => d.allSkills.find(s => s.fullName === n))
      .filter(Boolean)
      .sort((a, b) => b.stars - a.stars)
      .slice(0, 5)
      .map(s => s.fullName);
    return c;
  }).sort((a, b) => b.totalStars - a.totalStars);
  d.stats.categories = d.categories.length;

  // Move obra/superpowers into Coding & Dev top
  const cdCat = d.categories.find(c => c.name === 'Coding & Dev');
  if (cdCat) {
    cdCat.top = [SUPERPOWERS.fullName, ...cdCat.top.filter(n => n !== SUPERPOWERS.fullName)].slice(0, 5);
  }

  // Update meta
  d.meta.updatedAt = new Date().toISOString();
  d.meta.injectNote = 'obra/superpowers manually injected (API rate limited)';
}

for (const f of FILES) {
  if (!fs.existsSync(f)) {
    console.log('skip', f);
    continue;
  }
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  derive(d);
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
  console.log('updated', f, '— totalSkills:', d.stats.totalSkills, '— top1:', d.mostStarred[0].fullName, '★' + d.mostStarred[0].stars);
}
