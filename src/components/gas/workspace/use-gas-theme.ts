"use client";

import { useEffect, useState } from "react";
import { appKit } from "@/config/appkit";

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
    appKit?.setThemeMode(nextTheme ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    setIsDark((current) => {
      const nextTheme = !current;
      document.documentElement.classList.toggle("dark", nextTheme);
      appKit?.setThemeMode(nextTheme ? "dark" : "light");
      window.localStorage.setItem("gas-theme", nextTheme ? "dark" : "light");
      return nextTheme;
    });
  };

  return { isDark, toggleTheme };
}
