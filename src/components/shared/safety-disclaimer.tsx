import { cn } from "@/lib/utils";

interface SafetyDisclaimerProps {
  className?: string;
}

export function SafetyDisclaimer({ className }: SafetyDisclaimerProps) {
  return (
    <div
      className={cn(
        "px-4 py-2 text-center text-[10px] text-slate-500",
        className
      )}
    >
      <p>
        CareCompanion AI is not a substitute for professional medical advice.
        Always consult your healthcare provider for medical decisions.
      </p>
    </div>
  );
}
