"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("console_token") || "";
}

export interface PatientSummary {
  id: string;
  email: string;
  createdAt: string;
  profile: {
    firstName: string;
    lastName: string;
    ageBracket: string;
    glp1Medication: string;
    glp1Dosage: string;
    glp1StartDate: string;
    injectionDay: string;
    phone: string;
    conditions: string[];
    currentSideEffects: string[];
    goals: string[];
  } | null;
  coordinator: { name: string } | null;
  preferences: Record<string, unknown> | null;
  lastMessage: { content: string; sender: string; createdAt: string } | null;
  lastAiAction: {
    urgency: string;
    action: string;
    assessment: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

interface ConsoleContextValue {
  patients: PatientSummary[];
  selectedPatientId: string | null;
  setSelectedPatientId: (id: string | null) => void;
  selectedPatient: PatientSummary | null;
  refreshPatients: () => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selectedPatientId, setSelectedPatientIdState] = useState<string | null>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("console_selected_patient");
    if (stored) setSelectedPatientIdState(stored);
  }, []);

  const setSelectedPatientId = useCallback((id: string | null) => {
    setSelectedPatientIdState(id);
    if (id) {
      localStorage.setItem("console_selected_patient", id);
    } else {
      localStorage.removeItem("console_selected_patient");
    }
  }, []);

  const refreshPatients = useCallback(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${RAILWAY_URL}/api/console/patients`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setPatients)
      .catch(console.error);
  }, []);

  useEffect(() => {
    refreshPatients();
    const interval = setInterval(refreshPatients, 30000);
    return () => clearInterval(interval);
  }, [refreshPatients]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || null;

  return (
    <ConsoleContext.Provider
      value={{ patients, selectedPatientId, setSelectedPatientId, selectedPatient, refreshPatients }}
    >
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsole() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}
