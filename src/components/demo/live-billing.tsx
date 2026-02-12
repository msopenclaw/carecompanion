"use client";

import { useDemo, DAY_DATA } from "./demo-context";
import { useState, useEffect, useMemo } from "react";

// ---------------------------------------------------------------------------
// Static clinical data
// ---------------------------------------------------------------------------

const MEDICATIONS = [
  { name: "Wegovy (semaglutide) 0.25mg", sig: "SubQ weekly (Mondays)", status: "Active (Week 1)" },
  { name: "Metformin 1000mg", sig: "BID (twice daily)", status: "Active" },
  { name: "Lisinopril 20mg", sig: "Daily", status: "Active" },
];

const PROBLEMS = [
  { name: "Obesity, BMI 34.0", code: "E66.01", color: "#ef4444" },
  { name: "Type 2 Diabetes Mellitus", code: "E11.9", color: "#a855f6" },
  { name: "Essential Hypertension", code: "I10", color: "#f59e0b" },
  { name: "GLP-1 Initiation Monitoring", code: "Z79.899", color: "#3b82f6" },
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
// Flowsheet row definitions (label + unit + accessor + flag logic)
// ---------------------------------------------------------------------------

interface FlowsheetRowDef {
  label: string;
  unit: string;
  accessor: (d: typeof DAY_DATA[number]) => number;
  flagFn?: (val: number) => "amber" | "red" | undefined;
}

const FLOWSHEET_ROWS: FlowsheetRowDef[] = [
  { label: "Weight", unit: "lbs", accessor: (d) => d.weight },
  { label: "BP Systolic", unit: "mmHg", accessor: (d) => d.bpSys },
  { label: "BP Diastolic", unit: "mmHg", accessor: (d) => d.bpDia },
  { label: "Glucose", unit: "mg/dL", accessor: (d) => d.glucose },
  {
    label: "Nausea Grade",
    unit: "0-3",
    accessor: (d) => d.nauseaGrade,
    flagFn: (v) => (v >= 3 ? "red" : v >= 2 ? "amber" : undefined),
  },
  {
    label: "Fluid Intake",
    unit: "oz",
    accessor: (d) => d.fluidOz,
    flagFn: (v) => (v < 40 ? "red" : undefined),
  },
  {
    label: "Engagement",
    unit: "%",
    accessor: (d) => d.engagementScore,
    flagFn: (v) => (v < 50 ? "red" : undefined),
  },
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
// Cell styling helpers
// ---------------------------------------------------------------------------

function flagCellStyle(flag?: "amber" | "red"): React.CSSProperties {
  if (flag === "red") return { color: "#b91c1c", fontWeight: 700, backgroundColor: "#fef2f2" };
  if (flag === "amber") return { color: "#c2410c", fontWeight: 600, backgroundColor: "#fff7ed" };
  return {};
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveBilling() {
  const { demoPhase, currentDay, resolveCase, selectedPatient } = useDemo();

  // BPA alert visibility states
  const [showBpaBanner, setShowBpaBanner] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [inBasketBadge, setInBasketBadge] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [actionConfirmed, setActionConfirmed] = useState(false);
  const [doseChoice, setDoseChoice] = useState<string | null>(null);

  // Handle phase transitions
  useEffect(() => {
    if (demoPhase === "documenting") {
      setInBasketBadge(true);
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
      setSelectedAction(null);
      setActionConfirmed(false);
      setDoseChoice(null);
    }
  }, [demoPhase]);

  const handleBpaClick = () => {
    setShowFullSummary(true);
  };

  const isDocumentingOrComplete = demoPhase === "documenting" || demoPhase === "complete";

  // Compute visible day data (days 1..currentDay)
  const visibleDays = useMemo(() => {
    if (currentDay === 0) return [];
    return DAY_DATA.filter((d) => d.day <= currentDay);
  }, [currentDay]);

  // Day 7 weekly summary flag
  const showWeeklySummary = currentDay === 7 && demoPhase === "idle";

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
        @keyframes epicBlinkBorder {
          0%, 100% { box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.3); }
          50% { box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.6), 0 0 12px rgba(217, 119, 6, 0.2); }
        }
        @keyframes epicButtonBlink {
          0%, 100% { box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          50% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4), 0 0 12px rgba(59, 130, 246, 0.15); }
        }
        .epic-blink-border {
          animation: epicBlinkBorder 1.5s ease-in-out infinite;
        }
        .epic-button-blink {
          animation: epicButtonBlink 1.5s ease-in-out infinite;
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
              {selectedPatient.lastName}, {selectedPatient.firstName} &middot; {selectedPatient.age}{selectedPatient.gender} &middot; MRN: {selectedPatient.mrn}
            </span>
            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>
              DOB: 05/12/1953 &middot; PCP: Dr. Patel, MD &middot; Program: Wegovy 0.25mg
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
              className="epic-bpa-slide epic-blink-border"
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
                  BPA: CareCompanion AI Alert &mdash; {selectedPatient.firstName} {selectedPatient.lastName} (GLP-1 Engagement)
                </div>
                <div style={{ fontSize: 11, color: "#a16207" }}>
                  AI-initiated GLP-1 engagement outreach completed. Nausea management + re-engagement. Review required.
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
                      CareCompanion AI &mdash; GLP-1 Engagement Summary
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
                  Automated voice outreach completed with {selectedPatient.firstName} {selectedPatient.lastName} regarding GLP-1
                  initiation side effects and missed check-in (Day 4). Patient reported
                  Grade 2 nausea since Day 2, reduced oral intake ~50%, fluid intake below
                  40oz/day. Patient was considering discontinuation. AI provided dietary
                  counseling (small meals, ginger, hydration). Patient re-engaged and
                  committed to continuing Wegovy. Recommend: consider ondansetron PRN if
                  nausea persists beyond Day 7.
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
                    <span style={{ fontWeight: 600, color: "#475569" }}>Confidence:</span> 91%
                  </span>
                  <span>
                    <span style={{ fontWeight: 600, color: "#475569" }}>Call Duration:</span> 3m 45s
                  </span>
                  <span>
                    <span style={{ fontWeight: 600, color: "#475569" }}>CPT:</span>{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#d97706" }}>99457</span>,{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#16a34a" }}>99490</span>,{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#2563eb" }}>99453</span>,{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#7c3aed" }}>99454</span>
                  </span>
                  <span>
                    <span style={{ fontWeight: 600, color: "#475569" }}>Source:</span> AI Voice Agent
                  </span>
                </div>
              </div>

              {/* -------------------------------------------------------- */}
              {/* Completed Actions                                         */}
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
                  "Anti-nausea coaching provided (small meals, ginger, hydration)",
                  "Follow-up check-in scheduled (Day 5)",
                  "Flagged for Dr. Patel \u2014 consider ondansetron PRN",
                  "Clinical note auto-drafted and ready for signature",
                ].map((step, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 0",
                    borderBottom: i < 3 ? "1px solid #f1f5f9" : "none",
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
              {/* Provider Action Buttons (pills) + Subsequent Steps      */}
              {/* -------------------------------------------------------- */}
              <div
                className={!selectedAction ? "epic-blink-border" : ""}
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 4,
                  padding: "10px 14px",
                }}
              >
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  Provider Actions
                  {!selectedAction && (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 500,
                      color: "#f59e0b",
                      textTransform: "none",
                      letterSpacing: 0,
                    }}>
                      &larr; Select an action
                    </span>
                  )}
                </div>

                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 10,
                }}>
                  {/* Adjust GLP-1 Dose */}
                  <button
                    className={!selectedAction ? "epic-button-blink" : ""}
                    onClick={() => { if (!selectedAction) setSelectedAction("dose"); }}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 20,
                      border: "none",
                      cursor: selectedAction && selectedAction !== "dose" ? "default" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#ffffff",
                      background: selectedAction && selectedAction !== "dose"
                        ? "#94a3b8"
                        : selectedAction === "dose"
                          ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                          : "linear-gradient(135deg, #3b82f6, #2563eb)",
                      boxShadow: selectedAction === "dose" ? "0 0 0 2px #3b82f6" : "0 1px 3px rgba(37, 99, 235, 0.3)",
                      opacity: selectedAction && selectedAction !== "dose" ? 0.5 : 1,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {selectedAction === "dose" ? "\u2713 " : ""}Adjust GLP-1 Dose
                  </button>

                  {/* Schedule Telehealth */}
                  <button
                    className={!selectedAction ? "epic-button-blink" : ""}
                    onClick={() => { if (!selectedAction) setSelectedAction("telehealth"); }}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 20,
                      border: "none",
                      cursor: selectedAction && selectedAction !== "telehealth" ? "default" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#ffffff",
                      background: selectedAction && selectedAction !== "telehealth"
                        ? "#94a3b8"
                        : selectedAction === "telehealth"
                          ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                          : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                      boxShadow: selectedAction === "telehealth" ? "0 0 0 2px #8b5cf6" : "0 1px 3px rgba(124, 58, 237, 0.3)",
                      opacity: selectedAction && selectedAction !== "telehealth" ? 0.5 : 1,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {selectedAction === "telehealth" ? "\u2713 " : ""}Schedule Telehealth
                  </button>

                  {/* Order Labs (A1c) */}
                  <button
                    className={!selectedAction ? "epic-button-blink" : ""}
                    onClick={() => { if (!selectedAction) setSelectedAction("labs"); }}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 20,
                      border: "none",
                      cursor: selectedAction && selectedAction !== "labs" ? "default" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#ffffff",
                      background: selectedAction && selectedAction !== "labs"
                        ? "#94a3b8"
                        : selectedAction === "labs"
                          ? "linear-gradient(135deg, #0d9488, #0f766e)"
                          : "linear-gradient(135deg, #14b8a6, #0d9488)",
                      boxShadow: selectedAction === "labs" ? "0 0 0 2px #14b8a6" : "0 1px 3px rgba(13, 148, 136, 0.3)",
                      opacity: selectedAction && selectedAction !== "labs" ? 0.5 : 1,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {selectedAction === "labs" ? "\u2713 " : ""}Order Labs (A1c)
                  </button>

                  {/* Resolve (only shown when no action selected or after action confirmed) */}
                  {(!selectedAction || actionConfirmed) && (
                    <button
                      className={actionConfirmed ? "epic-button-blink" : ""}
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
                        boxShadow: actionConfirmed ? "0 0 0 2px #22c55e" : "0 1px 3px rgba(22, 163, 74, 0.3)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {actionConfirmed ? "Resolve & Close Alert" : "Resolve"}
                    </button>
                  )}
                </div>

                {/* ---- Subsequent Steps Based on Selection ---- */}

                {/* Dose Adjustment Step */}
                {selectedAction === "dose" && !actionConfirmed && (
                  <div className="epic-fade-in" style={{
                    border: "1px solid #bfdbfe",
                    borderRadius: 4,
                    backgroundColor: "#eff6ff",
                    padding: "10px 12px",
                    marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>
                      Dose Adjustment &mdash; Wegovy (semaglutide)
                    </div>
                    <div style={{ fontSize: 11, color: "#334155", marginBottom: 8 }}>
                      Current: <strong>0.25mg SubQ weekly</strong> (Week 1 of 4)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { label: "Continue 0.25mg as prescribed", desc: "Standard titration — reassess at Week 4", value: "continue" },
                        { label: "Hold dose 1 week", desc: "Skip next injection, restart when GI symptoms resolve", value: "hold" },
                        { label: "Add ondansetron 4mg PRN", desc: "Anti-emetic for persistent nausea, continue Wegovy", value: "antiemetic" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          className={doseChoice === opt.value ? "" : "epic-button-blink"}
                          onClick={() => {
                            setDoseChoice(opt.value);
                            setTimeout(() => setActionConfirmed(true), 800);
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: doseChoice === opt.value ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                            backgroundColor: doseChoice === opt.value ? "#dbeafe" : "#ffffff",
                            cursor: doseChoice ? "default" : "pointer",
                            textAlign: "left",
                            width: "100%",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>
                            {doseChoice === opt.value ? "\u2713 " : ""}{opt.label}
                          </span>
                          <span style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dose confirmed */}
                {selectedAction === "dose" && actionConfirmed && (
                  <div className="epic-fade-in" style={{
                    border: "1px solid #bbf7d0",
                    borderRadius: 4,
                    backgroundColor: "#f0fdf4",
                    padding: "8px 12px",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", backgroundColor: "#dcfce7",
                      border: "1.5px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>
                      Dose adjustment order placed &mdash; added to medication list
                    </span>
                  </div>
                )}

                {/* Telehealth Step */}
                {selectedAction === "telehealth" && !actionConfirmed && (
                  <div className="epic-fade-in" style={{
                    border: "1px solid #ddd6fe",
                    borderRadius: 4,
                    backgroundColor: "#f5f3ff",
                    padding: "10px 12px",
                    marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#5b21b6", marginBottom: 8 }}>
                      Schedule Telehealth Visit
                    </div>
                    <div style={{ fontSize: 11, color: "#334155", marginBottom: 6 }}>
                      <strong>Patient:</strong> {selectedPatient.firstName} {selectedPatient.lastName} &middot; <strong>Provider:</strong> Dr. Patel, MD
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { label: "Tomorrow, 2:30 PM EST", desc: "Next available — 15 min video visit", value: "tomorrow" },
                        { label: "Friday, 10:00 AM EST", desc: "End of week follow-up — 15 min video visit", value: "friday" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          className="epic-button-blink"
                          onClick={() => {
                            setActionConfirmed(true);
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: "1px solid #cbd5e1",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{opt.label}</span>
                          <span style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Telehealth confirmed */}
                {selectedAction === "telehealth" && actionConfirmed && (
                  <div className="epic-fade-in" style={{
                    border: "1px solid #bbf7d0",
                    borderRadius: 4,
                    backgroundColor: "#f0fdf4",
                    padding: "8px 12px",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", backgroundColor: "#dcfce7",
                      border: "1.5px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>
                      Telehealth visit scheduled &mdash; patient will receive notification
                    </span>
                  </div>
                )}

                {/* Labs Step */}
                {selectedAction === "labs" && !actionConfirmed && (
                  <div className="epic-fade-in" style={{
                    border: "1px solid #99f6e4",
                    borderRadius: 4,
                    backgroundColor: "#f0fdfa",
                    padding: "10px 12px",
                    marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0f766e", marginBottom: 8 }}>
                      Lab Order &mdash; {selectedPatient.firstName} {selectedPatient.lastName}
                    </div>
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 11,
                      color: "#334155",
                      marginBottom: 8,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked readOnly style={{ accentColor: "#0d9488" }} />
                        <span><strong>HbA1c</strong> &mdash; Glycated hemoglobin</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked readOnly style={{ accentColor: "#0d9488" }} />
                        <span><strong>BMP</strong> &mdash; Basic Metabolic Panel (renal function + electrolytes)</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked readOnly style={{ accentColor: "#0d9488" }} />
                        <span><strong>Lipid Panel</strong> &mdash; Cholesterol, triglycerides</span>
                      </div>
                    </div>
                    <button
                      className="epic-button-blink"
                      onClick={() => setActionConfirmed(true)}
                      style={{
                        padding: "7px 16px",
                        borderRadius: 6,
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#ffffff",
                        background: "linear-gradient(135deg, #14b8a6, #0d9488)",
                        width: "100%",
                        transition: "all 0.2s ease",
                      }}
                    >
                      Place Lab Order
                    </button>
                  </div>
                )}

                {/* Labs confirmed */}
                {selectedAction === "labs" && actionConfirmed && (
                  <div className="epic-fade-in" style={{
                    border: "1px solid #bbf7d0",
                    borderRadius: 4,
                    backgroundColor: "#f0fdf4",
                    padding: "8px 12px",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", backgroundColor: "#dcfce7",
                      border: "1.5px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>
                      Lab order placed &mdash; Order #LC-2026-78432 (LabCorp)
                    </span>
                  </div>
                )}

                {!selectedAction && (
                  <div style={{
                    fontSize: 10,
                    color: "#94a3b8",
                    fontStyle: "italic",
                    textAlign: "center",
                  }}>
                    Select an action to take on this alert
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ============================================================ */
            /* Patient Flowsheet View (default -- idle through active)       */
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
                    Flowsheet &mdash; GLP-1 Monitoring
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  {currentDay > 0 ? `Week 1 \u2014 Day ${currentDay}` : "Pre-enrollment"}
                </span>
              </div>

              {/* -------------------------------------------------------- */}
              {/* Flowsheet Table (dynamic from DAY_DATA)                   */}
              {/* -------------------------------------------------------- */}
              <div style={{
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                overflow: "hidden",
                marginBottom: 10,
              }}>
                {currentDay === 0 ? (
                  /* Placeholder when no days enrolled */
                  <div style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: 12,
                    backgroundColor: "#fafbfc",
                  }}>
                    <div style={{ marginBottom: 6, fontSize: 16 }}>&#x1f4cb;</div>
                    Awaiting patient enrollment
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 11,
                      minWidth: visibleDays.length > 4 ? 520 : undefined,
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
                            width: "22%",
                            position: "sticky",
                            left: 0,
                            backgroundColor: "#f1f5f9",
                            zIndex: 1,
                          }}>
                            Parameter
                          </th>
                          {visibleDays.map((d, i) => {
                            const isIncident = d.isIncidentDay;
                            const isLast = i === visibleDays.length - 1;
                            return (
                              <th key={d.day} style={{
                                textAlign: "center",
                                padding: "6px 4px",
                                fontSize: 10,
                                fontWeight: 600,
                                color: isIncident ? "#dc2626" : "#64748b",
                                borderBottom: "1px solid #e2e8f0",
                                borderRight: isLast ? "none" : "1px solid #f1f5f9",
                                backgroundColor: isIncident ? "#fef2f2" : undefined,
                                whiteSpace: "nowrap",
                              }}>
                                {d.date}
                                {isIncident && (
                                  <span style={{ fontSize: 8, marginLeft: 3, color: "#dc2626" }}>&#9888;</span>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {FLOWSHEET_ROWS.map((row, ri) => (
                          <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                            <td style={{
                              padding: "5px 8px",
                              fontWeight: 600,
                              color: "#334155",
                              fontSize: 11,
                              borderRight: "1px solid #e2e8f0",
                              borderBottom: ri < FLOWSHEET_ROWS.length - 1 ? "1px solid #f1f5f9" : "none",
                              whiteSpace: "nowrap",
                              position: "sticky",
                              left: 0,
                              backgroundColor: ri % 2 === 0 ? "#ffffff" : "#fafbfc",
                              zIndex: 1,
                            }}>
                              {row.label}
                              <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 400, marginLeft: 4 }}>
                                {row.unit}
                              </span>
                            </td>
                            {visibleDays.map((d, vi) => {
                              const val = row.accessor(d);
                              const flag = row.flagFn?.(val);
                              const isLast = vi === visibleDays.length - 1;
                              return (
                                <td key={d.day} style={{
                                  textAlign: "center",
                                  padding: "5px 4px",
                                  fontSize: 11,
                                  fontFamily: "monospace",
                                  borderBottom: ri < FLOWSHEET_ROWS.length - 1 ? "1px solid #f1f5f9" : "none",
                                  borderRight: isLast ? "none" : "1px solid #f8fafc",
                                  ...flagCellStyle(flag),
                                }}>
                                  {val}
                                  {flag === "red" && (
                                    <span style={{ fontSize: 8, marginLeft: 2, color: "#dc2626" }}>&#9650;</span>
                                  )}
                                  {flag === "amber" && (
                                    <span style={{ fontSize: 8, marginLeft: 2, color: "#ea580c" }}>&#9650;</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* -------------------------------------------------------- */}
              {/* Week 1 Summary (Day 7, idle phase only)                   */}
              {/* -------------------------------------------------------- */}
              {showWeeklySummary && (
                <div style={{
                  border: "1px solid #bbf7d0",
                  borderLeft: "4px solid #22c55e",
                  borderRadius: 4,
                  padding: "12px 14px",
                  marginBottom: 10,
                  backgroundColor: "#f0fdf4",
                }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#166534",
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Week 1 Summary &mdash; {selectedPatient.firstName} {selectedPatient.lastName}
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "6px 16px",
                    fontSize: 11,
                    color: "#334155",
                    marginBottom: 10,
                  }}>
                    <div><span style={{ fontWeight: 600 }}>Net weight:</span> -1.6 lbs (247.2 &#8594; 245.6)</div>
                    <div><span style={{ fontWeight: 600 }}>Glucose improvement:</span> -24% (168 &#8594; 128 mg/dL)</div>
                    <div><span style={{ fontWeight: 600 }}>BP improvement:</span> 142/88 &#8594; 130/80</div>
                    <div><span style={{ fontWeight: 600 }}>GI tolerance:</span> Resolved by Day 6</div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ fontWeight: 600 }}>Engagement:</span> Recovered to 94% after Day 4 intervention
                    </div>
                  </div>

                </div>
              )}

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
                        backgroundColor: i === 0 ? "#f59e0b" : "#3b82f6",
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
                      whiteSpace: "nowrap",
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
                        backgroundColor: prob.color,
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
          Encounter: GLP-1 Engagement &middot; Week 1
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
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>
            Program: GLP-1 Monitoring &middot; Week 1 &middot; {currentDay > 0 ? `Day ${currentDay}` : "Pre-enrollment"}
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>
            Powered by CareCompanion AI
          </span>
        </div>
      </div>
    </div>
  );
}
