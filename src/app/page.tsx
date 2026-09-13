import { connection } from "next/server";
import { type Address, isAddress } from "viem";
import { GasWorkspace } from "@/components/gas/gas-workspace";
import { CHAIN_LIST } from "@/config/chains";
import {
  getAlchemySponsorshipConfig,
  isAlchemySponsorshipConfigured,
} from "@/lib/gas/alchemy";
import { getPublicBundlerUrl } from "@/lib/gas/constants";
import type { NearClientConfig } from "@/lib/routes/types";

function validNearApiUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const localHttpHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    const isAllowedUrl =
      url.protocol === "https:" || (url.protocol === "http:" && localHttpHost);
    return isAllowedUrl ? url.toString().replace(/\/$/, "") : undefined;
  } catch {
    return undefined;
  }
}

export default async function Home() {
  await connection();
  const recipient = [
    process.env.SPONSORED_GAS_FEE_RECIPIENT,
    process.env.NEAR_INTENTS_FEE_RECIPIENT,
  ]
    .find((value) => value?.trim())
    ?.trim();
  const platformFeeRecipient = [
    process.env.PLATFORM_FEE_RECIPIENT,
    process.env.SPONSORED_GAS_FEE_RECIPIENT,
    process.env.NEAR_INTENTS_FEE_RECIPIENT,
  ]
    .find((value) => value?.trim())
    ?.trim();
  const nearFeeRecipient = process.env.NEAR_INTENTS_FEE_RECIPIENT?.trim();
  const nearReferralId = process.env.NEAR_INTENTS_REFERRER_ID?.trim();
  const nearManagerPublicKey =
    process.env.NEAR_INTENTS_MANAGER_PUBLIC_KEY?.trim();
  const nearApiUrl = validNearApiUrl(process.env.NEAR_INTENTS_API_URL?.trim());
  const nearClientConfig: NearClientConfig = {
    ...(nearFeeRecipient && isAddress(nearFeeRecipient)
      ? { feeRecipient: nearFeeRecipient as Address }
      : {}),
    ...(nearReferralId ? { referralId: nearReferralId } : {}),
    ...(nearManagerPublicKey ? { managerPublicKey: nearManagerPublicKey } : {}),
    ...(nearApiUrl ? { apiUrl: nearApiUrl } : {}),
  };
  const bundlerUrls = Object.fromEntries(
    CHAIN_LIST.flatMap((chain) => {
      const url = getPublicBundlerUrl(chain.id);
      return url ? [[chain.id, url]] : [];
    }),
  );
  return (
    <GasWorkspace
      sourceGasConfig={{
        ...(recipient && isAddress(recipient)
          ? { feeRecipient: recipient }
          : {}),
        ...(platformFeeRecipient && isAddress(platformFeeRecipient)
          ? { platformFeeRecipient }
          : {}),
        sponsoredChainIds: CHAIN_LIST.filter((chain) =>
          isAlchemySponsorshipConfigured(
            getAlchemySponsorshipConfig(chain.id),
            chain.id,
          ),
        ).map((chain) => chain.id),
        bundlerUrls,
      }}
      nearClientConfig={nearClientConfig}
    />
  );
}
