/**
 * generate_badges.ts
 * Generates C2-style SVG skill badges (colored left border + real icon + name).
 * Reads icon SVGs from assets/skills&tools/ and embeds them inline.
 * Falls back to fetching from devicons for icons without local files.
 * Produces light + dark variants in generated/badges/.
 * Run via: npx tsx .github/scripts/generate_badges.ts
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, "..", "..");
const OUTPUT_DIR = join(REPO_ROOT, "generated", "badges");

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// Devicons base URL for fallback icons
const DEVICONS = "https://raw.githubusercontent.com/devicons/devicon/master/icons";

// ---------------------------------------------------------------------------
// Badge definitions
// ---------------------------------------------------------------------------

interface Badge {
  name: string;            // Display name
  color: string;           // Brand hex (for left border)
  filename: string;        // Output filename (without theme suffix / extension)
  iconPath?: string;       // Relative path to local SVG icon (light theme)
  iconPathDark?: string;   // Relative path to local SVG icon (dark theme), if different
  iconUrl?: string;        // Fallback: URL to fetch icon SVG from
}

const BADGES: Badge[] = [
  // ── Frontend ─────────────────────────────────────────────────────────────
  {
    name: "HTML5",  color: "#E34F26", filename: "html5",
    iconPath: "assets/skills&tools/skills/html.svg",
  },
  {
    name: "CSS3",   color: "#1572B6", filename: "css3",
    iconPath: "assets/skills&tools/skills/css.svg",
  },
  {
    name: "JavaScript", color: "#F7DF1E", filename: "javascript",
    iconPath: "assets/skills&tools/skills/javascript.svg",
  },
  {
    name: "TypeScript", color: "#3178C6", filename: "typescript",
    iconPath: "assets/skills&tools/skills/typescript.svg",
  },
  {
    name: "Vue.js",  color: "#42B883", filename: "vuejs",
    iconPath: "assets/skills&tools/frameworks/vue.svg",
  },
  {
    name: "SASS",    color: "#CC6699", filename: "sass",
    iconUrl: `${DEVICONS}/sass/sass-original.svg`,
  },
  {
    name: "Bootstrap", color: "#7952B3", filename: "bootstrap",
    iconUrl: `${DEVICONS}/bootstrap/bootstrap-original.svg`,
  },
  {
    name: "jQuery",  color: "#0769AD", filename: "jquery",
    iconUrl: `${DEVICONS}/jquery/jquery-original.svg`,
  },
  // ── Backend ───────────────────────────────────────────────────────────────
  {
    name: "Java",    color: "#007396", filename: "java",
    iconPath: "assets/skills&tools/skills/java.svg",
  },
  {
    name: "Spring",  color: "#6DB33F", filename: "spring",
    iconPath: "assets/skills&tools/frameworks/spring.svg",
  },
  {
    name: "PHP 8",   color: "#777BB4", filename: "php",
    iconPath: "assets/skills&tools/skills/php.svg",
  },
  {
    name: "Laravel", color: "#FF2D20", filename: "laravel",
    iconUrl: `${DEVICONS}/laravel/laravel-original.svg`,
  },
  {
    name: "Rust",    color: "#CE422B", filename: "rust",
    iconPath:     "assets/skills&tools/skills/rust-light.svg",
    iconPathDark: "assets/skills&tools/skills/rust-dark.svg",
  },
  // ── Database & DevOps ─────────────────────────────────────────────────────
  {
    name: "MySQL",      color: "#4479A1", filename: "mysql",
    iconPath: "assets/skills&tools/skills/mysql.svg",
  },
  {
    name: "PostgreSQL", color: "#4169E1", filename: "postgresql",
    iconUrl: `${DEVICONS}/postgresql/postgresql-original.svg`,
  },
  {
    name: "Docker",     color: "#2496ED", filename: "docker",
    iconPath: "assets/skills&tools/skills/docker.svg",
  },
];

// ---------------------------------------------------------------------------
// SVG parsing helpers
// ---------------------------------------------------------------------------

interface ParsedSVG {
  viewBox: string;
  content: string;
}

function parseSVG(svgText: string): ParsedSVG {
  // Extract viewBox
  const viewBoxMatch = svgText.match(/viewBox="([^"]+)"/);
  let viewBox = viewBoxMatch ? viewBoxMatch[1] : "";

  // Derive viewBox from width/height if missing
  if (!viewBox) {
    const wMatch = svgText.match(/<svg[^>]+width="([^"]+)"/);
    const hMatch = svgText.match(/<svg[^>]+height="([^"]+)"/);
    const w = wMatch ? wMatch[1].replace(/[^0-9.]/g, "") : "100";
    const h = hMatch ? hMatch[1].replace(/[^0-9.]/g, "") : "100";
    viewBox = `0 0 ${w} ${h}`;
  }

  // Strip outer SVG wrapper and preamble, keep inner content
  const content = svgText
    .replace(/<\?xml[^>]*\?>\s*/gi, "")
    .replace(/<!DOCTYPE[^>]*>\s*/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .trim();

  return { viewBox, content };
}

