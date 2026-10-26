import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/SiteHeader.tsx", import.meta.url), "utf8");

test("homepage leads with the coaching proposition instead of duplicate branding", () => {
  const fromHeaderToHero = home.slice(
    home.indexOf("<SiteHeader />"),
    home.indexOf('className={`hero-copy-section'),
  );
  assert.equal(fromHeaderToHero.trim(), "<SiteHeader />");
  assert.doesNotMatch(home, /brand-showcase/);
  assert.match(header, /AI Coach Directory home/);
});

test("homepage keeps focused signup and login with plain-language renewal disclosure", () => {
  assert.match(home, /PERSONALIZED COACHING · ONE MEMBERSHIP/);
  assert.match(home, /<Link href="\/fitness\/signup" className="primary-button">Get Started<\/Link>/);
  assert.match(home, /<Link href=\{memberLoginUrl\} className="secondary-button">Member Login<\/Link>/);
  assert.match(home, /\$15\/month · One membership · Automatically renews until canceled/);
  assert.match(home, /id="how-it-works"/);
  assert.doesNotMatch(home, /coach-difference-grid/);
});

test("short disclaimer retains access to full Terms without another signup prompt", () => {
  const disclaimer = home.split('<section className="notice-panel"')[1]?.split("</section>")[0] || "";
  assert.match(disclaimer, /AI guidance can be inaccurate/);
  assert.match(disclaimer, /href="\/terms"/);
  assert.doesNotMatch(disclaimer, /primary-button|secondary-button/);
});

test("Life Coach release gate and future previews remain dynamic", () => {
  assert.match(home, /export const dynamic = "force-dynamic"/);
  assert.match(home, /lifeAvailable &&/);
  assert.match(home, /coming-soon-grid/);
  assert.match(home, /coach\.name !== "AI Coaching for Life"/);
  assert.match(home, /Start Fitness Coach|Start Budgeting Coach/);
});
