"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("console_token") || ""
    : "";
}

interface Patient {
  id: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    ageBracket: string;
    glp1Medication: string;
    glp1StartDate: string;
    phone: string;
    conditions: string[];
  } | null;
  coordinator: { name: string } | null;
  lastAiAction: { urgency: string; assessment: string; createdAt: string } | null;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${RAILWAY_URL}/api/console/patients`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then(setPatients)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = p.profile
      ? `${p.profile.firstName} ${p.profile.lastName}`.toLowerCase()
      : "";
    return name.includes(q) || p.email.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patients..."
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 w-64"
        />
      </div>

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Age Group</th>
                <th className="px-4 py-3 font-medium">Medication</th>
                <th className="px-4 py-3 font-medium">Coordinator</th>
                <th className="px-4 py-3 font-medium">Last Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.profile
                      ? `${p.profile.firstName} ${p.profile.lastName}`
                      : p.email}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.profile?.ageBracket || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.profile?.glp1Medication || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.coordinator?.name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {p.lastAiAction ? (
                      <span className="text-xs text-slate-500">
                        {p.lastAiAction.urgency} —{" "}
                        {p.lastAiAction.assessment?.slice(0, 40)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">No data</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/console/patients/${p.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              No patients found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
