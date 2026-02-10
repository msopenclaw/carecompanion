"use client";

import { useDemo } from "./demo-context";
import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Static flowsheet data — last 5 readings for Margaret Chen
// ---------------------------------------------------------------------------

interface FlowsheetRow {
  label: string;
  unit: string;
  values: { date: string; value: number; flag?: "high" | "low" | "critical" }[];
}

const FLOWSHEET_DATA: FlowsheetRow[] = [
  {
    label: "BP Systolic",
    unit: "mmHg",
    values: [
      { date: "01/28", value: 128 },
      { date: "01/31", value: 130 },
      { date: "02/04", value: 132, flag: "high" },
      { date: "02/06", value: 142, flag: "high" },
      { date: "02/08", value: 155, flag: "critical" },
    ],
  },
  {
    label: "BP Diastolic",
    unit: "mmHg",
    values: [
      { date: "01/28", value: 82 },
      { date: "01/31", value: 84 },
      { date: "02/04", value: 85 },
      { date: "02/06", value: 90, flag: "high" },
      { date: "02/08", value: 95, flag: "critical" },
    ],
  },
  {
    label: "Heart Rate",
    unit: "bpm",
    values: [
      { date: "01/28", value: 72 },
      { date: "01/31", value: 74 },
      { date: "02/04", value: 76 },
      { date: "02/06", value: 78 },
      { date: "02/08", value: 82 },
    ],
  },
  {
    label: "Weight",
    unit: "lbs",
    values: [
      { date: "01/28", value: 158 },
      { date: "01/31", value: 158 },
      { date: "02/04", value: 159 },
      { date: "02/06", value: 160 },
      { date: "02/08", value: 161, flag: "high" },
    ],
  },
  {
    label: "Glucose",
    unit: "mg/dL",
    values: [
      { date: "01/28", value: 118 },
      { date: "01/31", value: 122 },
      { date: "02/04", value: 115 },
      { date: "02/06", value: 126 },
      { date: "02/08", value: 130 },
    ],
  },
  {
    label: "SpO2",
    unit: "%",
    values: [
      { date: "01/28", value: 97 },
      { date: "01/31", value: 97 },
      { date: "02/04", value: 96 },
      { date: "02/06", value: 96 },
      { date: "02/08", value: 95 },
    ],
  },
];

const MEDICATIONS = [
  { name: "Lisinopril 10mg", sig: "BID (twice daily)", status: "Active" },
  { name: "Metformin 500mg", sig: "TID (three times daily)", status: "Active" },
];

const PROBLEMS = [
  { name: "Essential Hypertension", code: "I10" },
  { name: "Type 2 Diabetes Mellitus", code: "E11.9" },
  { name: "Heart Failure, unspecified", code: "I50.9" },
];

// Sidebar nav items
type NavItem = {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: "chart", label: "Chart Review", icon: "chart" },
  { id: "notes", label: "Notes", icon: "notes" },
  { id: "flowsheets", label: "Flowsheets", icon: "flowsheets", active: true },
  { id: "results", label: "Results", icon: "results" },
  { id: "inbox", label: "In Basket", icon: "inbox" },
];

// ---------------------------------------------------------------------------
// Sidebar Icon SVGs
// ---------------------------------------------------------------------------

function NavIcon({ type, className }: { type: string; className?: string }) {
  const cls = className || "w-4 h-4";
  switch (type) {
    case "chart":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      );
    case "notes":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case "flowsheets":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v-5.5m3 5.5V8.75m3 2.5V10" />
        </svg>
      );
    case "results":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.756 4.388a2.25 2.25 0 01-2.09 1.362H8.846a2.25 2.25 0 01-2.09-1.362L5 14.5m14 0H5" />
        </svg>
      );
    case "inbox":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-17.5 0V6.75A2.25 2.25 0 014.5 4.5h15A2.25 2.25 0 0121.75 6.75v6.75m-17.5 0v6a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25v-6" />
        </svg>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Value cell color for flowsheet
// ---------------------------------------------------------------------------

