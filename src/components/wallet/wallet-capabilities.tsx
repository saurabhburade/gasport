import { CircleHelp, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WalletCapabilities } from "@/types/wallet";

const capabilities: WalletCapabilities = {
  eip7702: "unknown",
  eip5792: "unknown",
  smartAccount: "unknown",
  passkey: "unknown",
};

export function WalletCapabilitiesNote() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5 text-primary" />
      <span>Gas sponsorship eligibility</span>
      <Badge
        variant="outline"
        className="rounded-full px-2 py-0 text-xs tracking-[0.12em]"
      >
        {capabilities.eip7702 === "unknown" ? "checks at sign" : "ready"}
      </Badge>
      <CircleHelp className="size-3.5" />
    </div>
  );
}
