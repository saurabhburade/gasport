import {
  ALCHEMY_NETWORKS,
  getAlchemyNetwork,
  getPublicBundlerUrl,
} from "@/lib/gas/constants";
import { GasExecutionError } from "@/lib/gas/errors";

export type AlchemySponsorshipConfig = {
  /** Server-only Alchemy API key. Never prefix this with NEXT_PUBLIC_. */
  apiKey?: string;
  /** Active Gas Manager / BSO policy ID for the Alchemy app. */
  policyId?: string;
  /** Optional allowlist of chains enabled on the policy. */
  supportedChainIds?: readonly number[];
  /** Keyless chain-specific ERC-4337 endpoint used for gas estimation. */
  bundlerUrl?: string;
  /** Chain-specific Alchemy endpoint used for sponsorship requests. */
  paymasterUrl?: string;
};

export const ALCHEMY_EIP7702_DELEGATIONS = {
  "v1.0.0": "0x69007702764179f14F51cdce752f4f775d74E139",
  "v1.1.0": "0x77021100bD87b7008E5E1989d0eB38555d0d0000",
} as const;

export type AlchemyEip7702Delegation =
  (typeof ALCHEMY_EIP7702_DELEGATIONS)[keyof typeof ALCHEMY_EIP7702_DELEGATIONS];

function getConfiguredAlchemyChainIds() {
  return Object.entries(ALCHEMY_NETWORKS)
    .filter(([, network]) => Boolean(network.policyId))
    .map(([chainId]) => Number(chainId));
}

function getAlchemyRpcUrl(chainId: number, apiKey: string | undefined) {
  const network = getAlchemyNetwork(chainId);
  if (!network || !apiKey) return undefined;
  return `https://${network.rpcHost}/v2/${apiKey}`;
}

export function getAlchemySponsorshipConfig(
  chainId?: number,
): AlchemySponsorshipConfig {
  const apiKey = process.env.ALCHEMY_API_KEY;
  const network =
    chainId === undefined ? undefined : getAlchemyNetwork(chainId);
  const rpcUrl =
    chainId === undefined ? undefined : getAlchemyRpcUrl(chainId, apiKey);

  return {
    apiKey,
    policyId: network?.policyId,
    supportedChainIds: getConfiguredAlchemyChainIds(),
    bundlerUrl:
      chainId === undefined ? undefined : getPublicBundlerUrl(chainId),
    paymasterUrl: rpcUrl,
  };
}

export function isSupportedAlchemyDelegation(
  address: string | undefined,
): address is AlchemyEip7702Delegation {
  const normalized = address?.toLowerCase();
  return (
    normalized === ALCHEMY_EIP7702_DELEGATIONS["v1.0.0"].toLowerCase() ||
    normalized === ALCHEMY_EIP7702_DELEGATIONS["v1.1.0"].toLowerCase()
  );
}

export function isAlchemySponsorshipConfigured(
  config: AlchemySponsorshipConfig,
  chainId?: number,
) {
  return Boolean(
    config.apiKey &&
      config.policyId &&
      (chainId === undefined ||
        config.supportedChainIds === undefined ||
        config.supportedChainIds.includes(chainId)),
  );
}

export function assertAlchemySponsorshipConfigured(
  config?: AlchemySponsorshipConfig,
  chainId?: number,
) {
  const resolvedConfig = config ?? getAlchemySponsorshipConfig(chainId);
  if (!resolvedConfig.apiKey || !resolvedConfig.policyId) {
    throw new GasExecutionError(
      "alchemy_not_configured",
      "Live Alchemy sponsorship is unavailable. Configure ALCHEMY_API_KEY and either ALCHEMY_POLICY_ID_<CHAIN> or the shared ALCHEMY_POLICY_ID on the server.",
    );
  }

  if (
    chainId !== undefined &&
    resolvedConfig.supportedChainIds &&
    !resolvedConfig.supportedChainIds.includes(chainId)
  ) {
    throw new GasExecutionError(
      "alchemy_chain_not_enabled",
      `Live Alchemy sponsorship is not enabled for chain ${chainId}. Enable the chain on the Gas Manager policy before using it.`,
    );
  }

  return resolvedConfig;
}
