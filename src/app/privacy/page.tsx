import type { Metadata } from "next";

import { LegalPage, LegalSection, Placeholder } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Family Daybook collects, uses, protects, and shares information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Your information"
      title="Privacy policy"
      description="Family Daybook is designed for sensitive family information. This policy explains what we collect, why we use it, and the choices available to you."
    >
      <LegalSection title="1. Who operates Family Daybook">
        <p>
          Family Daybook is operated by <Placeholder>[LEGAL OPERATOR NAME]</Placeholder> (“Family Daybook,” “we,” “us,” or “our”). This policy applies to the Family Daybook website, application, and related services.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>We collect information that you provide, information created while you use the service, and limited technical information needed to operate it.</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-primary">
          <li><strong>Account and subscription information:</strong> name, email address, authentication identifiers, account status, security settings, Plan, Subscription status, statements, and payment history supplied through Clerk. Payment card details are handled by Clerk and its payment processor and are not stored in Family Daybook’s application database.</li>
          <li><strong>Family and workspace information:</strong> workspace name, timezone, adult caregiver labels, reviewer names and emails, child display names or labels, and birthdates entered by an adult account holder.</li>
          <li><strong>Daybook content:</strong> routines, caregiving entries, appointment information, factual incident notes, timestamps, people present, observations, outcomes, corrections, and other details you choose to record.</li>
          <li><strong>Files and reports:</strong> images, PDFs, other supported attachments, generated reports, manifests, and checksums.</li>
          <li><strong>Activity and integrity information:</strong> server timestamps, revision history, audit events, download activity, record hashes, invitation activity, and deletion tombstones.</li>
          <li><strong>Essential technical information:</strong> authentication cookies, request information, and operational logs needed to secure, troubleshoot, and deliver the service.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <p>We use information to provide and maintain Family Daybook, including to:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-primary">
          <li>authenticate users and create isolated private workspaces;</li>
          <li>save, organize, search, correct, and display daybook records;</li>
          <li>store private attachments and generate requested report packages;</li>
          <li>apply owner and reviewer permissions;</li>
          <li>protect the service, investigate misuse, and maintain record integrity features;</li>
          <li>respond to support, privacy, and security requests; and</li>
          <li>comply with applicable obligations and enforce our terms.</li>
        </ul>
        <p>We do not currently use advertising trackers or analytics trackers, and we do not sell personal information.</p>
      </LegalSection>

      <LegalSection title="4. When information is shared">
        <p>We share information only as needed to operate the service, at your direction, or where required. Recipients may include:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-primary">
          <li><strong>Service providers:</strong> Clerk for authentication and subscription billing, Stripe for payment processing, MongoDB Atlas for database hosting, and Vercel for application hosting, private file storage, and background workflows. These providers process information under their own contractual and security commitments.</li>
          <li><strong>Authorized reviewers:</strong> people an owner invites to a workspace. Reviewers receive read-only access determined by the service’s current permissions. Owners are responsible for choosing reviewers carefully and revoking access when appropriate.</li>
          <li><strong>Legal and safety recipients:</strong> authorities, advisers, or other parties when we reasonably believe disclosure is required by law, necessary to protect rights or safety, or needed to investigate fraud or abuse.</li>
          <li><strong>Business transfers:</strong> a successor or involved advisers during a merger, acquisition, financing, reorganization, or sale of assets, subject to appropriate confidentiality protections.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Cookies and similar technology">
        <p>Family Daybook and Clerk use cookies and similar browser storage that are necessary to sign users in, maintain sessions, prevent abuse, and operate account features. We do not currently use advertising cookies or analytics cookies.</p>
      </LegalSection>

      <LegalSection title="6. Information about children">
        <p>Family Daybook is intended for adults and is not directed to children. Adult users may choose to enter information relating to children as part of a private family workspace. The adult account holder is responsible for having appropriate authority to enter, use, invite access to, and disclose that information.</p>
        <p>If you believe a child provided personal information directly to us without appropriate adult involvement, contact us so we can review the request.</p>
      </LegalSection>

      <LegalSection title="7. Storage and security">
        <p>We use administrative, technical, and organizational safeguards intended to reduce the risk of unauthorized access, loss, misuse, or alteration. These include authenticated access, workspace and role checks, private file routes, file-type validation, server-controlled timestamps, and tamper-evident revision history.</p>
        <p>No service can guarantee absolute security. You are responsible for protecting your account, using a strong password, enabling available multi-factor authentication, keeping devices secure, and promptly reporting suspected unauthorized access.</p>
      </LegalSection>

      <LegalSection title="8. Retention and deletion">
        <p>We retain account and workspace information while the service is active and as reasonably needed to provide the service, maintain security and audit history, resolve disputes, or meet applicable obligations.</p>
        <p>Records ordinarily remain until an authorized owner deletes them. Permanent record deletion is disabled by default and, when enabled, requires an owner with multi-factor authentication. A permanent purge removes active record content, attachments, and stored reports containing that record while retaining a content-free deletion tombstone.</p>
        <p>Downloaded copies cannot be revoked. Residual copies may remain in provider backups until those backups expire under the provider’s configured retention schedule.</p>
      </LegalSection>

      <LegalSection title="9. Your choices and requests">
        <p>Depending on your location, you may have rights to request access, correction, deletion, restriction, portability, or information about how personal information is used. The application also provides tools to review records, append corrections, export reports, manage reviewers, and—when enabled—permanently purge individual records.</p>
        <p>To submit an account-level or privacy request, email <Placeholder>[PRIVACY/SUPPORT EMAIL]</Placeholder>. We may need to verify your identity and authority before completing a request.</p>
      </LegalSection>

      <LegalSection title="10. Changes to this policy">
        <p>We may update this policy as the service or applicable requirements change. We will post the revised policy with a new effective date and provide additional notice when appropriate.</p>
      </LegalSection>

      <LegalSection title="11. Contact us">
        <p>
          Questions or requests may be sent to <Placeholder>[PRIVACY/SUPPORT EMAIL]</Placeholder> or mailed to <Placeholder>[LEGAL OPERATOR NAME]</Placeholder>, <Placeholder>[MAILING ADDRESS]</Placeholder>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
