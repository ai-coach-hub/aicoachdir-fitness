import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

// Canonical resolves against metadataBase in app/layout.tsx.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const plan = {
  name: "AI Fitness Coach 2.0",
  price: "$15",
  cadence: "monthly",
  uses: "400",
};

const upcomingCoaches = [
  {
    name: "AI Coaching SpendSmart",
    tagline: "Save More. Spend Wisely. Plan Better.",
    description:
      "A future money-coaching experience focused on budgeting habits, smarter spending, and practical financial decision support.",
    image: "/images/ai-coaching-spendsmart.jpg",
    alt: "AI Coaching SpendSmart preview artwork",
  },
  {
    name: "AI Coaching for Life",
    tagline: "Find Balance, Purpose, and Happiness.",
    description:
      "A future life-coaching experience centered on mindset, personal growth, reflection, and day-to-day balance.",
    image: "/images/ai-coaching-for-life.jpg",
    alt: "AI Coaching for Life preview artwork",
  },
  {
    name: "AI Coaching for Career",
    tagline: "Achieve Your Professional Goals.",
    description:
      "A future career-coaching experience built to support professional growth, job readiness, and long-term advancement.",
    image: "/images/ai-coaching-for-career.jpg",
    alt: "AI Coaching for Career preview artwork",
  },
];