async function loadIcon(badge: Badge, dark: boolean): Promise<ParsedSVG | null> {
  // 1. Try appropriate local file
  const localPath = dark && badge.iconPathDark ? badge.iconPathDark : badge.iconPath;

  if (localPath) {
    const abs = join(REPO_ROOT, localPath);
    if (existsSync(abs)) {
      return parseSVG(readFileSync(abs, "utf-8"));
    }
    console.warn(`  [WARN] Local icon not found: ${localPath}`);
  }

  // 2. Fetch from URL
  if (badge.iconUrl) {
    try {
      const res = await fetch(badge.iconUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseSVG(await res.text());
    } catch (e) {
      console.warn(`  [WARN] Failed to fetch icon for ${badge.name}: ${e}`);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Badge SVG generator
// ---------------------------------------------------------------------------

function calcWidth(name: string): number {
  // Left border (3) + icon area (30) + gap (5) + text (~7.5px/char) + right padding (14)
  return Math.max(100, Math.round(52 + name.length * 7.5 + 14));
}

async function generateBadge(b: Badge, dark: boolean): Promise<string> {
  const w   = calcWidth(b.name);
  const h   = 32;
  const mid = h / 2;

  const bg        = dark ? "#161b22" : "#ffffff";
  const border    = dark ? "#30363d" : "#e1e4e8";
  const nameColor = dark ? "#e6edf3" : "#24292f";

  const icon = await loadIcon(b, dark);

  // Embed real icon as nested <svg> viewport — fully self-contained
  const iconSVG = icon
    ? `<svg x="8" y="6" width="20" height="20" viewBox="${icon.viewBox}">\n    ${icon.content}\n  </svg>`
    : `<rect x="8" y="6" width="20" height="20" rx="3" fill="${b.color}" opacity="0.25"/>
  <text x="18" y="20" font-family="monospace" font-size="9" font-weight="700" text-anchor="middle" fill="${nameColor}">${b.name.slice(0, 2).toUpperCase()}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" role="img">
  <title>${b.name}</title>
  <!-- background -->
  <rect width="${w}" height="${h}" rx="6" fill="${bg}" stroke="${border}" stroke-width="0.5"/>
  <!-- colored left border (two rects: rounded rect + flush fill to square off right side) -->
  <rect width="3" height="${h}" rx="1.5" fill="${b.color}"/>
  <rect x="1.5" width="1.5" height="${h}" fill="${b.color}"/>
  <!-- icon -->
  ${iconSVG}
  <!-- label -->
  <text x="35" y="${mid + 4.5}" font-family="${FONT}" font-size="12" font-weight="500" fill="${nameColor}">${b.name}</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log("Generating C2-style skill badges with real icons...\n");

  for (const b of BADGES) {
    const [lightSvg, darkSvg] = await Promise.all([
      generateBadge(b, false),
      generateBadge(b, true),
    ]);
    writeFileSync(join(OUTPUT_DIR, `${b.filename}-light.svg`), lightSvg, "utf-8");
    writeFileSync(join(OUTPUT_DIR, `${b.filename}-dark.svg`),  darkSvg,  "utf-8");
    console.log(`  ✓  ${b.filename}-{light,dark}.svg`);
  }

  console.log(`\nDone — ${BADGES.length * 2} SVG files written to generated/badges/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
