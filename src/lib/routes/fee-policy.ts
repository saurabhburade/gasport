import { CHAIN_LIST } from "../../config/chains.ts";

export type PlatformFeeConfig = Readonly<{
  selfFundedBps: number;
  sponsoredBps: number;
}>;

const DEFAULT_PLATFORM_FEE_CONFIG: PlatformFeeConfig = {
  selfFundedBps: 400,
  sponsoredBps: 100,
};

export const PLATFORM_FEE_CONFIG_BY_CHAIN_ID: Readonly<
  Record<number, PlatformFeeConfig>
> = Object.freeze(
  Object.fromEntries(CHAIN_LIST.map((chain) => [chain.id, chain.fees])),
);

export function platformFeeBpsFor(
  chainId: number,
  sponsorshipRequired: boolean,
) {
  const config =
    PLATFORM_FEE_CONFIG_BY_CHAIN_ID[chainId] ?? DEFAULT_PLATFORM_FEE_CONFIG;
  return sponsorshipRequired ? config.sponsoredBps : config.selfFundedBps;
}
