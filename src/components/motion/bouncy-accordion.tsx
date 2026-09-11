"use client";

import { cn } from "cn";

// Adapted from beui.dev/components/motion/bouncy-accordion for a single
// disclosure panel used in compact pickers.
import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useId } from "react";

type BouncyAccordionProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
  triggerClassName?: string;
};

export function BouncyAccordion({
  children,
  className,
  contentClassName,
  onOpenChange,
  open,
  title,
  triggerClassName,
}: BouncyAccordionProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const id = useId();
  const triggerId = `${id}-trigger`;
  const contentId = `${id}-content`;
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, duration: 0.3, bounce: 0 };

  return (
    <motion.div
      layout="position"
      className={cn("overflow-hidden", className)}
      initial={false}
      transition={transition}
    >
      <button
        aria-controls={contentId}
        aria-expanded={open}
        className={cn(
          "flex min-h-11 w-full items-center justify-center gap-1.5 outline-none transition-colors focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30",
          triggerClassName,
        )}
        id={triggerId}
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        {title}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          aria-hidden="true"
          className="grid size-4 place-items-center"
          initial={false}
          transition={transition}
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>
      <motion.div
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        aria-hidden={!open}
        aria-labelledby={triggerId}
        className={cn("overflow-hidden", contentClassName)}
        id={contentId}
        inert={!open}
        initial={false}
        role="region"
        transition={transition}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
