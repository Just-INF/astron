import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";

const sections: LegalSection[] = [
  {
    id: "about",
    title: "About cookies and local storage",
    content: (
      <>
        <p>
          Cookies are small text records a website asks a browser to store. Similar browser storage,
          such as local storage, can remember a setting without sending it automatically with every web
          request. This policy covers both technologies used by Astron’s website and application.
        </p>
        <p>
          Astron currently uses these technologies for authentication, security and workspace
          preferences. We do not currently use advertising cookies or cross-site behavioural tracking.
        </p>
      </>
    ),
  },
  {
    id: "technologies",
    title: "Technologies Astron uses",
    content: (
      <div className="legal-table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type and provider</th><th>Purpose</th><th>Duration</th></tr></thead>
          <tbody>
            <tr><td><code>astron_session</code></td><td>Strictly necessary cookie · Astron</td><td>Authenticates the signed-in user and protects access to the account.</td><td>Up to 30 days; removed on sign-out for that session</td></tr>
            <tr><td><code>astron_cookie_consent</code></td><td>Consent preference · Astron local storage</td><td>Records acceptance for the current policy version so the prompt is not repeated.</td><td>Until cleared or the policy version changes</td></tr>
            <tr><td><code>astron_active_restaurant</code></td><td>Necessary preference · Astron local storage</td><td>Remembers which restaurant workspace the user last selected.</td><td>Until cleared or replaced</td></tr>
            <tr><td><code>astron_layouts</code></td><td>Necessary preference · Astron local storage</td><td>Remembers local editor selections, such as the selected table, wall or zone.</td><td>Until cleared or replaced</td></tr>
            <tr><td><code>astron_menus</code> and <code>astron_reservations</code></td><td>Application storage · Astron local storage</td><td>Store a version marker for application state; current builds do not persist menu or reservation records in these entries.</td><td>Until cleared or replaced</td></tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "strictly-necessary",
    title: "Your consent choice",
    content: (
      <>
        <p>
          The first time you visit, Astron asks whether it may enable optional third-party services.
          Selecting “Accept” stores your choice in <code>astron_cookie_consent</code> and prevents the
          prompt from appearing again for this policy version. Selecting “Cancel” dismisses the prompt
          only for the current page view; because we do not store a refusal, it appears again after a
          reload or on a later visit.
        </p>
        <p>
          Necessary authentication and preference storage remains active either way because it is
          required to provide features you request. You can withdraw an acceptance by clearing Astron’s
          site data in your browser.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party checkout",
    content: (
      <>
        <p>
          Astron uses Lemon Squeezy for subscription checkout and the customer billing portal. Its
          script is loaded only after you select “Accept”. Lemon Squeezy may then use its own cookies or
          similar technologies for payment, fraud prevention, security and remembering checkout state.
          Those technologies are controlled by Lemon Squeezy and are described in its privacy and
          cookie information.
        </p>
        <p>
          Astron does not control cookies placed on Lemon Squeezy’s domain. If you decline, the optional
          script is not loaded and embedded checkout will remain unavailable until you accept.
        </p>
      </>
    ),
  },
  {
    id: "manage",
    title: "How to manage storage",
    content: (
      <>
        <p>
          Browser settings let you view, delete or block cookies and clear site data. Blocking the
          session cookie prevents sign-in from working. Clearing Astron local storage resets the active
          workspace and editor selections but does not delete records stored in your Astron account.
        </p>
        <p>
          Signing out removes the current authentication cookie and invalidates that server session.
          You can review and revoke other active sessions in Account settings. Browser “Do Not Track”
          signals do not change current behaviour because Astron does not perform cross-site tracking.
        </p>
      </>
    ),
  },
  {
    id: "future",
    title: "If our use changes",
    content: (
      <p>
        If we introduce non-essential analytics, personalisation or advertising technologies, we will
        update this table and, where required, ask for consent before those technologies operate. Any
        consent choice will be as easy to refuse or withdraw as to grant. We may update this policy as
        names, providers or durations change.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Questions about cookies or browser storage can be sent to
        <a href="mailto:privacy@astron.com"> privacy@astron.com</a>. For more about personal data,
        legal bases, recipients and your rights, read our <a href="/privacy">Privacy policy</a>.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="COOKIES"
      title="Cookie policy"
      summary="A precise list of the cookies and browser storage Astron uses, what each one does, and how to control it."
      effectiveDate="18 July 2026"
      sections={sections}
    />
  );
}
