"use client";

import { ReactNode } from "react";

interface MonitorFrameProps {
  children: ReactNode;
  label: string;
  labelColor: string;
  sublabel?: string;
}

export function MonitorFrame({ children, label, labelColor, sublabel }: MonitorFrameProps) {
  return (
    <div className="flex flex-col items-center gap-3 h-full">
      {/* Label above monitor */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{
            backgroundColor: `${labelColor}15`,
            color: labelColor,
            border: `1px solid ${labelColor}30`,
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span className="text-[11px] text-muted-foreground">{sublabel}</span>
        )}
      </div>

      {/* Monitor body */}
      <div className="flex flex-col items-center flex-1 min-h-0">
        {/* Screen bezel */}
        <div
          className="relative rounded-xl bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] p-[10px] flex-1 min-h-0 flex flex-col"
          style={{
            boxShadow:
              "0 20px 50px -12px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06) inset",
          }}
        >
          {/* Webcam dot */}
          <div className="absolute top-[4px] left-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full bg-[#333] border border-[#444]" />

          {/* Screen */}
          <div className="rounded-lg overflow-hidden bg-white flex-1 min-h-0 flex flex-col w-full">
            {/* Browser chrome */}
            <div className="bg-[#f0f0f0] border-b px-3 py-1.5 flex items-center gap-2 shrink-0">
              {/* Traffic lights */}
              <div className="flex items-center gap-1.5">
                <div className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
                <div className="w-[10px] h-[10px] rounded-full bg-[#febc2e]" />
                <div className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
              </div>
              {/* URL bar */}
              <div className="flex-1 mx-2">
                <div className="bg-white rounded-md px-3 py-0.5 text-[10px] text-gray-500 border flex items-center gap-1.5">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-green-600 shrink-0">
                    <path d="M8 1a4 4 0 00-4 4v3H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V5a4 4 0 00-4-4zm2 7H6V5a2 2 0 114 0v3z" fill="currentColor"/>
                  </svg>
                  carecompanion.earlygod.ai/provider
                </div>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {children}
            </div>
          </div>
        </div>

        {/* Monitor stand */}
        <div className="flex flex-col items-center">
          <div className="w-[60px] h-[30px] bg-gradient-to-b from-[#d4d4d4] to-[#b0b0b0] rounded-b-sm" />
          <div className="w-[120px] h-[8px] bg-gradient-to-b from-[#c0c0c0] to-[#a0a0a0] rounded-b-lg" />
        </div>
      </div>
    </div>
  );
}
