import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";

export function LegalPage({
  eyebrow,
  title,
  summary,
}: {
  eyebrow: string;
  title: string;
  summary: string;
}) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link to="/" className="saas-wordmark">
          <BrandLogo /> Astron
        </Link>
        <Link to="/">Back to home</Link>
      </header>
      <section className="legal-content">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-summary">{summary}</p>
        <div className="legal-notice">
          <h2>Review required before launch</h2>
          <p>
            This preview includes a destination for this legal document. Before publishing, Astron
            should replace it with counsel-approved content that reflects its registered company
            details, governing law, data practices, and service terms.
          </p>
        </div>
      </section>
    </main>
  );
}
