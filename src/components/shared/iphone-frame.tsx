"use client";

import { useRef, ReactNode } from "react";

interface IPhoneFrameProps {
  children: ReactNode;
  label: string;
  labelColor: string;
  sublabel?: string;
}

export function IPhoneFrame({ children, label, labelColor, sublabel }: IPhoneFrameProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Label above phone */}
      <div className="flex items-center gap-2">
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
        {/* Outer shell with shadow */}
        <div
          className="relative rounded-[3rem] bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] p-[12px] shadow-2xl"
          style={{
            boxShadow:
              "0 25px 60px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 -1px 0 0 rgba(255,255,255,0.1) inset",
          }}
        >
          {/* Side button - right (power) */}
          <div className="absolute -right-[2px] top-32 w-[3px] h-12 bg-[#2a2a2a] rounded-r-sm" />
          {/* Side buttons - left (volume + silent) */}
          <div className="absolute -left-[2px] top-24 w-[3px] h-6 bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute -left-[2px] top-36 w-[3px] h-10 bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute -left-[2px] top-48 w-[3px] h-10 bg-[#2a2a2a] rounded-l-sm" />

          {/* Screen bezel */}
          <div className="relative rounded-[2.4rem] overflow-hidden bg-black w-[300px] h-[620px]">
            {/* Status bar */}
            <div className="relative z-20 flex items-center justify-between px-6 pt-3 pb-1 bg-white">
              <span className="text-[11px] font-semibold text-black">9:41</span>

              {/* Dynamic Island */}
              <div className="absolute left-1/2 -translate-x-1/2 top-2">
                <div className="w-[90px] h-[25px] bg-black rounded-full flex items-center justify-center">
                  <div className="w-[8px] h-[8px] rounded-full bg-[#1a1a1a] border border-[#333] ml-8" />
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Signal bars */}
                <svg width="15" height="10" viewBox="0 0 15 10" className="text-black">
                  <rect x="0" y="7" width="2.5" height="3" fill="currentColor" rx="0.5" />
                  <rect x="3.5" y="5" width="2.5" height="5" fill="currentColor" rx="0.5" />
                  <rect x="7" y="3" width="2.5" height="7" fill="currentColor" rx="0.5" />
                  <rect x="10.5" y="0" width="2.5" height="10" fill="currentColor" rx="0.5" />
                </svg>
                {/* WiFi */}
                <svg width="13" height="10" viewBox="0 0 13 10" className="text-black">
                  <path d="M6.5 8.5a1 1 0 110 2 1 1 0 010-2z" fill="currentColor" />
                  <path d="M3.5 7a4.5 4.5 0 016 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                  <path d="M1 4.5a7.5 7.5 0 0111 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                </svg>
                {/* Battery */}
                <svg width="22" height="10" viewBox="0 0 22 10" className="text-black">
                  <rect x="0" y="1" width="18" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" fill="none" />
                  <rect x="1.5" y="2.5" width="14" height="5" rx="0.5" fill="currentColor" />
                  <rect x="19" y="3" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.4" />
                </svg>
              </div>
            </div>

            {/* Scrollable content area */}
            <div
              ref={scrollRef}
              className="h-[calc(100%-40px)] overflow-y-auto bg-white scrollbar-thin"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "#d4d4d4 transparent",
              }}
            >
              {children}
            </div>

            {/* Home indicator */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-black/20 rounded-full z-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
