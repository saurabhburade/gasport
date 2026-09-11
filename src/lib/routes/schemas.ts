import { type Address, type Hex, isAddress } from "viem";
import { z } from "zod";
import { ROUTE_PROVIDER_IDS } from "@/lib/routes/types";

const addressSchema = z
  .string()
  .refine(isAddress, "A valid EVM address is required.")
  .transform((value) => value as Address);
const integerAmountSchema = z
  .string()
  .regex(/^\d+$/, "Amount must use the token's smallest unit.")
  .refine((value) => BigInt(value) > 0n, "Amount must be greater than zero.");
const hexHashSchema = z
  .string()
  .regex(/^0x[\da-fA-F]{64}$/)
  .transform((value) => value as Hex);

export const routeAssetSchema = z
  .object({
    address: addressSchema,
    assetId: z.string().min(1),
    chainId: z.number().int().positive(),
    decimals: z.number().int().min(0).max(255),
    symbol: z.string().min(1).max(32),
  })
  .strict();

export const routeQuoteRequestSchema = z
  .object({
    account: addressSchema,
    amount: integerAmountSchema,
    deadline: z.string().datetime({ offset: true }),
    destinationAsset: routeAssetSchema,
    recipient: addressSchema,
    refundAddress: addressSchema,
    slippageBps: z.number().int().min(0).max(5_000),
    sponsorshipRequired: z.boolean(),
    sourceAsset: routeAssetSchema,
  })
  .strict();

export const routeQuoteApiRequestSchema = routeQuoteRequestSchema.extend({
  provider: z.enum([...ROUTE_PROVIDER_IDS, "auto"]).default("auto"),
});

export const routePrepareApiRequestSchema = routeQuoteRequestSchema.extend({
  provider: z.enum(ROUTE_PROVIDER_IDS),
});

export const routeSettlementSchema = z.discriminatedUnion("kind", [
  z
    .object({
      depositAddress: addressSchema,
      depositMemo: z.string().min(1).optional(),
      kind: z.literal("near-1click"),
      quoteId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      destinationChainId: z.number().int().positive(),
      kind: z.literal("lifi"),
      tool: z.string().min(1),
    })
    .strict(),
]);

export const routeStatusRequestSchema = z
  .object({
    provider: z.enum(ROUTE_PROVIDER_IDS),
    settlement: routeSettlementSchema,
    sourceTxHash: hexHashSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.provider !== value.settlement.kind) {
      context.addIssue({
        code: "custom",
        message: "The settlement does not match the selected provider.",
        path: ["settlement", "kind"],
      });
    }
  });
