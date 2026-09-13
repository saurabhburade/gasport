import type { Metadata } from "next";
import { HowItWorksPage as HowItWorksContent } from "@/components/how-it-works-page";

export const metadata: Metadata = {
  title: "How it works | Gasport",
};

export default function HowItWorksPage() {
  return <HowItWorksContent />;
}
