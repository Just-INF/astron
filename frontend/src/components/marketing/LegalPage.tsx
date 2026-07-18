import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export function LegalPage({
  eyebrow,
  title,
  summary,
  effectiveDate,
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  effectiveDate: string;
  sections: LegalSection[];
}) {
  return (
    <main className="legal-page" id="main-content">
      <header className="legal-header">
        <Link to="/" className="saas-wordmark" aria-label="Astron home">
          <BrandLogo /> Astron
        </Link>
        <Link to="/">Back to home</Link>
      </header>

      <div className="legal-layout">
        <aside className="legal-toc" aria-label={`${title} contents`}>
          <span>On this page</span>
          <nav>
            {sections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`}>
                <small>{String(index + 1).padStart(2, "0")}</small>
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="legal-content">
          <div className="legal-intro">
            <p>{eyebrow}</p>
            <h1>{title}</h1>
            <p className="legal-summary">{summary}</p>
            <p className="legal-effective">Effective: {effectiveDate}</p>
          </div>

          <div className="legal-notice" role="note">
            <strong>Plain-language commitment</strong>
            <p>
              We wrote this document to be read, not merely accepted. If anything is unclear,
              contact us before using the service.
            </p>
          </div>

          <div className="legal-sections">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id}>
                <div className="legal-section-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <h2>{section.title}</h2>
                  {section.content}
                </div>
              </section>
            ))}
          </div>

          <footer className="legal-document-footer">
            <p>Related documents</p>
            <div>
              {title !== "Terms of service" && <Link to="/terms">Terms of service</Link>}
              {title !== "Privacy policy" && <Link to="/privacy">Privacy policy</Link>}
              {title !== "Cookie policy" && <Link to="/cookies">Cookie policy</Link>}
            </div>
            <a href="mailto:privacy@astron.com">privacy@astron.com</a>
          </footer>
        </article>
      </div>
    </main>
  );
}
