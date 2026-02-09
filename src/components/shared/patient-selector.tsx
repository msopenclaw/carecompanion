"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  statusBadge: string;
}

interface PatientSelectorProps {
  patients: PatientOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

const statusColors: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

export function PatientSelector({
  patients,
  selectedId,
  onSelect,
  className,
}: PatientSelectorProps) {
  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger
        className={cn(
          "w-[220px] h-8 text-xs bg-slate-800 border-slate-600 text-white hover:bg-slate-700 focus:ring-slate-500",
          className
        )}
      >
        <SelectValue placeholder="Select a patient" />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-600">
        {patients.map((patient) => (
          <SelectItem
            key={patient.id}
            value={patient.id}
            className="text-slate-200 text-xs focus:bg-slate-700 focus:text-white"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full",
                  statusColors[patient.statusBadge] ?? "bg-gray-400"
                )}
              />
              <span>
                {patient.firstName} {patient.lastName}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
