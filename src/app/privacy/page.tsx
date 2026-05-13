import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Enterprise Lookout",
  description: "Privacy policy for Enterprise Lookout GPT actions.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b border-border pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Enterprise Lookout
          </p>
          <h1 className="text-3xl font-semibold">Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: May 12, 2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="leading-7 text-muted-foreground">
            Enterprise Lookout is a private sponsor prospecting workspace. Its
            GPT actions connect ChatGPT to the Enterprise Lookout app so
            authorized users can create tasks, review campaign context, draft
            outreach, research companies, and save workflow feedback.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Information processed</h2>
          <p className="leading-7 text-muted-foreground">
            The app may process project names, campaign descriptions, company
            and contact records, draft emails, sent-message status, review
            feedback, task progress, and GPT-generated results. If Gmail is
            connected, OAuth tokens are stored server-side and encrypted for
            sending approved emails.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How GPT actions use data</h2>
          <p className="leading-7 text-muted-foreground">
            GPT actions send only the information needed to complete the
            requested workflow. For example, a drafting task may read campaign
            context, contact details, previous feedback, and the rejected draft
            being rewritten. Actions can also write results back to the app,
            such as task updates, company candidates, memory rules, and draft
            emails.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Data sharing</h2>
          <p className="leading-7 text-muted-foreground">
            Enterprise Lookout does not sell personal data. Data is shared with
            infrastructure providers required to operate the app, including
            hosting, database, email, and AI services. Users who receive access
            to the GPT link may be able to trigger actions in the workspace if
            they use the configured GPT.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Security</h2>
          <p className="leading-7 text-muted-foreground">
            GPT actions are protected by a server-side API token. Gmail
            credentials are handled through OAuth and are not exposed to the
            browser or to GPT users. Access should only be shared with trusted
            collaborators.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Data retention and removal</h2>
          <p className="leading-7 text-muted-foreground">
            Workspace data is retained while it is useful for campaign
            operations, review history, or auditability. Records can be removed
            or corrected by the workspace administrator when needed.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="leading-7 text-muted-foreground">
            For privacy or access questions, contact the Enterprise Lookout
            workspace administrator.
          </p>
        </section>
      </article>
    </main>
  );
}
