"use client";

import React from "react";
import { CheckCircle2, Clock, Lock } from "lucide-react";
import { cn, formatCurrency, formatDateTimeLocal } from "@/lib/utils";
import { Badge } from "@/components/atoms";
import type { ProjectPhase } from "@/lib/api/repositories/projects.repository";

export interface PhaseTimelineProps {
  phases: ProjectPhase[];
  className?: string;
}

type PhaseStatus = "completed" | "active" | "upcoming";

function getPhaseStatus(phase: ProjectPhase): PhaseStatus {
  const now = new Date();
  if (phase.is_active) return "active";
  if (new Date(phase.end_time) < now) return "completed";
  return "upcoming";
}

function formatDate(dateStr: string): string {
  return formatDateTimeLocal(dateStr);
}

export function PhaseTimeline({ phases, className }: PhaseTimelineProps) {
  if (!phases || phases.length === 0) {
    return (
      <div className="text-center py-8 text-black/40">
        No sale phases available.
      </div>
    );
  }

  const sorted = [...phases].sort((a, b) => a.phase_number - b.phase_number);

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop: horizontal timeline */}
      <div className="hidden md:block">
        <div className="relative flex items-start justify-between">
          {/* Connector line */}
          <div className="absolute top-5 left-[5%] right-[5%] h-0.5 bg-black/10" />
          {sorted.map((phase) => {
            const status = getPhaseStatus(phase);
            return (
              <PhaseNode key={phase.id} phase={phase} status={status} />
            );
          })}
        </div>
      </div>

      {/* Mobile: vertical stack */}
      <div className="md:hidden space-y-4">
        {sorted.map((phase, i) => {
          const status = getPhaseStatus(phase);
          return (
            <PhaseStackItem
              key={phase.id}
              phase={phase}
              status={status}
              isLast={i === sorted.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}

function PhaseNode({ phase, status }: { phase: ProjectPhase; status: PhaseStatus }) {
  const allocation = parseFloat(phase.allocation);
  return (
    <div className="flex-1 flex flex-col items-center text-center px-2 relative z-10">
      {/* Status dot */}
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center mb-3",
          status === "active" && "bg-darkAqua text-white shadow-lg shadow-darkAqua/30",
          status === "completed" && "bg-green-500 text-white",
          status === "upcoming" && "bg-black/10 text-black/40"
        )}
      >
        {status === "completed" && <CheckCircle2 className="h-5 w-5" />}
        {status === "active" && <Clock className="h-5 w-5" />}
        {status === "upcoming" && <Lock className="h-5 w-5" />}
      </div>

      {/* Phase info card */}
      <div
        className={cn(
          "bg-white rounded-xl p-4 border w-full max-w-[220px]",
          status === "active" && "border-darkAqua shadow-md",
          status === "completed" && "border-black/10 opacity-70",
          status === "upcoming" && "border-black/10"
        )}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <h4 className="font-semibold text-sm text-text">{phase.name}</h4>
          {status === "active" && <Badge variant="active" size="sm">Live</Badge>}
          {status === "upcoming" && <Badge variant="pending" size="sm">Upcoming</Badge>}
          {status === "completed" && <Badge variant="success" size="sm">Sold</Badge>}
        </div>
        <p className="text-lg font-bold text-darkAqua mb-1">
          {formatCurrency(parseFloat(phase.price_per_token))}
        </p>
        <p className="text-xs text-black/40 mb-2">per token</p>
        <div className="text-xs text-black/50 space-y-1">
          <p>{formatDate(phase.start_time)} — {formatDate(phase.end_time)}</p>
          <p>Allocation: {formatCurrency(allocation)}</p>
        </div>
      </div>
    </div>
  );
}

function PhaseStackItem({
  phase,
  status,
  isLast,
}: {
  phase: ProjectPhase;
  status: PhaseStatus;
  isLast: boolean;
}) {
  const allocation = parseFloat(phase.allocation);
  return (
    <div className="flex gap-4">
      {/* Vertical connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            status === "active" && "bg-darkAqua text-white",
            status === "completed" && "bg-green-500 text-white",
            status === "upcoming" && "bg-black/10 text-black/40"
          )}
        >
          {status === "completed" && <CheckCircle2 className="h-4 w-4" />}
          {status === "active" && <Clock className="h-4 w-4" />}
          {status === "upcoming" && <Lock className="h-4 w-4" />}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-black/10 my-1" />}
      </div>

      {/* Card */}
      <div
        className={cn(
          "flex-1 bg-white rounded-xl p-4 border mb-1",
          status === "active" && "border-darkAqua shadow-md",
          status === "completed" && "border-black/10 opacity-70",
          status === "upcoming" && "border-black/10"
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-semibold text-sm text-text">{phase.name}</h4>
          {status === "active" && <Badge variant="active" size="sm">Live</Badge>}
          {status === "upcoming" && <Badge variant="pending" size="sm">Upcoming</Badge>}
          {status === "completed" && <Badge variant="success" size="sm">Sold</Badge>}
        </div>
        <p className="text-darkAqua font-bold">{formatCurrency(parseFloat(phase.price_per_token))}<span className="text-xs text-black/40 font-normal ml-1">per token</span></p>
        <div className="flex gap-4 mt-2 text-xs text-black/50">
          <span>{formatDate(phase.start_time)} — {formatDate(phase.end_time)}</span>
          <span>Allocation: {formatCurrency(allocation)}</span>
        </div>
      </div>
    </div>
  );
}
