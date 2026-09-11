import { CHAIN_LIST } from "../../config/chains.ts";

export function resolveAlchemyPolicyId(
  chainPolicyId: string | undefined,
  commonPolicyId = process.env.ALCHEMY_POLICY_ID,
) {
  return chainPolicyId?.trim() || commonPolicyId?.trim() || undefined;
}

/**
 * Server-only Alchemy network metadata. Chain-specific policies take
 * precedence; ALCHEMY_POLICY_ID is the shared fallback.
 */
export const ALCHEMY_NETWORKS = {
  1: {
    name: "Ethereum Mainnet",
    rpcHost: "eth-mainnet.g.alchemy.com",
    policyId: resolveAlchemyPolicyId(process.env.ALCHEMY_POLICY_ID_ETHEREUM),
  },
  8453: {
    name: "Base",
    rpcHost: "base-mainnet.g.alchemy.com",
    policyId: resolveAlchemyPolicyId(process.env.ALCHEMY_POLICY_ID_BASE),
  },
  42161: {
    name: "Arbitrum One",
    rpcHost: "arb-mainnet.g.alchemy.com",
    policyId: resolveAlchemyPolicyId(process.env.ALCHEMY_POLICY_ID_ARBITRUM),
  },
  10: {
    name: "Optimism",
    rpcHost: "opt-mainnet.g.alchemy.com",
    policyId: resolveAlchemyPolicyId(process.env.ALCHEMY_POLICY_ID_OPTIMISM),
  },
  143: {
    name: "Monad Mainnet",
    rpcHost: "monad-mainnet.g.alchemy.com",
    policyId: resolveAlchemyPolicyId(process.env.ALCHEMY_POLICY_ID_MONAD),
  },
} as const;

export type AlchemySupportedChainId = keyof typeof ALCHEMY_NETWORKS;

/**
 * Keyless Pimlico bundler endpoints used for ERC-4337 gas estimation. Keep
 * sponsorship requests on the chain-specific Alchemy paymaster endpoint.
 */
export const PUBLIC_BUNDLER_URL_BY_CHAIN_ID = {
  1: "https://public.pimlico.io/v2/1/rpc",
  8453: "https://public.pimlico.io/v2/8453/rpc",
  42161: "https://public.pimlico.io/v2/42161/rpc",
  10: "https://public.pimlico.io/v2/10/rpc",
  143: "https://public.pimlico.io/v2/143/rpc",
} as const satisfies Record<AlchemySupportedChainId, string>;

/** Standard keyless RPC endpoints used to simulate the ERC-20 calls. */
export const PUBLIC_RPC_URL_BY_CHAIN_ID: Readonly<Record<number, string>> =
  Object.freeze(
    Object.fromEntries(
      CHAIN_LIST.map((chain) => [chain.id, chain.publicRpcUrl]),
    ),
  );

export function getAlchemyNetwork(chainId: number) {
  return ALCHEMY_NETWORKS[chainId as AlchemySupportedChainId];
}

export function getPublicBundlerUrl(chainId: number) {
  return PUBLIC_BUNDLER_URL_BY_CHAIN_ID[chainId as AlchemySupportedChainId];
}

export function getPublicRpcUrl(chainId: number) {
  return PUBLIC_RPC_URL_BY_CHAIN_ID[chainId];
}
