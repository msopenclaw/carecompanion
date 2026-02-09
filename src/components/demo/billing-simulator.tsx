"use client";

import { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Animated counter hook -- counts from 0 to `target` over `duration` ms
// ---------------------------------------------------------------------------
function useCountUp(target: number, duration: number = 1800, trigger: boolean = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!trigger) return;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, trigger]);

  return value;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmtDollar(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// CMS Code data
// ---------------------------------------------------------------------------
interface CMSCode {
  code: string;
  description: string;
  rate: string;
  patients: string;
  monthly: number;
  monthlyLabel?: string;
  isBold?: boolean;
}

const cmsCodes: CMSCode[] = [
  { code: "99453", description: "RPM Setup", rate: "$19", patients: "200 (new/qtr)", monthly: 3800 },
  { code: "99454", description: "Device Supply (16+ days)", rate: "$55", patients: "950", monthly: 52250 },
  { code: "99457", description: "First 20 min clinical", rate: "$52", patients: "900", monthly: 46800 },
  { code: "99458", description: "Addl 20 min clinical", rate: "$42", patients: "600", monthly: 25200 },
  { code: "99490", description: "CCM first 20 min", rate: "$64", patients: "700", monthly: 44800 },
  { code: "99491", description: "CCM complex 30 min", rate: "$87", patients: "100", monthly: 8700 },
  { code: "APCM", description: "Advanced Primary Care", rate: "varies", patients: "300", monthly: 15000, monthlyLabel: "~$15,000", isBold: true },
];

const TOTAL_MONTHLY = 196550;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BillingSimulator() {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Trigger animation on mount via IntersectionObserver (or immediately if not supported)
  useEffect(() => {
    if (!containerRef.current) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Animated counters
  const legacyRevenue = useCountUp(12000, 1600, visible);
  const legacyCost = useCountUp(8000, 1600, visible);
  const legacyNet = useCountUp(4000, 1600, visible);

  const aiRevenue = useCountUp(180000, 2000, visible);
  const aiCost = useCountUp(15000, 2000, visible);
  const aiNet = useCountUp(165000, 2200, visible);

  const totalProjection = useCountUp(TOTAL_MONTHLY, 2400, visible);

  // Progress bar width
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setBarWidth(100), 400);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-[520px] mx-auto bg-slate-50 text-slate-900 p-4 space-y-4 font-sans text-sm select-none"
    >
      {/* ----------------------------------------------------------------- */}
      {/* HEADER                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="text-center space-y-0.5">
        <h2 className="text-base font-bold tracking-tight text-slate-900">
          2026 CMS Revenue Simulator
        </h2>
        <p className="text-xs text-slate-500">
          Legacy RPM vs AI-Powered Care
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SIDE-BY-SIDE COMPARISON                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* --- Legacy RPM Card --- */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Legacy RPM
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <Row label="Patients" value="100" muted />
            <Row label="Daily Alerts" value="100 (nurse reviews all)" muted />
            <Row label="Nurse Time" value="40 hrs/week" muted />
            <Divider />
            <Row label="Revenue" value={fmtDollar(legacyRevenue) + "/mo"} muted />
            <Row label="Cost" value={fmtDollar(legacyCost) + "/mo"} sublabel="(nurse salary)" muted />
            <div className="pt-1 border-t border-slate-100">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-slate-600">Net</span>
                <span className="font-bold text-slate-700 tabular-nums">
                  {fmtDollar(legacyNet)}/mo
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* --- AI Co-Pilot Card --- */}
        <div
          className="relative rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-50 p-3 space-y-2.5 overflow-hidden"
          style={{
            boxShadow: "0 0 24px -4px rgba(59, 130, 246, 0.18), 0 0 6px -1px rgba(59, 130, 246, 0.10)",
          }}
        >
          {/* Subtle glow layer */}
          <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-blue-400/10 blur-2xl pointer-events-none" />

          <div className="flex items-center gap-1.5 relative">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
              AI Co-Pilot
            </span>
          </div>

          <div className="space-y-1.5 text-xs relative">
            <Row label="Patients" value="1,000" highlight />
            <Row label="Daily Alerts" value="5 escalated (AI handles rest)" highlight />
            <Row label="Nurse Time" value="10 hrs/week" highlight />
            <Divider blue />
            <Row label="Revenue" value={fmtDollar(aiRevenue) + "/mo"} highlight />
            <Row label="Cost" value={fmtDollar(aiCost) + "/mo"} sublabel="(AI + nurse)" highlight />
            <div className="pt-1 border-t border-blue-100">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-blue-700">Net</span>
                <span className="font-bold text-blue-800 tabular-nums text-sm">
                  {fmtDollar(aiNet)}/mo
                </span>
              </div>
            </div>
          </div>

          {/* Highlight badge */}
          <div className="relative flex justify-center pt-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="shrink-0">
                <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.06l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042.815a.75.75 0 01-.53-.919z" clipRule="evenodd" />
              </svg>
              10x patients &middot; 41x net revenue
            </span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* CMS CODE BREAKDOWN TABLE                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide px-0.5">
          2026 CMS Billing Code Breakdown
        </h3>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="text-left py-1.5 px-2 font-semibold">Code</th>
                <th className="text-left py-1.5 px-1.5 font-semibold">Description</th>
                <th className="text-right py-1.5 px-1.5 font-semibold">Rate</th>
                <th className="text-right py-1.5 px-1.5 font-semibold">Patients</th>
                <th className="text-right py-1.5 px-2 font-semibold">Monthly</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cmsCodes.map((row) => (
                <CMSRow key={row.code} row={row} visible={visible} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* TOTAL MONTHLY PROJECTION BAR                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between px-0.5">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Total Monthly Projection
          </span>
          <span className="text-lg font-extrabold text-blue-700 tabular-nums">
            {fmtDollar(totalProjection)}
          </span>
        </div>
        <div className="h-3.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 relative"
            style={{
              width: `${barWidth}%`,
              transition: "width 2.2s cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          >
            {/* shimmer */}
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              style={{
                animation: barWidth === 100 ? "shimmer 2s ease-in-out infinite" : "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* KEY INSIGHT CALLOUT                                               */}
      {/* ----------------------------------------------------------------- */}
      <div
        className="rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-3 space-y-1"
        style={{
          boxShadow: "0 0 16px -6px rgba(59, 130, 246, 0.15)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-blue-600 shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">
            Key Insight
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-blue-900/80">
          The AI doesn&apos;t replace the clinician &mdash; it unlocks scale. One nurse + AI can manage
          1,000 patients and capture $180K+/month in RPM + CCM + APCM revenue that was previously
          impossible.
        </p>
      </div>

      {/* Inline keyframes for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Row({
  label,
  value,
  sublabel,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  sublabel?: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className={muted ? "text-slate-500" : "text-blue-700 font-medium"}>
        {label}
      </span>
      <span
        className={
          "text-right tabular-nums leading-tight " +
          (highlight ? "text-blue-900 font-semibold" : "text-slate-700")
        }
      >
        {value}
        {sublabel && (
          <span className={muted ? " text-slate-400 text-[10px]" : " text-blue-500 text-[10px]"}>
            {" "}{sublabel}
          </span>
        )}
      </span>
    </div>
  );
}

function Divider({ blue }: { blue?: boolean }) {
  return (
    <div
      className={
        "border-t " + (blue ? "border-blue-100" : "border-slate-100")
      }
    />
  );
}

function CMSRow({ row, visible }: { row: CMSCode; visible: boolean }) {
  const animatedMonthly = useCountUp(row.monthly, 1800, visible);
  const displayMonthly = row.monthlyLabel ? row.monthlyLabel : fmtDollar(animatedMonthly);

  return (
    <tr className={row.isBold ? "bg-blue-50/50 font-semibold" : "hover:bg-slate-50/50"}>
      <td className="py-1.5 px-2 font-mono font-bold text-slate-800">
        {row.code}
      </td>
      <td className="py-1.5 px-1.5 text-slate-600">{row.description}</td>
      <td className="py-1.5 px-1.5 text-right text-slate-500 tabular-nums">
        {row.rate}
      </td>
      <td className="py-1.5 px-1.5 text-right text-slate-500 tabular-nums">
        {row.patients}
      </td>
      <td className="py-1.5 px-2 text-right font-semibold text-slate-800 tabular-nums">
        {displayMonthly}
      </td>
    </tr>
  );
}
