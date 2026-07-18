import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";

const sections: LegalSection[] = [
  {
    id: "scope-roles",
    title: "Scope and our role",
    content: (
      <>
        <p>
          This policy explains how Astron handles personal data across its websites, applications,
          APIs, public menu and reservation pages, and related services.
        </p>
        <p>
          Astron is the data controller for account, billing-contact, website and service-security data.
          For guest reservations, orders, service requests and similar restaurant records, the relevant
          restaurant normally decides why and how the data is used and is the controller; Astron
          processes that data on the restaurant’s behalf. Guests should contact the restaurant first for
          requests about those records. We will assist the restaurant where required.
        </p>
      </>
    ),
  },
  {
    id: "data-collected",
    title: "Personal data we collect",
    content: (
      <>
        <ul>
          <li><strong>Account data:</strong> name, email address, password hash, verification status, organisation, restaurant memberships and roles.</li>
          <li><strong>Guest and operations data:</strong> reservation name and contact details, party size, time, table, notes, order and service-request details.</li>
          <li><strong>Business content:</strong> menus, images, floor plans, settings, invitations, audit history and content submitted to Nora.</li>
          <li><strong>Billing data:</strong> plan, subscription status, transaction identifiers, card brand and last four digits. Astron does not store full payment-card details.</li>
          <li><strong>Technical data:</strong> session identifiers, device/browser description, IP address where available, timestamps, logs and security events.</li>
          <li><strong>Communications:</strong> messages and requests you send to us, plus transactional email delivery records.</li>
        </ul>
        <p>
          We receive data directly from you, from restaurant staff or guests, automatically from the
          device and Service, and from providers such as Lemon Squeezy. Please do not submit special
          category data or secrets unless genuinely necessary and lawfully authorised.
        </p>
      </>
    ),
  },
  {
    id: "purposes-bases",
    title: "Why we use data and our legal bases",
    content: (
      <div className="legal-table-wrap" tabIndex={0} aria-label="Data processing purposes and legal bases">
        <table>
          <thead><tr><th>Purpose</th><th>Typical legal basis</th></tr></thead>
          <tbody>
            <tr><td>Create accounts, authenticate users and provide requested features</td><td>Contract; steps requested before a contract</td></tr>
            <tr><td>Process restaurant guest records on behalf of a restaurant</td><td>The restaurant’s instructions and legal basis</td></tr>
            <tr><td>Process subscriptions, invoices and required records</td><td>Contract; legal obligation</td></tr>
            <tr><td>Secure, troubleshoot and prevent abuse of the Service</td><td>Legitimate interests in a safe, reliable service; legal obligation where applicable</td></tr>
            <tr><td>Send verification, password, invitation and reservation messages</td><td>Contract; legitimate interests in operating the Service</td></tr>
            <tr><td>Improve features using aggregated or appropriately de-identified information</td><td>Legitimate interests in improving the Service</td></tr>
            <tr><td>Respond to legal requests and protect rights</td><td>Legal obligation; legitimate interests in establishing or defending claims</td></tr>
            <tr><td>Use optional analytics or marketing technologies, if introduced</td><td>Consent where required</td></tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "sharing",
    title: "Who receives personal data",
    content: (
      <>
        <p>We disclose only what is reasonably necessary to:</p>
        <ul>
          <li>the restaurant and authorised members of its workspace;</li>
          <li>hosting, database, storage, security and infrastructure providers;</li>
          <li>email providers that deliver account, invitation and reservation messages;</li>
          <li>Lemon Squeezy for checkout, subscription management, tax, invoices and payment support;</li>
          <li>our AI provider when an authorised user chooses to use Nora;</li>
          <li>professional advisers, auditors, insurers and authorities where legally justified; and</li>
          <li>a buyer or successor in a merger, financing, reorganisation or sale, subject to appropriate safeguards.</li>
        </ul>
        <p>
          We do not sell personal data and do not share it for cross-context behavioural advertising.
          Providers may use data only under their own lawful role or our contract and instructions.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "Nora and AI processing",
    content: (
      <>
        <p>
          When an authorised restaurant user sends a message to Nora, Astron stores the conversation
          and sends the prompt, recent conversation context and relevant tool results to an AI provider
          to generate the response. Avoid entering sensitive personal data. Restaurant users can delete
          conversations when they have no pending proposals.
        </p>
        <p>
          Nora may prepare recommendations or proposed changes, but a human must confirm operational
          changes. Astron does not use Nora to make decisions based solely on automated processing that
          produce legal or similarly significant effects about individuals.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    content: (
      <p>
        Some providers may process data outside Romania or the European Economic Area. Where the
        destination does not benefit from an adequacy decision, we use an approved transfer mechanism,
        such as the European Commission’s Standard Contractual Clauses, and supplementary safeguards
        where appropriate. Contact us for information about the safeguard relevant to your data.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    content: (
      <>
        <p>
          We keep account and workspace data while the account or customer relationship is active, then
          for the time reasonably needed to close the account, resolve disputes, enforce agreements and
          comply with law. Billing and tax records may be kept for the statutory accounting period.
          Security and audit records are retained for a limited period proportionate to their purpose.
        </p>
        <p>
          Restaurants set the operational retention needs for guest reservation and order data. We
          retain that data under their instructions and delete or return it after the service relationship
          ends, subject to backups, legal obligations and legitimate legal claims. Expired sessions and
          one-time authentication tokens are removed or rendered unusable according to their lifecycle.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <p>
        We use organisational and technical safeguards designed for the risk, including role-based
        access, hashed passwords and session tokens, encrypted transport, limited staff/provider access,
        audit records and backup and incident procedures. No internet service is perfectly secure. Use a
        unique password, restrict team permissions and notify us promptly if you suspect compromise.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your privacy rights",
    content: (
      <>
        <p>
          Depending on the law and context, you may request access, correction, deletion, restriction,
          portability or objection; withdraw consent at any time; and object to processing based on
          legitimate interests. Withdrawal does not affect earlier lawful processing. We may need to
          verify your identity and may retain data where law permits or requires.
        </p>
        <p>
          Email <a href="mailto:privacy@astron.com">privacy@astron.com</a>. For restaurant guest data,
          identify the restaurant and booking so we can route the request. You may also complain to your
          local data-protection authority or Romania’s National Supervisory Authority for Personal Data
          Processing (ANSPDCP) at <a href="https://www.dataprotection.ro/" target="_blank" rel="noreferrer">dataprotection.ro</a>.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    content: (
      <p>
        Astron business accounts are not intended for anyone under 18. Public restaurant features are
        not designed to collect children’s data independently; an adult should make a booking involving
        a child. If you believe a child provided account data without appropriate authorisation, contact
        us so we can investigate and delete it where required.
      </p>
    ),
  },
  {
    id: "changes-contact",
    title: "Changes and contact",
    content: (
      <>
        <p>
          We may update this policy when our practices, providers or legal obligations change. We will
          update the effective date and provide prominent or direct notice where a change materially
          affects your rights.
        </p>
        <p>
          Astron is the service operator and privacy contact. Email privacy questions or requests to
          <a href="mailto:privacy@astron.com"> privacy@astron.com</a>. General service questions can be
          sent to <a href="mailto:hello@astron.com">hello@astron.com</a>.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="PRIVACY"
      title="Privacy policy"
      summary="How Astron uses, shares and protects personal data-and the choices available to you."
      effectiveDate="18 July 2026"
      sections={sections}
    />
  );
}
