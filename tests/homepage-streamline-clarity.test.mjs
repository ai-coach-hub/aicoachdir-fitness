import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/SiteHeader.tsx", import.meta.url), "utf8");

test("homepage leads with the coaching proposition instead of duplicate branding", () => {
  const fromHeaderToHero = home.slice(
    home.indexOf("<SiteHeader />"),
    home.indexOf('      <section className={`hero-copy-section'),
  );
  assert.equal(fromHeaderToHero.trim(), "<SiteHeader />");
  assert.doesNotMatch(home, /brand-showcase/);
  assert.match(header, /AI Coach Directory home/);
});

test("homepage keeps focused signup and login with plain-language renewal disclosure", () => {
  assert.match(home, /PERSONALIZED COACHING · ONE MEMBERSHIP/);
  assert.match(home, /<Link href="\/fitness\/signup" className="primary-button">Get Started<\/Link>/);
  assert.match(home, /<Link href=\{memberLoginUrl\} className="secondary-button">Member Login<\/Link>/);
  assert.match(home, /\$15\/month · One membership · 400 AI Coach messages\/month · Automatically renews until canceled/);
  assert.match(home, /id="how-it-works"/);
  assert.doesNotMatch(home, /coach-difference-grid/);
});

test("AI limitations appear only in the small footer and link to Terms", () => {
  assert.doesNotMatch(home, /<section className="notice-panel"/);
  const footer = home.split('<footer className="site-footer">')[1] || "";
  assert.match(footer, /AI guidance may be inaccurate/);
  assert.match(footer, /href="\/terms"/);
});

test("Life Coach release gate and future previews remain dynamic", () => {
  assert.match(home, /export const dynamic = "force-dynamic"/);
  assert.match(home, /lifeAvailable &&/);
  assert.match(home, /coming-soon-grid/);
  assert.match(home, /coach\.name !== "AI Coaching for Life"/);
  assert.match(home, /Start Fitness Coach|Start Budgeting Coach/);
});
