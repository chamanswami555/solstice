// Builds the write-up PDF from docs/write-up.html with a real browser engine.
// The App Key comes from .env.local and the traction counts from the live usage page, at build time.
// The PDF holds the App Key, so write it outside the repository.
// Usage (from the repository root): node docs/build-write-up.mjs <out.pdf>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out || !out.endsWith(".pdf")) throw new Error("Give the output file, ending in .pdf, outside the repository.");
const LIVE = "https://solstice-black.vercel.app";

const appKey = readFileSync(".env.local", "utf8").match(/^NEXCONN_APP_KEY=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!appKey || !/^[A-Za-z0-9]+$/.test(appKey)) throw new Error("NEXCONN_APP_KEY in .env.local is missing or has an unexpected shape.");

// The repository address comes from git, so no account name is written in a tracked file.
const remote = execFileSync("git", ["remote", "get-url", "origin"]).toString().trim();
const repoUrl = `https://github.com/${remote.replace(/^git@github\.com:|^https:\/\/github\.com\//, "").replace(/\.git$/, "")}`;
if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repoUrl)) throw new Error("The origin remote is not a GitHub repository.");

const now = () => new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const answer = await fetch(`${LIVE}/api/usage`);
if (!answer.ok) throw new Error(`The live usage page answered ${answer.status}.`);
const { usage } = await answer.json();
const usageAt = now();
const row = (label, kind) => `<tr><td>${label}</td><td>${kind.rooms}</td><td>${kind.people}</td><td>${kind.draws}</td><td>${kind.reveals}</td></tr>`;
const usageTable = `<table>
  <tr><th>Kind of room</th><th>Rooms</th><th>People</th><th>Draws</th><th>Finished reveals</th></tr>
  ${row("Tonight round", usage.tonight)}${row("December room", usage.december)}${row("Demo room (one visitor)", usage.demo)}
  <tr><td><b>People in all rooms</b></td><td></td><td><b>${usage.people}</b></td><td></td><td></td></tr>
</table>`;

// Images go inside the page, so the PDF needs no files next to it.
const html = readFileSync("docs/write-up.html", "utf8")
  .replace(/src="images\/([a-z-]+\.png)"/g, (_, name) => `src="data:image/png;base64,${readFileSync(`docs/images/${name}`).toString("base64")}"`)
  .replace("{{APP_KEY}}", appKey)
  .replace("{{REPO_URL}}", repoUrl)
  .replace("{{BUILT_AT}}", now())
  .replace("{{USAGE_AT}}", usageAt)
  .replace("{{USAGE_TABLE}}", usageTable);
const left = html.match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error(`Fields with no value: ${left.join(", ")}`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
} finally {
  await browser.close();
}
console.log(`written: ${out} (usage at ${usageAt} IST: ${usage.people} people)`);
