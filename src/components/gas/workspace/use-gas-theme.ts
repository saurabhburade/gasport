"use client";

import { useEffect, useState } from "react";

export function useGasTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("gas-theme");
    const nextTheme =
      savedTheme === "dark" ||
      (savedTheme === null &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme);
  }, []);

  const toggleTheme = () => {
    setIsDark((current) => {
      const nextTheme = !current;
      document.documentElement.classList.toggle("dark", nextTheme);
      window.localStorage.setItem("gas-theme", nextTheme ? "dark" : "light");
      return nextTheme;
    });
  };

  return { isDark, toggleTheme };
}
