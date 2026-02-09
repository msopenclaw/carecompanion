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
    <div className="flex flex-col items-center gap-2.5 h-full w-full">
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

      {/* Monitor body — 16:10 landscape ratio */}
      <div className="flex flex-col items-center flex-1 min-h-0 w-full">
        {/* Screen bezel */}
        <div
          className="relative rounded-lg bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] p-[8px] flex-1 min-h-0 flex flex-col w-full"
          style={{
            boxShadow:
              "0 20px 50px -12px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06) inset",
          }}
        >
          {/* Webcam dot */}
          <div className="absolute top-[3px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-[#333] border border-[#444]" />

          {/* Screen */}
          <div className="rounded-[4px] overflow-hidden bg-white flex-1 min-h-0 flex flex-col w-full">
            {/* Browser chrome */}
            <div className="bg-[#f0f0f0] border-b px-3 py-1 flex items-center gap-2 shrink-0">
              {/* Traffic lights */}
              <div className="flex items-center gap-1">
                <div className="w-[9px] h-[9px] rounded-full bg-[#ff5f57]" />
                <div className="w-[9px] h-[9px] rounded-full bg-[#febc2e]" />
                <div className="w-[9px] h-[9px] rounded-full bg-[#28c840]" />
              </div>
              {/* URL bar */}
              <div className="flex-1 mx-2">
                <div className="bg-white rounded px-2.5 py-0.5 text-[9px] text-gray-500 border flex items-center gap-1">
                  <svg width="8" height="8" viewBox="0 0 16 16" fill="none" className="text-green-600 shrink-0">
                    <path d="M8 1a4 4 0 00-4 4v3H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V5a4 4 0 00-4-4zm2 7H6V5a2 2 0 114 0v3z" fill="currentColor"/>
                  </svg>
                  carecompanion.earlygod.ai
                </div>
              </div>
            </div>

            {/* Content area — scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {children}
            </div>
          </div>
        </div>

        {/* Monitor stand — thin */}
        <div className="flex flex-col items-center">
          <div className="w-[50px] h-[22px] bg-gradient-to-b from-[#d4d4d4] to-[#b0b0b0] rounded-b-sm" />
          <div className="w-[100px] h-[6px] bg-gradient-to-b from-[#c0c0c0] to-[#a0a0a0] rounded-b-lg" />
        </div>
      </div>
    </div>
  );
}
