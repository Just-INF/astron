import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement and who may use Astron",
    content: (
      <>
        <p>
          These Terms form a binding agreement between you and Astron for use of Astron’s websites,
          applications, APIs, QR experiences and restaurant-management services (the “Service”). By
          creating an account, accepting an invitation or using the Service, you agree to these Terms
          and our <a href="/privacy">Privacy policy</a>.
        </p>
        <p>
          You must be at least 18 and legally able to enter a contract. If you use Astron for a company
          or restaurant, you confirm that you are authorised to bind that organisation. Restaurant
          guests may use public menu, ordering, service-request and reservation features without an
          Astron account; the restaurant’s own terms may also apply.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and access",
    content: (
      <>
        <p>
          Provide accurate information, keep credentials confidential and promptly tell us about
          suspected unauthorised access. You are responsible for activity under your account unless it
          results from Astron’s failure to use reasonable security measures.
        </p>
        <p>
          Restaurant owners and managers control invitations and role-based permissions for their
          workspace. Do not share an account between people or bypass access controls. We may require
          email verification, revoke sessions or temporarily restrict access to protect the Service.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: "The Service and restaurant responsibility",
    content: (
      <>
        <p>
          Astron provides tools for menus, floor plans, reservations, orders, service requests,
          analytics, team access and assisted workflows. The restaurant-not Astron-is responsible for
          its menu accuracy, allergens, prices, taxes, table availability, guest service, fulfilment and
          compliance with laws applying to its business.
        </p>
        <p>
          A reservation or order shown in Astron is an operational record between the guest and the
          restaurant. Astron is not the restaurant, does not prepare food and is not a party to that
          transaction. Guests should contact the restaurant about changes, refunds, allergies or
          fulfilment issues.
        </p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Plans, billing and cancellation",
    content: (
      <>
        <p>
          Paid features, prices, billing intervals and any trial terms are shown before purchase.
          Subscriptions renew for the displayed interval until cancelled. Taxes may be added where
          required. Checkout, payment details, invoices and refunds are handled through Lemon Squeezy;
          its checkout terms and privacy notice also apply.
        </p>
        <p>
          You can manage or cancel a subscription through the billing portal. Cancellation stops future
          renewals and access continues until the end of the paid period unless the checkout terms or
          mandatory law require otherwise. Fees already charged are non-refundable except where
          required by law or expressly stated at purchase. We will give reasonable advance notice of a
          price change affecting a future renewal.
        </p>
      </>
    ),
  },
  {
    id: "content",
    title: "Your content and data",
    content: (
      <>
        <p>
          You retain ownership of content you submit, including menu text, images, layouts and business
          data. You grant Astron a worldwide, non-exclusive licence to host, copy, process, display and
          transmit that content only as needed to provide, secure and improve the Service and meet our
          legal obligations.
        </p>
        <p>
          You confirm that you have the rights and lawful basis needed to provide the content and
          personal data you upload. You must not upload unlawful, misleading, infringing or malicious
          material. Restaurants are responsible for giving guests and staff appropriate privacy
          information and handling their data-subject requests.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You must not use the Service to:</p>
        <ul>
          <li>break the law, infringe rights or facilitate fraud or harm;</li>
          <li>access another customer’s data or account without permission;</li>
          <li>probe, disrupt, overload or circumvent security or usage limits;</li>
          <li>upload malware, scrape the Service at scale or reverse engineer it except where law permits;</li>
          <li>send spam or use guest information for unrelated marketing without a lawful basis; or</li>
          <li>misrepresent AI-generated suggestions as verified facts without appropriate review.</li>
        </ul>
        <p>We may investigate violations and restrict or remove harmful content or access proportionately.</p>
      </>
    ),
  },
  {
    id: "nora",
    title: "Nora and automated assistance",
    content: (
      <>
        <p>
          Nora can summarise information and prepare proposed operational changes. Its output may be
          incomplete or incorrect and is not legal, tax, medical, food-safety or other professional
          advice. Review outputs before relying on them. Astron requires a human confirmation before
          Nora executes a proposed change through the Service.
        </p>
        <p>
          Do not enter secrets or sensitive personal data into Nora unless necessary and authorised.
          Relevant prompts and limited restaurant context may be sent to an AI service provider to
          generate a response, as explained in our Privacy policy.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    content: (
      <>
        <p>
          We aim to operate the Service reliably, but do not promise uninterrupted or error-free
          availability. Maintenance, security incidents, internet failures and third-party services may
          affect access. Keep appropriate operational backups and contingency procedures where an
          outage could affect restaurant service.
        </p>
        <p>
          We may improve, replace or discontinue features. For a material reduction to a paid Service,
          we will provide reasonable notice where practicable. Beta or preview features may change or
          be withdrawn and are provided for evaluation.
        </p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Astron intellectual property",
    content: (
      <p>
        Astron and its licensors own the Service, software, designs, documentation, trademarks and all
        related rights, excluding your content. Subject to these Terms and payment of applicable fees,
        we grant you a limited, non-exclusive, non-transferable and revocable right to use the Service
        for your internal business operations. Feedback may be used without restriction or obligation.
      </p>
    ),
  },
  {
    id: "suspension",
    title: "Suspension and termination",
    content: (
      <>
        <p>
          You may stop using Astron at any time and cancel paid plans through the billing portal. We may
          suspend or terminate access for a material breach, non-payment, legal requirement or a
          credible security risk. When reasonable, we will give notice and an opportunity to cure.
        </p>
        <p>
          On termination, your licence ends. Provisions that by nature should survive-including payment,
          ownership, confidentiality, disclaimers and liability limits-remain effective. Data handling
          after termination is described in the Privacy policy and any applicable data-processing terms.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Warranties and liability",
    content: (
      <>
        <p>
          To the maximum extent permitted by law, the Service is provided “as is” and “as available”.
          Astron disclaims implied warranties of merchantability, fitness for a particular purpose and
          non-infringement. Nothing in these Terms excludes warranties or rights that cannot legally be
          excluded.
        </p>
        <p>
          To the maximum extent permitted by law, neither party is liable for indirect, incidental,
          special, punitive or consequential loss, or lost profits, revenue, goodwill or data. Astron’s
          total liability arising from the Service is limited to the amount you paid Astron for the
          Service during the 12 months before the event giving rise to the claim. This limit does not
          apply to fraud, wilful misconduct, death or personal injury caused by negligence, or other
          liability that law does not allow us to limit.
        </p>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    content: (
      <>
        <p>
          These Terms are governed by Romanian law, without regard to conflict-of-law rules. The courts
          of Romania have jurisdiction, unless mandatory consumer or local law gives you the right to
          bring a claim elsewhere. Before filing a claim, please contact us so we can try to resolve it
          informally.
        </p>
        <p>
          If you are a consumer in the European Economic Area, these Terms do not reduce statutory
          consumer protections that apply to you. The Service is primarily offered to businesses; a
          restaurant guest’s consumer rights against the restaurant remain unaffected.
        </p>
      </>
    ),
  },
  {
    id: "changes-contact",
    title: "Changes and contact",
    content: (
      <>
        <p>
          We may update these Terms to reflect legal, security or product changes. We will post the new
          effective date and provide additional notice for material changes where appropriate. Continued
          use after the effective date means the revised Terms apply; if you disagree, stop using the
          Service and cancel before they take effect.
        </p>
        <p>
          Questions may be sent to <a href="mailto:hello@astron.com">hello@astron.com</a>. Privacy
          questions may be sent to <a href="mailto:privacy@astron.com">privacy@astron.com</a>.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="LEGAL"
      title="Terms of service"
      summary="The rules for using Astron, written for restaurant teams and the guests they serve."
      effectiveDate="18 July 2026"
      sections={sections}
    />
  );
}
