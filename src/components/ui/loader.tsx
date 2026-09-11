"use client";

import { cn } from "cn";
import { motion, useReducedMotion } from "motion/react";
import type * as React from "react";

type LoaderProps = React.ComponentProps<"span"> & {
  label?: string;
  size?: number;
  speed?: number;
};

function Loader({
  className,
  label = "Loading",
  size = 20,
  speed = 1,
  ...props
}: LoaderProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const stroke = Math.max(2, size * 0.09);
  const radius = (size - stroke) / 2;

  return (
    <span
      aria-label={label}
      className={cn("inline-flex items-center justify-center", className)}
      role="status"
      {...props}
    >
      <motion.svg
        aria-hidden="true"
        animate={reduceMotion ? { opacity: [1, 0.4, 1] } : { rotate: 360 }}
        height={size}
        transition={
          reduceMotion
            ? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
            : { duration: speed, ease: "linear", repeat: Infinity }
        }
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={stroke}
        />
        <path
          d={`M ${size / 2} ${size / 2 - radius} A ${radius} ${radius} 0 0 1 ${size / 2 + radius} ${size / 2}`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={stroke}
        />
      </motion.svg>
    </span>
  );
}

export { Loader };
