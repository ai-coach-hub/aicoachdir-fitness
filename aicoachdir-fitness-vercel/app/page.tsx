import Link from "next/link";

const plan = {
  name: "AI Fitness Coach 2.0",
  price: "$15",
  cadence: "monthly",
  uses: "400",
};

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="nav">
        <Link href="/" className="brand" aria-label="AI Coach Directory home">
          <span className="brand-mark">AI</span>
          <span className="brand-name">COACH DIRECTORY</span>
        </Link>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/terms">Terms</Link>
          <Link href="/fitness/signup" className="nav-cta">Start Fitness Coach</Link>
        </nav>
      </header>

      <section className="hero-copy-section">
        <p className="eyebrow">AI FITNESS COACH</p>
        <h1>Get fit. Get motivated. <span>Get results.</span></h1>
        <p className="lede">
          Personalized AI fitness guidance, workout planning, accountability, and progress support designed to help you build momentum one step at a time.
        </p>
      </section>

      <section className="fitness-visual" aria-label="AI Coaching for Fitness">
        <img src="/images/ai-coaching-for-fitness.jpg" alt="AI Coaching for Fitness promotional artwork" />
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
          <Link href="/fitness/signup" className="primary-button">Review Terms & Get Started</Link>
          <small>Terms acceptance required before subscription</small>
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
          <Link href="/fitness/signup" className="primary-button">Review Terms & Subscribe</Link>
          <Link href="/terms" className="secondary-button">Read Full Terms</Link>
        </div>
      </section>

      <footer>
        <span>KCB Integrative LLC</span>
        <div className="footer-links">
          <Link href="/terms">Terms & Conditions</Link>
          <Link href="/fitness/signup">Subscription Signup</Link>
        </div>
      </footer>
    </main>
  );
}
