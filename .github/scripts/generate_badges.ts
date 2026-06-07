/**
 * generate_badges.ts
 * Generates C2-style SVG skill badges (colored left border + icon + name).
 * Produces light + dark variants in generated/badges/.
 * Run via: npx tsx .github/scripts/generate_badges.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const OUTPUT_DIR = join(process.cwd(), "generated", "badges");

interface Badge {
  name: string;       // Display name
  color: string;      // Brand hex color
  icon: string;       // 1-2 char abbreviation shown in the icon circle
  iconColor?: string; // Override icon text color (e.g. dark text on yellow)
  filename: string;   // Output filename (without extension)
}

// ---------------------------------------------------------------------------
// Badge definitions
// ---------------------------------------------------------------------------

const BADGES: Badge[] = [
  // Frontend
  { name: "HTML5",      color: "#E34F26", icon: "H5",  filename: "html5"       },
  { name: "CSS3",       color: "#1572B6", icon: "C3",  filename: "css3"        },
  { name: "JavaScript", color: "#F7DF1E", icon: "JS",  iconColor: "#323330", filename: "javascript" },
  { name: "TypeScript", color: "#3178C6", icon: "TS",  filename: "typescript"  },
  { name: "Vue.js",     color: "#42B883", icon: "V",   filename: "vuejs"       },
  { name: "SASS",       color: "#CC6699", icon: "S",   filename: "sass"        },
  { name: "Bootstrap",  color: "#7952B3", icon: "B",   filename: "bootstrap"   },
  { name: "jQuery",     color: "#0769AD", icon: "$",   filename: "jquery"      },
  // Backend
  { name: "Java",       color: "#007396", icon: "J",   filename: "java"        },
  { name: "Spring",     color: "#6DB33F", icon: "Sp",  filename: "spring"      },
  { name: "PHP 8",      color: "#777BB4", icon: "P",   filename: "php"         },
  { name: "Laravel",    color: "#FF2D20", icon: "L",   filename: "laravel"     },
  { name: "Rust",       color: "#CE422B", icon: "R",   filename: "rust"        },
  // Database & DevOps
  { name: "MySQL",      color: "#4479A1", icon: "M",   filename: "mysql"       },
  { name: "PostgreSQL", color: "#4169E1", icon: "Pg",  filename: "postgresql"  },
  { name: "Docker",     color: "#2496ED", icon: "D",   filename: "docker"      },
];

// ---------------------------------------------------------------------------
// SVG generation
// ---------------------------------------------------------------------------

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO  = "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace";

function calcWidth(name: string): number {
  // Approximate: icon area (36px) + text (7.5px per char) + right padding (16px)
  return Math.max(88, Math.round(36 + name.length * 7.5 + 16));
}

function badge(b: Badge, dark: boolean): string {
  const w   = calcWidth(b.name);
  const h   = 32;
  const mid = h / 2;

  const bg        = dark ? "#161b22" : "#ffffff";
  const border    = dark ? "#30363d" : "#e1e4e8";
  const nameColor = dark ? "#e6edf3" : "#24292f";
  const iconTxt   = b.iconColor ?? "#ffffff";
  const iconFs    = b.icon.length > 1 ? 9 : 11;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img">
  <title>${b.name}</title>
  <rect width="${w}" height="${h}" rx="6" fill="${bg}" stroke="${border}" stroke-width="0.5"/>
  <rect width="3" height="${h}" rx="1.5" fill="${b.color}"/>
  <rect x="1.5" width="1.5" height="${h}" fill="${b.color}"/>
  <circle cx="20" cy="${mid}" r="9" fill="${b.color}" opacity="0.18"/>
  <text x="20" y="${mid + 4}" font-family="${MONO}" font-size="${iconFs}" font-weight="700" text-anchor="middle" fill="${iconTxt}">${b.icon}</text>
  <text x="36" y="${mid + 4.5}" font-family="${FONT}" font-size="12" font-weight="500" fill="${nameColor}">${b.name}</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const b of BADGES) {
  writeFileSync(join(OUTPUT_DIR, `${b.filename}-light.svg`), badge(b, false), "utf-8");
  writeFileSync(join(OUTPUT_DIR, `${b.filename}-dark.svg`),  badge(b, true),  "utf-8");
  console.log(`  Generated: ${b.filename}-{light,dark}.svg`);
}

console.log(`\nDone — ${BADGES.length * 2} SVG files written to generated/badges/`);
