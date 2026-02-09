import { cn } from "@/lib/utils";

interface SafetyDisclaimerProps {
  className?: string;
}

export function SafetyDisclaimer({ className }: SafetyDisclaimerProps) {
  return (
    <div
      className={cn(
        "border-t bg-muted/50 px-4 py-3 text-center text-xs text-muted-foreground",
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
