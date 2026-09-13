import type { ReactNode } from "react";
import { AppProviders } from "@/components/app-providers";

export default function ContentLayout({ children }: { children: ReactNode }) {
  return <AppProviders cookies={null}>{children}</AppProviders>;
}
