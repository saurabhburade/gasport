"use client";

import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type MouseEvent, useEffect, useState } from "react";
import { flushSync } from "react-dom";

type ThemeToggleProps = {
  isDark: boolean;
  onToggle: () => void;
};

const transitionStyleId = "gas-theme-toggle-transition";
const transitionCss = `
html[data-gas-theme-transition="circle-blur"]::view-transition-old(root) {
  animation: none;
  mix-blend-mode: normal;
}
html[data-gas-theme-transition="circle-blur"]::view-transition-new(root) {
  animation: gas-theme-circle-blur 700ms cubic-bezier(0.4, 0, 0.2, 1);
  mix-blend-mode: normal;
}
@keyframes gas-theme-circle-blur {
  from {
    clip-path: circle(0 at var(--gas-theme-x) var(--gas-theme-y));
    filter: blur(8px);
  }
  to {
    clip-path: circle(150% at var(--gas-theme-x) var(--gas-theme-y));
    filter: blur(0);
  }
}
`;

export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (document.getElementById(transitionStyleId)) return;

    const style = document.createElement("style");
    style.id = transitionStyleId;
    style.textContent = transitionCss;
    document.head.appendChild(style);
  }, []);

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion || !("startViewTransition" in document)) {
      onToggle();
      return;
    }

    const root = document.documentElement;
    const bounds = event.currentTarget.getBoundingClientRect();
    root.style.setProperty(
      "--gas-theme-x",
      `${bounds.left + bounds.width / 2}px`,
    );
    root.style.setProperty(
      "--gas-theme-y",
      `${bounds.top + bounds.height / 2}px`,
    );
    root.dataset.gasThemeTransition = "circle-blur";

    const transition = (
      document as Document & {
        startViewTransition: (update: () => void) => {
          finished: Promise<void>;
        };
      }
    ).startViewTransition(() => flushSync(onToggle));

    transition.finished.finally(() => {
      delete root.dataset.gasThemeTransition;
    });
  };

  return (
    <button
      aria-label={isDark ? "Use light theme" : "Use dark theme"}
      className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      onClick={toggle}
      type="button"
    >
      {mounted ? (
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
            className="grid place-items-center"
            exit={{ filter: "blur(8px)", opacity: 0, scale: 0.25 }}
            initial={{ filter: "blur(8px)", opacity: 0, scale: 0.25 }}
            key={isDark ? "sun" : "moon"}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {isDark ? (
              <Sun className="size-3.5" />
            ) : (
              <Moon className="size-3.5" />
            )}
          </motion.span>
        </AnimatePresence>
      ) : (
        <span className="size-3.5" />
      )}
    </button>
  );
}
