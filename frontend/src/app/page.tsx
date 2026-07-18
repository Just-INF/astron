import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Bot, Layers3, MenuSquare, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Pricing } from "@/components/marketing/Pricing";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { BrandLogo } from "@/components/BrandLogo";
import heroVideo from "@/assets/landing/hero_bg.mp4";
import heroImage from "@/assets/landing/hero.png";
import { useAuthStore } from "@/stores/useAuthStore";

const products = [
  {
    number: "01",
    title: "One operational picture",
    copy: "See floor plans, covers, revenue, and table pace in a single live command centre.",
    icon: Layers3,
    accent: "blue",
  },
  {
    number: "02",
    title: "Menus without the margin for error",
    copy: "Publish, update, and govern every menu from one source of truth-across every location.",
    icon: MenuSquare,
    accent: "violet",
  },
  {
    number: "03",
    title: "Intelligence that stays useful",
    copy: "Nora turns service patterns into practical prompts your team can act on immediately.",
    icon: Bot,
    accent: "mint",
  },
];

function HeroVideo() {
  return (
    <video className="saas-hero-video" autoPlay muted playsInline aria-hidden="true">
      <source src={heroVideo} type="video/mp4" />
    </video>
  );
}

export default function Home() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const currentUser = useAuthStore((state) => state.currentUser);
  const isAuthenticated = hasHydrated && Boolean(currentUser);

  return (
    <main className="saas-page">
      <section className="saas-hero" id="top">
        <HeroVideo />
        <div className="saas-hero-video-shade" />
        <div className="saas-aurora" />
        <div className="saas-grid" />
        <header className="saas-header saas-shell">
          <a className="saas-wordmark" href="#top" aria-label="Astron home">
            <BrandLogo /> Astron
          </a>
          <nav aria-label="Main navigation">
            <a href="#platform">Platform</a>
            <a href="#nora">Intelligence</a>
            <a href="#customers">Customers</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div>
            {isAuthenticated ? (
              <Link to="/account" className="saas-header-cta">
                Open dashboard <ArrowUpRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/auth/login" className="login-link">
                  Sign in
                </Link>
                <a href="#pricing" className="saas-header-cta">
                  Book a demo <ArrowUpRight size={14} />
                </a>
              </>
            )}
          </div>
        </header>
        <div className="saas-shell hero-layout">
          <div className="saas-hero-copy">
            <h1>
              Run every
              <br />
              service with <em>clarity.</em>
            </h1>
            <p className="saas-lede">
              Astron gives ambitious restaurant groups a real-time command centre for menus, floors,
              and the decisions that shape every service.
            </p>
            <div className="saas-actions">
              {isAuthenticated ? (
                <Link to="/account" className="saas-button saas-button-primary">
                  Open dashboard <ArrowRight size={16} />
                </Link>
              ) : (
                <a href="#pricing" className="saas-button saas-button-primary">
                  Book a demo <ArrowRight size={16} />
                </a>
              )}
              <a href="#platform" className="saas-button saas-button-quiet">
                Explore the platform
              </a>
            </div>
            <div className="hero-proof">
              <div className="proof-avatars">
                <i>AL</i>
                <i>NM</i>
                <i>SD</i>
                <i>+</i>
              </div>
              <p>
                Trusted by forward-thinking
                <br />
                <b>independent hospitality groups</b>
              </p>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-axis axis-one" />
            <div className="visual-axis axis-two" />
            <img src={heroImage} alt="" className="hero-image" aria-hidden="true" />
          </div>
        </div>
        <div className="saas-shell hero-logos">
          <span>BUILT FOR TEAMS AT</span>
          <b>MAISON ASTRAL</b>
          <b>ORIEL</b>
          <b>HOUSE OF LUNE</b>
          <b>ÁUREA</b>
          <b>FOUR CORNERS</b>
        </div>
      </section>

      <ScrollReveal direction="up" distance={32}>
        <section className="saas-intro" id="platform">
          <div className="saas-shell saas-intro-inner">
            <p className="saas-eyebrow">AN OPERATING LAYER, NOT ANOTHER TOOL</p>
            <div>
              <h2>
                Everything your team needs <em>to move in one direction.</em>
              </h2>
              <p>
                Turn the complexity of multi-service hospitality into a focused, connected
                operational system. Astron provides the visibility teams need, without slowing them
                down.
              </p>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <section className="product-section">
        <div className="saas-shell product-heading">
          <p className="saas-eyebrow">THE PLATFORM</p>
          <h2>
            Designed for the way
            <br />
            <span>service actually works.</span>
          </h2>
        </div>
        <div className="saas-shell product-list">
          {products.map((product, i) => {
            const Icon = product.icon;
            return (
              <ScrollReveal key={product.number} direction="up" distance={20} delay={i * 0.08}>
                <motion.article
                  className={`product-row ${product.accent}`}
                  whileHover={{ y: -3 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                  <div className="product-number">{product.number}</div>
                  <motion.div className="product-icon" whileHover={{ y: -2, scale: 1.03 }}>
                    <Icon size={20} />
                  </motion.div>
                  <div className="product-copy">
                    <h3>{product.title}</h3>
                    <p>{product.copy}</p>
                    <a href="#pricing">
                      Explore capability <ArrowUpRight size={15} />
                    </a>
                  </div>
                  <div className="product-graphic">
                    <div className="graph-caption">
                      {product.accent === "blue"
                        ? "Live service flow"
                        : product.accent === "violet"
                          ? "Controlled publishing"
                          : "Actionable insight"}
                    </div>
                    <span />
                    <i />
                    <b />
                  </div>
                </motion.article>
              </ScrollReveal>
            );
          })}
        </div>
      </section>

      <ScrollReveal direction="up" distance={24}>
        <section className="metrics-band">
          <div className="metrics-band-inner">
            <motion.div>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <b>1</b>
                <span>
                  live view for menus,
                  <br />
                  tables and service
                </span>
              </motion.div>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <b>7</b>
                <span>
                  scoped staff roles
                  <br />
                  with tenant isolation
                </span>
              </motion.div>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <b>
                  24<small>/7</small>
                </b>
                <span>
                  guest menu and
                  <br />
                  booking availability
                </span>
              </motion.div>
            </motion.div>
            <p>Product capabilities available in Astron.</p>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal direction="up" distance={24}>
        <section className="nora-saas" id="nora">
          <div className="saas-shell nora-saas-grid">
            <div>
              <p className="saas-eyebrow">
                <Sparkles size={13} /> ASTRON INTELLIGENCE
              </p>
              <h2>
                Make the right call
                <br />
                <em>while it still matters.</em>
              </h2>
              <p>
                Nora reads the rhythm of service in real time, surfaces the signal, and gives your
                team a useful next step. Every recommendation remains firmly in your control.
              </p>
              <a href="#pricing" className="saas-button saas-button-primary">
                Meet Nora <ArrowRight size={16} />
              </a>
            </div>
            <motion.div
              className="nora-panel"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              <div className="nora-panel-head">
                <span className="nora-orb">
                  <Sparkles size={16} />
                </span>
                <div>
                  <small>NORA · ASTRON INTELLIGENCE</small>
                  <b>Service signal</b>
                </div>
                <i>Just now</i>
              </div>
              <div className="nora-panel-body">
                <p>
                  The terrace is turning <strong>12 minutes faster</strong> than the main room
                  tonight.
                </p>
                <div className="nora-insight">
                  <span>OBSERVATION</span>
                  <p>
                    3 upcoming terrace reservations can be seated earlier without affecting their
                    experience.
                  </p>
                </div>
                <div className="nora-panel-actions">
                  <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
                    Review details
                  </motion.button>
                  <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
                    Prepare adjustment <ArrowRight size={13} />
                  </motion.button>
                </div>
              </div>
              <div className="nora-rings">
                <i />
                <i />
                <i />
              </div>
            </motion.div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal direction="up" distance={24}>
        <section className="customer-quote" id="customers">
          <div className="saas-shell">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="quote-mark">✦</div>
              <blockquote>
                See the product with your own service model-not a manufactured success story.
              </blockquote>
              <div className="quote-attribution">
                <p>
                  <b>Guided product walkthrough</b>
                  <span>Menus, floor, reservations, orders and reporting</span>
                </p>
                <a className="saas-header-cta" href="mailto:hello@astron.com">
                  Book a demo
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal direction="up" distance={24}>
        <section className="saas-pricing saas-shell" id="pricing">
          <div className="saas-pricing-intro">
            <p className="saas-eyebrow">FLEXIBLE BY DESIGN</p>
            <h2>
              Start with one
              <br />
              <em>service. Scale.</em>
            </h2>
            <p>
              Simple plans for individual restaurants and multi-site groups-without the enterprise
              theatre.
            </p>
            <a href="mailto:hello@astron.com">
              Questions about your team? Let&apos;s talk <ArrowUpRight size={14} />
            </a>
          </div>
          <Pricing />
        </section>
      </ScrollReveal>

      <ScrollReveal direction="up" distance={24}>
        <footer className="saas-footer">
          <div className="saas-shell">
            <motion.div className="saas-footer-top">
              <a className="saas-wordmark" href="#top">
                <BrandLogo /> Astron
              </a>
              <p>
                Operational clarity for
                <br />
                the places people remember.
              </p>
              <a href="mailto:hello@astron.com">
                hello@astron.com <ArrowUpRight size={15} />
              </a>
            </motion.div>
            <div className="saas-footer-links">
              <div>
                <b>Product</b>
                <a href="#platform">Platform</a>
                <a href="#nora">Intelligence</a>
                <a href="#pricing">Pricing</a>
              </div>
              <div>
                <b>Company</b>
                <a href="#customers">Customers</a>
                <a href="mailto:hello@astron.com">Contact</a>
                <a href="#pricing">Book a demo</a>
              </div>
              <div>
                <b>Legal</b>
                <Link to="/terms">Terms of service</Link>
                <Link to="/privacy">Privacy policy</Link>
                <Link to="/cookies">Cookie policy</Link>
              </div>
            </div>
            <div className="saas-footer-bottom">
              <span>© 2026 ASTRON. All rights reserved.</span>
              <a href="mailto:privacy@astron.com">Privacy requests</a>
              <a href="#top">Back to top ↑</a>
            </div>
          </div>
        </footer>
      </ScrollReveal>
    </main>
  );
}