function valueCellStyle(flag?: "high" | "low" | "critical"): React.CSSProperties {
  if (flag === "critical") return { color: "#b91c1c", fontWeight: 700, backgroundColor: "#fef2f2" };
  if (flag === "high") return { color: "#c2410c", fontWeight: 600, backgroundColor: "#fff7ed" };
  if (flag === "low") return { color: "#1d4ed8", fontWeight: 600, backgroundColor: "#eff6ff" };
  return {};
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveBilling() {
  const { demoPhase, resolveCase } = useDemo();

  // BPA alert visibility states
  const [showBpaBanner, setShowBpaBanner] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [inBasketBadge, setInBasketBadge] = useState(false);

  // Handle phase transitions
  useEffect(() => {
    if (demoPhase === "documenting") {
      // Show In Basket badge immediately
      setInBasketBadge(true);
      // Show BPA banner after 2 seconds
      const timer = setTimeout(() => {
        setShowBpaBanner(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
    if (demoPhase === "complete") {
      setInBasketBadge(true);
      setShowBpaBanner(true);
      setShowFullSummary(true);
    }
    if (demoPhase === "idle") {
      setShowBpaBanner(false);
      setShowFullSummary(false);
      setInBasketBadge(false);
    }
  }, [demoPhase]);

  const handleBpaClick = () => {
    setShowFullSummary(true);
  };

  const isDocumentingOrComplete = demoPhase === "documenting" || demoPhase === "complete";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "100%",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: 13,
      color: "#1e293b",
      backgroundColor: "#f1f5f9",
      userSelect: "none",
      overflow: "hidden",
    }}>
      {/* Keyframes */}
      <style>{`
        @keyframes epicBpaSlideIn {
          0% { transform: translateY(-100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes epicBpaPulse {
          0%, 100% { box-shadow: 0 2px 8px rgba(217, 119, 6, 0.15); }
          50% { box-shadow: 0 2px 16px rgba(217, 119, 6, 0.35); }
        }
        @keyframes epicFadeIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes epicBadgePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        .epic-bpa-slide {
          animation: epicBpaSlideIn 0.4s ease-out forwards, epicBpaPulse 2.5s ease-in-out 0.4s infinite;
        }
        .epic-fade-in {
          animation: epicFadeIn 0.5s ease-out forwards;
        }
        .epic-badge-pulse {
          animation: epicBadgePulse 1.5s ease-in-out infinite;
        }
        .epic-scroll::-webkit-scrollbar { width: 6px; }
        .epic-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
        .epic-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 3px; }
        .epic-scroll { scrollbar-width: thin; scrollbar-color: #94a3b8 #f1f5f9; }
      `}</style>

      {/* ================================================================== */}
      {/* Epic Header Bar                                                     */}
      {/* ================================================================== */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 12px",
        background: "linear-gradient(180deg, #1e3a5f 0%, #162d4a 100%)",
        flexShrink: 0,
        borderBottom: "2px solid #0f2440",
      }}>
        {/* Left: logo + patient */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Epic-style logo */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            <div style={{
              width: 20,
              height: 20,
              borderRadius: 3,
              background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <span style={{
              color: "white",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 1.5,
            }}>
              EHR
            </span>
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.2)" }} />

          {/* Patient context */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ color: "white", fontSize: 12, fontWeight: 600 }}>
              Chen, Margaret &middot; 74F &middot; MRN: 847291
            </span>
            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>
              DOB: 03/15/1951 &middot; PCP: Dr. Patel, MD
            </span>
          </div>
        </div>

        {/* Right: user info */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "white", fontSize: 11, fontWeight: 600 }}>Dr. Patel, MD</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 9 }}>Internal Medicine</span>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Body: Sidebar + Main Content                                        */}
      {/* ================================================================== */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* -------------------------------------------------------------- */}
        {/* Left Sidebar                                                     */}
        {/* -------------------------------------------------------------- */}
        <div style={{
          width: 72,
          flexShrink: 0,
          backgroundColor: "#e2e8f0",
          borderRight: "1px solid #cbd5e1",
          display: "flex",
          flexDirection: "column",
          paddingTop: 6,
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.active;
            const showBadge = item.id === "inbox" && inBasketBadge;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "8px 4px",
                  cursor: "pointer",
                  position: "relative",
                  backgroundColor: isActive ? "#ffffff" : "transparent",
                  borderLeft: isActive ? "3px solid #1e3a5f" : "3px solid transparent",
                  color: isActive ? "#1e3a5f" : "#64748b",
                  transition: "background-color 0.15s",
                }}
              >
                <div style={{ position: "relative" }}>
                  <NavIcon type={item.icon} className="w-4 h-4" />
                  {showBadge && (
                    <div
                      className="epic-badge-pulse"
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -6,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        backgroundColor: "#dc2626",
                        color: "white",
                        fontSize: 8,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1.5px solid white",
                      }}
                    >
                      1
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 9,
                  fontWeight: isActive ? 700 : 500,
                  marginTop: 3,
                  textAlign: "center",
                  lineHeight: 1.1,
                }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Main Content Area                                                */}
        {/* -------------------------------------------------------------- */}
        <div
          className="epic-scroll"
          style={{
            flex: 1,
            overflow: "auto",
            backgroundColor: "#ffffff",
            position: "relative",
          }}
        >
          {/* ============================================================ */}
          {/* BPA Banner (slides in during "documenting" phase)             */}
          {/* ============================================================ */}
          {showBpaBanner && !showFullSummary && (
            <div
              className="epic-bpa-slide"
              onClick={handleBpaClick}
              style={{
                margin: "8px 10px 0 10px",
                padding: "10px 14px",
                backgroundColor: "#fef3c7",
                border: "1px solid #f59e0b",
                borderLeft: "4px solid #d97706",
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {/* Warning icon */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: "#fbbf24",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#92400e",
                  marginBottom: 2,
                }}>
                  BPA: CareCompanion AI Alert &mdash; Margaret Chen
                </div>
                <div style={{ fontSize: 11, color: "#a16207" }}>
                  AI-initiated patient outreach completed. Review required.
                </div>
              </div>
              <div style={{
                fontSize: 10,
                color: "#92400e",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}>
                Click to review &rarr;
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* Full AI Summary (replaces flowsheet in "complete" phase)      */}
          {/* ============================================================ */}
          {showFullSummary ? (
            <div className="epic-fade-in" style={{ padding: "10px 10px 16px 10px" }}>
              {/* Section header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: "#f59e0b",
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8 }}>
                    BPA &mdash; Best Practice Alert
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  {new Date().toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              </div>

              {/* -------------------------------------------------------- */}
              {/* AI Clinical Summary Card                                  */}
              {/* -------------------------------------------------------- */}
              <div style={{
                backgroundColor: "#fffbeb",
                border: "1px solid #fcd34d",
                borderLeft: "4px solid #d97706",
                borderRadius: 4,
                padding: "12px 14px",
                marginBottom: 10,
              }}>
                {/* Card header */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                      CareCompanion AI &mdash; Patient Outreach Summary
                    </span>
                  </div>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: "#92400e",
                    backgroundColor: "#fde68a",
                    padding: "2px 8px",
                    borderRadius: 10,
                  }}>
                    Pending Review
                  </span>
                </div>

                {/* Summary text */}
                <p style={{
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "#334155",
                  margin: "0 0 10px 0",
                }}>
                  Automated voice outreach completed with Margaret Chen regarding 3-day BP
                  escalation (132&#8594;142&#8594;155 mmHg). Patient confirmed missing 2
                  evening Lisinopril doses. Medication reminder set for 6:00 PM. Patient
                  reports feeling well otherwise. No chest pain, SOB, or other concerning
                  symptoms reported.
                </p>

                {/* Metadata row */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  fontSize: 10,
                  color: "#64748b",
                  paddingTop: 8,
                  borderTop: "1px solid #fde68a",
                }}>
                  <span>
                    <span style={{ fontWeight: 600, color: "#475569" }}>Confidence:</span> 87%
                  </span>
                  <span>
                    <span style={{ fontWeight: 600, color: "#475569" }}>Call Duration:</span> 4m 32s
                  </span>
                  <span>
                    <span style={{ fontWeight: 600, color: "#475569" }}>CPT:</span>{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#d97706" }}>99457</span>,{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#16a34a" }}>99454</span>
                  </span>
                  <span>
                    <span style={{ fontWeight: 600, color: "#475569" }}>Source:</span> AI Voice Agent
                  </span>
                </div>
              </div>

              {/* -------------------------------------------------------- */}
              {/* Next Steps                                                */}
              {/* -------------------------------------------------------- */}
              <div style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                padding: "10px 14px",
                marginBottom: 10,
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 8,
                }}>
                  Completed Actions
                </div>
                {[
                  "Evening Lisinopril reminder set (6:00 PM)",
                  "Follow-up BP check scheduled (48 hours)",
                  "Clinical note auto-drafted and ready for signature",
                ].map((step, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 0",
                    borderBottom: i < 2 ? "1px solid #f1f5f9" : "none",
                  }}>
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      backgroundColor: "#dcfce7",
                      border: "1.5px solid #22c55e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 12, color: "#334155" }}>{step}</span>
                  </div>
                ))}
              </div>

              {/* -------------------------------------------------------- */}
              {/* Provider Action Buttons (pills)                          */}
              {/* -------------------------------------------------------- */}
              <div style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                padding: "10px 14px",
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 10,
                }}>
                  Provider Actions
                </div>

                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 10,
                }}>
                  {/* Adjust Medication */}
                  <button style={{
                    padding: "7px 16px",
                    borderRadius: 20,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#ffffff",
                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                    boxShadow: "0 1px 3px rgba(37, 99, 235, 0.3)",
                    transition: "transform 0.1s, box-shadow 0.1s",
                  }}>
                    Adjust Medication
                  </button>

                  {/* Schedule Visit */}
                  <button style={{
                    padding: "7px 16px",
                    borderRadius: 20,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#ffffff",
                    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                    boxShadow: "0 1px 3px rgba(124, 58, 237, 0.3)",
                    transition: "transform 0.1s, box-shadow 0.1s",
                  }}>
                    Schedule Visit
                  </button>

                  {/* Order Labs */}
                  <button style={{
                    padding: "7px 16px",
                    borderRadius: 20,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#ffffff",
                    background: "linear-gradient(135deg, #14b8a6, #0d9488)",
                    boxShadow: "0 1px 3px rgba(13, 148, 136, 0.3)",
                    transition: "transform 0.1s, box-shadow 0.1s",
                  }}>
                    Order Labs
                  </button>

                  {/* Resolve */}
                  <button
                    onClick={resolveCase}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 20,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#ffffff",
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      boxShadow: "0 1px 3px rgba(22, 163, 74, 0.3)",
                      transition: "transform 0.1s, box-shadow 0.1s",
                    }}
                  >
                    Resolve
                  </button>
                </div>

                <div style={{
                  fontSize: 10,
                  color: "#94a3b8",
                  fontStyle: "italic",
                  textAlign: "center",
                }}>
                  Select an action or resolve to close this alert
                </div>
              </div>
            </div>
          ) : (
            /* ============================================================ */
            /* Patient Flowsheet View (default — idle through active)       */
            /* ============================================================ */
            <div style={{ padding: "8px 10px 16px 10px" }}>
              {/* Section heading */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
                marginTop: 2,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: "#3b82f6",
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Flowsheet &mdash; Vital Signs
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Last updated: Today
                </span>
              </div>

              {/* -------------------------------------------------------- */}
              {/* Flowsheet Table                                           */}
              {/* -------------------------------------------------------- */}
              <div style={{
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                overflow: "hidden",
                marginBottom: 10,
              }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11,
                }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f1f5f9" }}>
                      <th style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#475569",
                        borderBottom: "1px solid #e2e8f0",
                        borderRight: "1px solid #e2e8f0",
                        width: "25%",
                      }}>
                        Parameter
                      </th>
                      {FLOWSHEET_DATA[0].values.map((v, i) => (
                        <th key={i} style={{
                          textAlign: "center",
                          padding: "6px 4px",
                          fontSize: 10,
                          fontWeight: 600,
                          color: i === FLOWSHEET_DATA[0].values.length - 1 ? "#dc2626" : "#64748b",
                          borderBottom: "1px solid #e2e8f0",
                          borderRight: i < FLOWSHEET_DATA[0].values.length - 1 ? "1px solid #f1f5f9" : "none",
                          backgroundColor: i === FLOWSHEET_DATA[0].values.length - 1 ? "#fef2f2" : undefined,
                        }}>
                          {v.date}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FLOWSHEET_DATA.map((row, ri) => (
                      <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                        <td style={{
                          padding: "5px 8px",
                          fontWeight: 600,
                          color: "#334155",
                          fontSize: 11,
                          borderRight: "1px solid #e2e8f0",
                          borderBottom: ri < FLOWSHEET_DATA.length - 1 ? "1px solid #f1f5f9" : "none",
                          whiteSpace: "nowrap",
                        }}>
                          {row.label}
                          <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 400, marginLeft: 4 }}>
                            {row.unit}
                          </span>
                        </td>
                        {row.values.map((v, vi) => (
                          <td key={vi} style={{
                            textAlign: "center",
                            padding: "5px 4px",
                            fontSize: 11,
                            fontFamily: "monospace",
                            borderBottom: ri < FLOWSHEET_DATA.length - 1 ? "1px solid #f1f5f9" : "none",
                            borderRight: vi < row.values.length - 1 ? "1px solid #f8fafc" : "none",
                            ...valueCellStyle(v.flag),
                          }}>
                            {v.value}
                            {v.flag === "critical" && (
                              <span style={{ fontSize: 8, marginLeft: 2, color: "#dc2626" }}>&#9650;</span>
                            )}
                            {v.flag === "high" && (
                              <span style={{ fontSize: 8, marginLeft: 2, color: "#ea580c" }}>&#9650;</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* -------------------------------------------------------- */}
              {/* Active Medications                                        */}
              {/* -------------------------------------------------------- */}
              <div style={{
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                padding: "8px 10px",
                marginBottom: 10,
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 6,
                }}>
                  Active Medications
                </div>
                {MEDICATIONS.map((med, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    borderBottom: i < MEDICATIONS.length - 1 ? "1px solid #f1f5f9" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        backgroundColor: "#3b82f6",
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{med.name}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{med.sig}</span>
                    </div>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#16a34a",
                      backgroundColor: "#f0fdf4",
                      padding: "1px 6px",
                      borderRadius: 8,
                      border: "1px solid #bbf7d0",
                    }}>
                      {med.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* -------------------------------------------------------- */}
              {/* Active Problems                                          */}
              {/* -------------------------------------------------------- */}
              <div style={{
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                padding: "8px 10px",
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 6,
                }}>
                  Active Problem List
                </div>
                {PROBLEMS.map((prob, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    borderBottom: i < PROBLEMS.length - 1 ? "1px solid #f1f5f9" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 5,
                        height: 5,
                        borderRadius: 1,
                        backgroundColor: i === 0 ? "#ef4444" : i === 1 ? "#a855f6" : "#f59e0b",
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, color: "#1e293b" }}>{prob.name}</span>
                    </div>
                    <span style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fontWeight: 600,
                      color: "#64748b",
                      backgroundColor: "#f1f5f9",
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}>
                      {prob.code}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* Bottom status bar                                                   */}
      {/* ================================================================== */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 12px",
        backgroundColor: "#1e3a5f",
        borderTop: "1px solid #0f2440",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>
          Encounter: Office Visit &middot; Feb 08, 2026
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isDocumentingOrComplete && (
            <span style={{
              fontSize: 9,
              color: "#fbbf24",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}>
              <span style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: "#fbbf24",
                display: "inline-block",
              }} />
              1 BPA pending
            </span>
          )}
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>
            Powered by CareCompanion AI
          </span>
        </div>
      </div>
    </div>
  );
}