export default function HomePage() {
  return (
    <main className="site-shell">
      <SiteHeader />

      <section className="brand-showcase" aria-label="AI Coach Directory">
        <Image
          src="/images/ai-coach-directory-logo.jpg"
          alt="AI Coach Directory logo"
          width={220}
          height={220}
          priority
          className="brand-showcase-logo"
        />
        <div>
          <p className="eyebrow">AI COACH DIRECTORY<span className="tm-mark">™</span></p>
          <h2>Coaching support powered by AI, built around your goals.</h2>
          <p>AI Fitness Coach 2.0 is part of AI Coach Directory™ from KCB Integrative LLC.</p>
        </div>
      </section>

      <section className="hero-copy-section">
        <p className="eyebrow">AI FITNESS COACH</p>
        <h1>Get fit. Get motivated. <span>Get results.</span></h1>
        <p className="lede">
          Personalized AI fitness guidance, workout planning, accountability, and progress support designed to help you build momentum one step at a time.
        </p>
      </section>

      <section className="fitness-visual" aria-label="AI Coaching for Fitness">
        <Image
          src="/images/ai-coaching-for-fitness.jpg"
          alt="AI Coaching for Fitness promotional artwork"
          width={1536}
          height={1024}
          priority
          className="fitness-hero-image"
        />
      </section>

      <section className="coach-offer" aria-labelledby="coach-offer-title">
        <div className="coach-identity">
          <div className="coach-badge">2.0</div>
          <div>
            <p className="eyebrow compact-eyebrow">YOUR FITNESS COACH</p>
            <h2 id="coach-offer-title">{plan.name}</h2>
            <p>Personalized AI fitness guidance, workout plans, accountability, and progress support.</p>
          </div>
        </div>
        <div className="offer-stat">
          <strong>{plan.price}</strong>
          <span>/ {plan.cadence}</span>
          <small>Automatically renews until canceled</small>
        </div>
        <div className="offer-stat">
          <strong>{plan.uses}</strong>
          <span> uses / month</span>
          <small>Monthly coaching allowance</small>
        </div>
        <div className="offer-action">
          <Link href="/fitness/signup" className="primary-button">New Member — Review Terms</Link>
          <Link href="/fitness/login" className="secondary-button member-login-offer">Returning Member Login</Link>
        </div>
      </section>

      <section className="coach-difference-section" aria-labelledby="coach-difference-title">
        <div className="coach-difference-heading">
          <p className="eyebrow">WHY AI COACH DIRECTORY<span className="tm-mark">™</span></p>
          <h2 id="coach-difference-title">
            General AI Can Answer Your Questions. <span>Our AI Is Built to Coach You.</span>
          </h2>
          <p>
            Our AI Coaches are purpose-built to provide a more personalized, focused, and useful experience than a general AI assistant.
          </p>
        </div>

        <div className="coach-difference-grid">
          <article>
            <div className="value-icon">01</div>
            <h3>Specialized Knowledge</h3>
            <p>
              Each coach can be equipped with a curated library of <strong>specialized resources, documents, and expert material</strong> that general AI tools may not have access to.
            </p>
          </article>
          <article>
            <div className="value-icon">02</div>
            <h3>Built to Coach</h3>
            <p>
              Instead of simply answering questions, our AI Coaches are designed to <strong>guide, encourage, challenge, and personalize the experience</strong> around your goals and needs.
            </p>
          </article>
          <article>
            <div className="value-icon">03</div>
            <h3>Purpose-Built Expertise</h3>
            <p>
              Each AI Coach is designed around a specific area of expertise, giving you more relevant guidance without having to explain the context or create complicated prompts every time.
            </p>
          </article>
          <article>
            <div className="value-icon">04</div>
            <h3>Less Prompting. More Coaching.</h3>
            <p>The knowledge, approach, and coaching framework are already built in.</p>
          </article>
        </div>

        <div className="coach-difference-callout">
          <strong>Just tell your coach what you need and get started.</strong>
        </div>
      </section>

      <section className="feature-grid" id="how-it-works">
        <article>
          <div className="icon">01</div>
          <h2>Start with your goals</h2>
          <p>Share your current fitness level, schedule, preferences, and what you want to accomplish.</p>
        </article>
        <article>
          <div className="icon">02</div>
          <h2>Build a practical plan</h2>
          <p>Use AI-generated coaching to organize workouts, habits, motivation, and progress check-ins around your needs.</p>
        </article>
        <article>
          <div className="icon">03</div>
          <h2>Keep moving forward</h2>
          <p>Return for accountability, adjustments, encouragement, and ideas as your goals and circumstances change.</p>
        </article>
      </section>

      <section className="notice-panel">
        <p className="eyebrow">IMPORTANT</p>
        <h2>AI guidance is informational and motivational.</h2>
        <p>
          AI-generated responses may be incomplete, inaccurate, or unsuitable for your circumstances. The service is not medical care or a substitute for professional medical, nutritional, or fitness advice. Review the complete Terms & Conditions before subscribing.
        </p>
        <div className="cta-row">
          <Link href="/fitness/signup" className="primary-button">New Member — Review Terms & Subscribe</Link>
          <Link href="/fitness/login" className="secondary-button">Returning Member Login</Link>
          <Link href="/terms" className="secondary-button">Read Full Terms</Link>
        </div>
      </section>

      <section className="coming-soon-section" aria-labelledby="coming-soon-title">
        <div className="coming-soon-header">
          <div>
            <p className="eyebrow">COMING SOON</p>
            <h2 id="coming-soon-title">More AI coaching experiences are on the way.</h2>
            <p>
              AI Fitness Coach 2.0 remains the live featured offer. These upcoming coaching experiences are shown as previews so visitors can see what’s coming next from AI Coach Directory™.
            </p>
          </div>
        </div>

        <div className="coming-soon-grid">
          {upcomingCoaches.map((coach) => (
            <article key={coach.name} className="coming-soon-card">
              <div className="coming-soon-status-row">
                <span className="coming-soon-badge">Coming Soon</span>
              </div>
              <div className="coming-soon-image-wrap">
                <Image
                  src={coach.image}
                  alt={coach.alt}
                  width={1536}
                  height={1024}
                  className="coming-soon-image"
                />
              </div>
              <div className="coming-soon-copy">
                <h3>{coach.name}</h3>
                <p className="coming-soon-tagline">{coach.tagline}</p>
                <p>{coach.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <Image src="/images/ai-coach-directory-logo.jpg" alt="AI Coach Directory" width={58} height={58} className="footer-logo" />
          <span>KCB Integrative LLC · AI Coach Directory<span className="tm-mark">™</span></span>
        </div>
        <div className="footer-links">
          <Link href="/fitness/login">Member Login</Link>
          <Link href="/terms">Terms & Conditions</Link>
          <Link href="/fitness/signup">New Subscription</Link>
        </div>

        <p className="trademark-notice">
          © 2026 KCB Integrative LLC. AI Coach Directory<span className="tm-mark">™</span> and the AI Coach Directory logo are trademarks/service marks claimed by KCB Integrative LLC. All rights reserved. Third-party marks belong to their respective owners.
        </p>
      </footer>
    </main>
  );
}
