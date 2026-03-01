"use client";

import React from "react";
import { motion } from "framer-motion";
import { ProjectCard, type ProjectCardProps } from "@/components/molecules";
import { cn } from "@/lib/utils";

export interface ProjectGridProps {
  projects: ProjectCardProps[];
  columns?: 2 | 3;
  className?: string;
}

export function ProjectGrid({
  projects,
  columns = 3,
  className,
}: ProjectGridProps) {
  const gridCols = {
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  };

  if (projects.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="w-24 h-24 mb-6 rounded-full bg-box flex items-center justify-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z"
              fill="#13636F"
              fillOpacity="0.3"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-text mb-2">
          No Projects Found
        </h3>
        <p className="text-gray-500 max-w-md">
          There are no projects matching your criteria. Try adjusting your
          filters or check back later for new opportunities.
        </p>
      </motion.div>
    );
  }

  return (
    <div className={cn("grid gap-6 lg:gap-8", gridCols[columns], className)}>
      {projects.map((project, index) => (
        <ProjectCard key={project.id} {...project} index={index} />
      ))}
    </div>
  );
}
