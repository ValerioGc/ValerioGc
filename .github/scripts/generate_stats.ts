/**
 * generate_stats.ts
 * Generates GitHub stats SVG cards for profile README.
 * Run via: npx tsx .github/scripts/generate_stats.ts
 *
 * Produces 4 files in generated/:
 *   stats-light.svg / stats-dark.svg   → commit/repo/star/PR counts
 *   langs-light.svg / langs-dark.svg   → top languages by bytes
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const USERNAME = process.env.GITHUB_USERNAME ?? "ValerioGc";
const TOKEN = process.env.GITHUB_TOKEN ?? "";
const GRAPHQL_URL = "https://api.github.com/graphql";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "..", "generated");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LangEntry {
  name: string;
  color: string;
  pct: number;
}

interface StatsData {
  stars: number;
  repos: number;
  commits: number;
  prs: number;
  followers: number;
  langs: LangEntry[];
  updated: string;
}

interface RepoNode {
  stargazerCount: number;
  languages: {
    edges: Array<{
      size: number;
      node: { name: string; color: string | null };
    }>;
  };
}

// ---------------------------------------------------------------------------
// GitHub GraphQL API
// ---------------------------------------------------------------------------

async function graphql<T>(query: string): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

  const json = (await res.json()) as { data?: T; errors?: unknown[] };
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

async function fetchAllRepos(): Promise<RepoNode[]> {
  const repos: RepoNode[] = [];
  let cursor: string | null = null;

  while (true) {
    const after = cursor ? `, after: "${cursor}"` : "";
    const data = await graphql<{
      user: {
        repositories: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: RepoNode[];
        };
      };
    }>(`query {
      user(login: "${USERNAME}") {
        repositories(
          first: 100
          ownerAffiliations: OWNER
          isFork: false
          privacy: PUBLIC
          ${after}
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            stargazerCount
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name color } }
            }
          }
        }
      }
    }`);

    const page = data.user.repositories;
    repos.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  return repos;
}

async function fetchContributions() {
  return graphql<{
    user: {
      repositories: { totalCount: number };
      contributionsCollection: {
        totalCommitContributions: number;
        restrictedContributionsCount: number;
        totalPullRequestContributions: number;
      };
      pullRequests: { totalCount: number };
      followers: { totalCount: number };
    };
  }>(`query {
    user(login: "${USERNAME}") {
      repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
        totalCount
      }
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        totalPullRequestContributions
      }
      pullRequests(states: [MERGED]) { totalCount }
      followers { totalCount }
    }
  }`);
}

async function collectData(): Promise<StatsData> {
  console.log(`Fetching data for ${USERNAME}...`);
  const [repos, contribData] = await Promise.all([fetchAllRepos(), fetchContributions()]);
  const { user } = contribData;

  const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);
  const totalRepos = user.repositories.totalCount;
  const cc = user.contributionsCollection;
  const commits = cc.totalCommitContributions + cc.restrictedContributionsCount;
  const prs = user.pullRequests.totalCount;
  const followers = user.followers.totalCount;

  // Aggregate language bytes across all repos
  const langs = new Map<string, { size: number; color: string }>();
  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      const { name, color } = edge.node;
      const existing = langs.get(name);
      if (existing) {
        existing.size += edge.size;
      } else {
        langs.set(name, { size: edge.size, color: color ?? "#8B949E" });
      }
    }
  }

  const totalBytes = [...langs.values()].reduce((sum, l) => sum + l.size, 0) || 1;
  const topLangs: LangEntry[] = [...langs.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 7)
    .map(([name, { color, size }]) => ({
      name,
      color,
      pct: Math.round((size / totalBytes) * 1000) / 10,
    }));

  console.log(`  repos=${totalRepos} stars=${stars} commits=${commits} prs=${prs}`);
  console.log(`  top langs: ${topLangs.map((l) => l.name).join(", ")}`);

  const now = new Date();
  const updated = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return { stars, repos: totalRepos, commits, prs, followers, langs: topLangs, updated };
}

// ---------------------------------------------------------------------------
// SVG themes
// ---------------------------------------------------------------------------

type Theme = "light" | "dark";

const THEMES: Record<Theme, Record<string, string>> = {
  light: {
    bg: "#FFFFFF",
    border: "#E1E4E8",
    title: "#24292F",
    value: "#24292F",
    label: "#57606A",
    barBg: "#EAEEF2",
    accent: "#533AB7",
  },
  dark: {
    bg: "#161B22",
    border: "#30363D",
    title: "#E6EDF3",
    value: "#E6EDF3",
    label: "#8B949E",
    barBg: "#21262D",
    accent: "#9D79F2",
  },
};

const FONT = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"`;

// ---------------------------------------------------------------------------
// SVG generators
// ---------------------------------------------------------------------------

function statssvg(data: StatsData, theme: Theme): string {
  const t = THEMES[theme];
  const w = 420;
  const h = 155;
  const metrics: [string, number][] = [
    ["Stars", data.stars],
    ["Repos", data.repos],
    ["Commits", data.commits],
    ["PRs merged", data.prs],
  ];
  const colW = w / metrics.length;

  const items = metrics
    .map(([label, value], i) => {
      const cx = Math.round(colW * i + colW / 2);
      return `
    <text x="${cx}" y="88" ${FONT} font-size="24" font-weight="600" text-anchor="middle" fill="${t.value}">${value.toLocaleString("en")}</text>
    <text x="${cx}" y="108" ${FONT} font-size="11" text-anchor="middle" fill="${t.label}">${label}</text>`;
    })
    .join("");

  const seps = metrics
    .slice(1)
    .map((_, i) => {
      const x = Math.round(colW * (i + 1));
      return `<line x1="${x}" y1="55" x2="${x}" y2="120" stroke="${t.border}" stroke-width="0.5"/>`;
    })
    .join("");

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>GitHub Stats — ${USERNAME}</title>
  <desc>Stars: ${data.stars}, Repos: ${data.repos}, Commits: ${data.commits}, PRs: ${data.prs}</desc>
  <rect width="${w}" height="${h}" rx="12" fill="${t.bg}" stroke="${t.border}" stroke-width="1"/>
  <text x="20" y="30" ${FONT} font-size="15" font-weight="600" fill="${t.accent}">GitHub Stats</text>
  <line x1="0" y1="45" x2="${w}" y2="45" stroke="${t.border}" stroke-width="0.5"/>
  ${seps}
  ${items}
  <line x1="0" y1="122" x2="${w}" y2="122" stroke="${t.border}" stroke-width="0.5"/>
  <text x="${Math.round(w / 2)}" y="140" ${FONT} font-size="10" text-anchor="middle" fill="${t.label}">Updated ${data.updated} · generated by GitHub Actions</text>
</svg>`;
}

function langssvg(data: StatsData, theme: Theme): string {
  const t = THEMES[theme];
  const langs = data.langs.length ? data.langs : [{ name: "N/A", color: "#8B949E", pct: 100 }];

  const BAR_W = 200;
  const ROW_H = 22;
  const PADDING_TOP = 50;
  const PADDING_BOTTOM = 30;
  const h = PADDING_TOP + langs.length * ROW_H + PADDING_BOTTOM;
  const w = 370;

  const rows = langs
    .map((lang, i) => {
      const y = PADDING_TOP + i * ROW_H;
      const barFill = Math.round((BAR_W * lang.pct) / 100);
      return `
    <circle cx="20" cy="${y + 8}" r="5" fill="${lang.color}"/>
    <text x="34" y="${y + 13}" ${FONT} font-size="12" fill="${t.value}">${lang.name}</text>
    <rect x="155" y="${y + 2}" width="${BAR_W}" height="11" rx="5" fill="${t.barBg}"/>
    <rect x="155" y="${y + 2}" width="${barFill}" height="11" rx="5" fill="${lang.color}" opacity="0.85"/>
    <text x="${155 + BAR_W + 8}" y="${y + 13}" ${FONT} font-size="11" fill="${t.label}">${lang.pct}%</text>`;
    })
    .join("");

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>Top Languages — ${USERNAME}</title>
  <desc>Most used languages by repository byte count</desc>
  <rect width="${w}" height="${h}" rx="12" fill="${t.bg}" stroke="${t.border}" stroke-width="1"/>
  <text x="20" y="28" ${FONT} font-size="15" font-weight="600" fill="${t.accent}">Top Languages</text>
  <line x1="0" y1="38" x2="${w}" y2="38" stroke="${t.border}" stroke-width="0.5"/>
  ${rows}
  <line x1="0" y1="${h - 22}" x2="${w}" y2="${h - 22}" stroke="${t.border}" stroke-width="0.5"/>
  <text x="${Math.round(w / 2)}" y="${h - 8}" ${FONT} font-size="10" text-anchor="middle" fill="${t.label}">Updated ${data.updated} · generated by GitHub Actions</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!TOKEN) {
    console.error("GITHUB_TOKEN is not set.");
    process.exit(1);
  }

  const data = await collectData();

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const files: Record<string, string> = {
    "stats-light.svg": statssvg(data, "light"),
    "stats-dark.svg":  statssvg(data, "dark"),
    "langs-light.svg": langssvg(data, "light"),
    "langs-dark.svg":  langssvg(data, "dark"),
  };

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(OUTPUT_DIR, filename), content, "utf-8");
    console.log(`  Written: generated/${filename}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
