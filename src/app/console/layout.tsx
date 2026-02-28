"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { ConsoleProvider, useConsole, type PatientSummary } from "./console-context";

const NAV_ITEMS = [
  { href: "/console", label: "Dashboard", icon: "grid" },
  { href: "/console/ehr", label: "EHR / Health Record", icon: "heart" },
  { href: "/console/pipeline", label: "Pipeline", icon: "zap" },
  { href: "/console/monologue", label: "AI Monologue", icon: "brain" },
  { href: "/console/calls", label: "Voice Calls", icon: "phone" },
  { href: "/console/analytics", label: "Analytics", icon: "chart" },
  { href: "/console/settings", label: "Settings", icon: "settings" },
];

const ICONS: Record<string, string> = {
  grid: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
  heart: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  zap: "M13 10V3L4 14h7v7l9-11h-7z",
  users: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
  brain: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  phone: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z",
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  settings: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z",
};

const URGENCY_COLORS: Record<string, string> = {
  low: "bg-green-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

function getInitials(profile: PatientSummary["profile"]): string {
  if (!profile) return "?";
  return `${(profile.firstName || "?")[0]}${(profile.lastName || "?")[0]}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Patient Selector Dropdown
// ---------------------------------------------------------------------------

function PatientSelector() {
  const { patients, selectedPatientId, setSelectedPatientId, selectedPatient } = useConsole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative px-4 pb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-left"
      >
        {selectedPatient?.profile ? (
          <>
            <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {getInitials(selectedPatient.profile)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {selectedPatient.profile.firstName} {selectedPatient.profile.lastName}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {selectedPatient.profile.glp1Medication || "No medication"}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-7 h-7 rounded-full bg-slate-700 text-slate-400 flex items-center justify-center text-xs flex-shrink-0">
              ?
            </div>
            <span className="text-sm text-slate-400">Select patient</span>
          </>
        )}
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-full mt-1 bg-slate-800 rounded-lg border border-slate-600 shadow-xl z-50 max-h-80 overflow-y-auto">
          {patients.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-400 text-center">No patients</div>
          ) : (
            patients.map((p) => {
              const isActive = selectedPatientId === p.id;
              const urgency = p.lastAiAction?.urgency;
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPatientId(p.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-700 transition-colors ${
                    isActive ? "bg-slate-700" : ""
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                    isActive ? "bg-blue-500/20 text-blue-300" : "bg-slate-600 text-slate-300"
                  }`}>
                    {getInitials(p.profile)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">
                      {p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : p.email}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {p.profile?.glp1Medication && (
                        <span className="text-[10px] text-slate-400">{p.profile.glp1Medication}</span>
                      )}
                      {urgency && (
                        <span className={`w-1.5 h-1.5 rounded-full ${URGENCY_COLORS[urgency] || ""}`} />
                      )}
                    </div>
                  </div>
                  {isActive && (
                    <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function ConsoleLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't apply layout to login page
  if (pathname === "/console/login") {
    return <>{children}</>;
  }

  function handleLogout() {
    document.cookie = "console_token=; path=/; max-age=0; samesite=strict";
    localStorage.removeItem("console_token");
    localStorage.removeItem("console_refresh");
    localStorage.removeItem("console_selected_patient");
    router.push("/console/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-lg font-bold">CareCompanion</h1>
          <p className="text-xs text-slate-400 mt-0.5">Operations Console</p>
        </div>

        {/* Patient Selector */}
        <div className="pt-3 border-b border-slate-700">
          <div className="px-6 pb-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Patient</span>
          </div>
          <PatientSelector />
        </div>

        <nav className="flex-1 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/console"
                ? pathname === "/console"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-slate-800 text-white border-r-2 border-blue-400"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={ICONS[item.icon]}
                  />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-slate-400 hover:text-white transition-colors px-2 py-1.5"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64">
        <div className="p-8">{mounted ? children : null}</div>
      </main>
    </div>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleProvider>
      <ConsoleLayoutInner>{children}</ConsoleLayoutInner>
    </ConsoleProvider>
  );
}
