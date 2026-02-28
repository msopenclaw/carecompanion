import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TodyAI — Privacy Policy & Terms of Use",
  description: "Privacy policy, terms of use, and data practices for TodyAI.",
};

export default function TodyAITermsPage() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
          backgroundColor: "#f9fafb",
          color: "#1a1a1a",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "48px 24px 80px",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 64,
                height: 64,
                borderRadius: 16,
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                marginBottom: 16,
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                margin: "0 0 8px",
                letterSpacing: "-0.02em",
              }}
            >
              TodyAI
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "#6b7280",
                margin: 0,
              }}
            >
              Privacy Policy & Terms of Use
            </p>
            <p
              style={{
                fontSize: 13,
                color: "#9ca3af",
                margin: "8px 0 0",
              }}
            >
              Last updated: February 2026
            </p>
          </div>

          {/* Beta Notice */}
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 32,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#92400e",
                lineHeight: 1.6,
              }}
            >
              <strong>Beta Notice:</strong> TodyAI is currently in beta.
              Features and data handling may change. AI responses are
              informational only and do not constitute medical advice.
            </p>
          </div>

          {/* Sections */}
          <Section number={1} title="What We Collect">
            <p>
              We collect information you voluntarily provide: profile details
              (name, date of birth), health data you log (weight, vitals, mood,
              meals), messages with your AI care coordinator, and voice call
              recordings. We only collect data you actively enter or share
              through the app.
            </p>
          </Section>

          <Section number={2} title="How Your Data Is Used">
            <p>
              Your data is used solely to power your AI care coordinator —
              personalized responses, medication tracking, and health insights.
              We do not sell, rent, or share your personal data for advertising
              or marketing purposes.
            </p>
            <p>
              Your messages are processed by Google Gemini to generate text
              responses. Voice calls are processed by ElevenLabs for
              voice synthesis. These services process your data only to provide
              their functionality and do not retain it for other purposes.
            </p>
          </Section>

          <Section number={3} title="Storage & Security">
            <ul>
              <li>
                Data is stored on encrypted cloud servers with TLS encryption in
                transit.
              </li>
              <li>
                Local data on your device is encrypted with AES-256-GCM.
              </li>
              <li>
                Authentication tokens are stored in your iOS Keychain.
              </li>
              <li>Face ID / passcode protects app access after inactivity.</li>
              <li>
                Personal information (name, phone, health conditions) is
                encrypted at rest on our servers using AES-256-GCM.
              </li>
            </ul>
          </Section>

          <Section number={4} title="Not HIPAA Protected">
            <p>
              This application is <strong>not HIPAA-compliant</strong>. Your
              health data is not protected under HIPAA. Do not use this app as a
              substitute for professional medical care. Always consult your
              healthcare provider for medical decisions.
            </p>
          </Section>

          <Section number={5} title="Your Data, Your Choice">
            <p>
              You own your data. You can delete all your data at any time from
              the Profile screen within the app. This permanently removes your
              account and all associated information from our servers and your
              device. Deletion is immediate and cannot be undone.
            </p>
          </Section>

          <Section number={6} title="Consent">
            <p>
              By using TodyAI, you consent to the collection and use of your
              voluntarily provided data as described in this policy. You may
              withdraw consent at any time by deleting your account through the
              app.
            </p>
          </Section>

          <Section number={7} title="Third-Party Services">
            <ul>
              <li>
                <strong>Google Gemini</strong> — processes text messages to
                generate AI responses
              </li>
              <li>
                <strong>ElevenLabs</strong> — processes voice call audio for
                speech synthesis
              </li>
              <li>
                <strong>Apple Push Notification Service</strong> — delivers
                notifications to your device
              </li>
            </ul>
            <p>
              These services receive only the data necessary to perform their
              function.
            </p>
          </Section>

          <Section number={8} title="Changes to This Policy">
            <p>
              We may update this policy as the app evolves. Continued use of
              TodyAI after changes constitutes acceptance of the updated terms.
              Material changes will be communicated through the app.
            </p>
          </Section>

          <Section number={9} title="Apple Standard EULA">
            <p>
              Use of this app is also subject to Apple&apos;s Standard
              End User License Agreement (EULA):{" "}
              <a
                href="https://www.apple.com/legal/internet-services/itunes/dev/stdfree/contract/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#7c3aed" }}
              >
                https://www.apple.com/legal/internet-services/itunes/dev/stdfree/contract/
              </a>
            </p>
          </Section>

          <Section number={10} title="Contact">
            <p>
              If you have questions about this privacy policy or your data,
              contact us at{" "}
              <a
                href="mailto:admin@avirumapps.com"
                style={{ color: "#7c3aed" }}
              >
                admin@avirumapps.com
              </a>
              .
            </p>
          </Section>

          {/* Footer */}
          <div
            style={{
              marginTop: 48,
              paddingTop: 24,
              borderTop: "1px solid #e5e7eb",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              TodyAI by OpenClaw
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          margin: "0 0 12px",
          color: "#1a1a1a",
          letterSpacing: "-0.01em",
        }}
      >
        {number}. {title}
      </h2>
      <div
        style={{
          fontSize: 15,
          lineHeight: 1.7,
          color: "#374151",
        }}
      >
        {children}
      </div>
    </div>
  );
}
