"use client";

import { ReactNode } from "react";

interface IPhoneFrameProps {
  children: ReactNode;
  label: string;
  labelColor: string;
  sublabel?: string;
}

export function IPhoneFrame({ children, label, labelColor, sublabel }: IPhoneFrameProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Label above phone */}
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

      {/* Phone body */}
      <div className="relative">
        {/* Outer shell */}
        <div
          className="relative rounded-[3rem] bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] p-[11px]"
          style={{
            boxShadow:
              "0 25px 60px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 -1px 0 0 rgba(255,255,255,0.1) inset",
          }}
        >
          {/* Side buttons */}
          <div className="absolute -right-[2px] top-28 w-[3px] h-12 bg-[#2a2a2a] rounded-r-sm" />
          <div className="absolute -left-[2px] top-20 w-[3px] h-5 bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute -left-[2px] top-32 w-[3px] h-9 bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute -left-[2px] top-44 w-[3px] h-9 bg-[#2a2a2a] rounded-l-sm" />

          {/* Screen */}
          <div className="relative rounded-[2.4rem] overflow-hidden bg-black w-[280px] h-[590px]">
            {/* Status bar */}
            <div className="relative z-20 flex items-center justify-between px-7 pt-2.5 pb-0.5 bg-white">
              <span className="text-[10px] font-semibold text-black">9:41</span>
              {/* Dynamic Island */}
              <div className="absolute left-1/2 -translate-x-1/2 top-1.5">
                <div className="w-[80px] h-[22px] bg-black rounded-full flex items-center justify-center">
                  <div className="w-[7px] h-[7px] rounded-full bg-[#1a1a1a] border border-[#333] ml-7" />
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <svg width="13" height="9" viewBox="0 0 15 10" className="text-black">
                  <rect x="0" y="7" width="2.5" height="3" fill="currentColor" rx="0.5" />
                  <rect x="3.5" y="5" width="2.5" height="5" fill="currentColor" rx="0.5" />
                  <rect x="7" y="3" width="2.5" height="7" fill="currentColor" rx="0.5" />
                  <rect x="10.5" y="0" width="2.5" height="10" fill="currentColor" rx="0.5" />
                </svg>
                <svg width="11" height="9" viewBox="0 0 13 10" className="text-black">
                  <path d="M6.5 8.5a1 1 0 110 2 1 1 0 010-2z" fill="currentColor" />
                  <path d="M3.5 7a4.5 4.5 0 016 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                  <path d="M1 4.5a7.5 7.5 0 0111 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                </svg>
                <svg width="20" height="9" viewBox="0 0 22 10" className="text-black">
                  <rect x="0" y="1" width="18" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" fill="none" />
                  <rect x="1.5" y="2.5" width="14" height="5" rx="0.5" fill="currentColor" />
                  <rect x="19" y="3" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.4" />
                </svg>
              </div>
            </div>

            {/* Scrollable content */}
            <div
              className="h-[calc(100%-32px)] overflow-y-auto bg-white"
              style={{
                scrollbarWidth: "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <style jsx>{`div::-webkit-scrollbar { display: none; }`}</style>
              {children}
            </div>

            {/* Home indicator */}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-24 h-1 bg-black/15 rounded-full z-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
