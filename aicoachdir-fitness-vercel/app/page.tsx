import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="nav">
        <Link href="/" className="brand">AI <span>COACHDIR</span></Link>
        <Link href="/fitness/signup" className="nav-cta">Start Fitness Coach</Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">AI FITNESS COACH</p>
          <h1>Get fit. Stay consistent. <span>Keep moving forward.</span></h1>
          <p className="lede">
            Personalized fitness guidance and encouragement designed to help you build realistic habits,
            stay accountable, and make steady progress at your own pace.
          </p>
          <div className="cta-row">
            <Link href="/fitness/signup" className="primary-button">Start Your Fitness Coach</Link>
            <a href="#how-it-works" className="secondary-button">How it works</a>
          </div>
          <p className="microcopy">Private • Personalized • Available anytime</p>
        </div>

        <div className="hero-art" aria-label="AI Coach Directory brand artwork">
          <img src="https://aicoachdir.com/assets/images/image01.jpg?v=3db95b79" alt="AI Coach Directory glowing tree artwork" />
        </div>
      </section>

      <section className="feature-grid" id="how-it-works">
        <article><div className="icon">01</div><h2>Tell it your goal</h2><p>Share your fitness level, schedule, preferences, and what you want to accomplish.</p></article>
        <article><div className="icon">02</div><h2>Get a practical plan</h2><p>Receive personalized coaching that adapts to your needs instead of a one-size-fits-all routine.</p></article>
        <article><div className="icon">03</div><h2>Stay accountable</h2><p>Check in, adjust your plan, work through obstacles, and keep building momentum.</p></article>
      </section>

      <section className="brand-panel">
        <div>
          <p className="eyebrow">YOUR JOURNEY. YOUR PACE.</p>
          <h2>A fitness coach that meets you where you are.</h2>
          <p>Your motivating workout companion—built around consistency, personalized guidance, and encouragement.</p>
          <Link href="/fitness/signup" className="primary-button">Review Terms & Sign Up</Link>
        </div>
        <img src="https://aicoachdir.com/assets/images/image02.jpg?v=3db95b79" alt="AI Coach Directory Discover Connect Transform artwork" />
      </section>

      <footer>
        <span>KCB Integrative, LLC</span>
        <Link href="/fitness/signup">Terms & Subscription</Link>
      </footer>
    </main>
  );
}
