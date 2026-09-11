import { z } from "zod";

export const integerAmountSchema = z
  .string()
  .regex(
    /^\d+$/,
    "Amount must be an integer string in the token's smallest unit.",
  );

const dateTimeSchema = z.string().datetime({ offset: true });

export const appFeeSchema = z
  .object({
    recipient: z.string().min(1),
    fee: z.number().finite().min(0),
    // Returned by the 1Click quote API for a regular application fee.
    limitOrderId: z.string().nullable().optional(),
  })
  .strict();

export const rebateSchema = z
  .object({
    recipient: z.string().min(1),
    share: z.number().finite().min(0).max(100),
  })
  .strict();

const quoteRequestFields = {
  dry: z.boolean(),
  swapType: z.enum(["EXACT_INPUT", "EXACT_OUTPUT", "FLEX_INPUT", "ANY_INPUT"]),
  slippageTolerance: z.number().finite().min(0),
  originAsset: z.string().min(1),
  depositType: z.enum(["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"]),
  destinationAsset: z.string().min(1),
  amount: integerAmountSchema,
  refundTo: z.string().min(1),
  refundType: z.enum(["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"]),
  recipient: z.string().min(1),
  recipientType: z.enum([
    "DESTINATION_CHAIN",
    "INTENTS",
    "CONFIDENTIAL_INTENTS",
  ]),
  deadline: dateTimeSchema,
  depositMode: z.enum(["SIMPLE", "MEMO"]).optional(),
  connectedWallets: z.array(z.string().min(1)).optional(),
  sessionId: z.string().min(1).optional(),
  virtualChainRecipient: z.string().min(1).nullish(),
  virtualChainRefundRecipient: z.string().min(1).nullish(),
  customRecipientMsg: z.string().min(1).optional(),
  confidentiality: z.enum(["public", "basic", "advanced"]).optional(),
  referral: z.string().min(1).nullish(),
  rebates: z.array(rebateSchema).optional(),
  quoteWaitingTimeMs: z.number().finite().min(0).optional(),
  appFees: z.array(appFeeSchema).optional(),
  insured: z.boolean().optional(),
} as const;

export const quoteRequestSchema = z.object(quoteRequestFields).strict();

export const mvpQuoteRequestSchema = z
  .object({
    dry: quoteRequestFields.dry,
    swapType: z.literal("EXACT_INPUT"),
    slippageTolerance: quoteRequestFields.slippageTolerance,
    originAsset: quoteRequestFields.originAsset,
    depositType: z.literal("ORIGIN_CHAIN"),
    destinationAsset: quoteRequestFields.destinationAsset,
    amount: quoteRequestFields.amount,
    refundTo: quoteRequestFields.refundTo,
    refundType: z.literal("ORIGIN_CHAIN"),
    recipient: quoteRequestFields.recipient,
    recipientType: z.literal("DESTINATION_CHAIN"),
    deadline: quoteRequestFields.deadline,
    depositMode: quoteRequestFields.depositMode,
  })
  .strict();

export const tokenResponseSchema = z
  .object({
    assetId: z.string().min(1),
    decimals: z.number().int().nonnegative(),
    blockchain: z.string().min(1),
    symbol: z.string().min(1),
    price: z.number().finite(),
    priceUpdatedAt: dateTimeSchema,
    contractAddress: z.string().min(1).nullable().optional(),
    coingeckoId: z.string().min(1).optional(),
  })
  .strict();

export const chainDepositAddressSchema = z
  .object({
    blockchain: z.string().min(1),
    address: z.string().min(1),
    memo: z.string().min(1).optional(),
  })
  .strict();

export const quoteSchema = z
  .object({
    depositAddress: z.string().min(1).optional(),
    depositMemo: z.string().min(1).optional(),
    chainDepositAddresses: z.array(chainDepositAddressSchema).optional(),
    amountIn: integerAmountSchema,
    amountInFormatted: z.string().min(1),
    amountInUsd: z.string().min(1),
    minAmountIn: integerAmountSchema,
    amountOut: integerAmountSchema,
    amountOutFormatted: z.string().min(1),
    amountOutUsd: z.string().min(1),
    minAmountOut: integerAmountSchema,
    deadline: dateTimeSchema.optional(),
    timeWhenInactive: dateTimeSchema.optional(),
    timeEstimate: z.number().finite().nonnegative().optional(),
    virtualChainRecipient: z.string().min(1).optional(),
    virtualChainRefundRecipient: z.string().min(1).optional(),
    customRecipientMsg: z.string().min(1).optional(),
    refundFee: integerAmountSchema.optional(),
    withdrawFee: integerAmountSchema.optional(),
  })
  .strict();

export const quoteResponseSchema = z
  .object({
    correlationId: z.string().min(1),
    timestamp: dateTimeSchema,
    signature: z.string().min(1),
    quoteRequest: quoteRequestSchema,
    quote: quoteSchema,
  })
  .strict();

export const transactionDetailsSchema = z
  .object({
    hash: z.string().min(1),
    // 1Click returns an empty string while an explorer URL is not available yet.
    explorerUrl: z.string(),
  })
  .strict();

const executionQuoteResponseSchema = quoteResponseSchema.extend({
  // Status responses can omit the nested ID; the top-level ID remains required.
  correlationId: z.string().min(1).optional(),
});

export const swapDetailsSchema = z
  .object({
    intentHashes: z.array(z.string().min(1)),
    nearTxHashes: z.array(z.string().min(1)),
    originChainTxHashes: z.array(transactionDetailsSchema),
    destinationChainTxHashes: z.array(transactionDetailsSchema),
    amountIn: integerAmountSchema.optional(),
    amountInFormatted: z.string().min(1).optional(),
    amountInUsd: z.string().min(1).optional(),
    amountOut: integerAmountSchema.optional(),
    amountOutFormatted: z.string().min(1).optional(),
    amountOutUsd: z.string().min(1).optional(),
    // Negative realized slippage represents price improvement.
    slippage: z.number().finite().optional(),
    refundedAmount: integerAmountSchema.optional(),
    refundedAmountFormatted: z.string().min(1).optional(),
    refundedAmountUsd: z.string().min(1).optional(),
    refundReason: z.string().min(1).nullish(),
    refundFee: integerAmountSchema.optional(),
    depositedAmount: integerAmountSchema.optional(),
    depositedAmountFormatted: z.string().min(1).optional(),
    depositedAmountUsd: z.string().min(1).optional(),
    withdrawFee: integerAmountSchema.optional(),
    referral: z.string().min(1).optional(),
  })
  .strict();

export const executionResponseSchema = z
  .object({
    correlationId: z.string().min(1),
    quoteResponse: executionQuoteResponseSchema,
    status: z.enum([
      "KNOWN_DEPOSIT_TX",
      "PENDING_DEPOSIT",
      "INCOMPLETE_DEPOSIT",
      "PROCESSING",
      "SUCCESS",
      "REFUNDED",
      "FAILED",
    ]),
    updatedAt: dateTimeSchema,
    swapDetails: swapDetailsSchema,
  })
  .strict();

export const transactionHistoryItemSchema = z
  .object({
    originAsset: z.string().min(1),
    destinationAsset: z.string().min(1),
    depositAddress: z.string().min(1),
    depositMemo: z.string().nullish(),
    recipient: z.string().min(1),
    status: z.enum([
      "SUCCESS",
      "FAILED",
      "INCOMPLETE_DEPOSIT",
      "PENDING_DEPOSIT",
      "PROCESSING",
      "REFUNDED",
    ]),
    createdAt: dateTimeSchema,
    amountInFormatted: z.string().min(1),
    amountInUsd: z.string().min(1),
    amountOutFormatted: z.string().min(1),
    amountOutUsd: z.string().min(1),
    intentHashes: z.string().min(1).nullish(),
    nearTxHashes: z.array(z.string().min(1)),
    originChainTxHashes: z.array(z.string().min(1)),
    destinationChainTxHashes: z.array(z.string().min(1)),
    senders: z.array(z.string().min(1)),
  })
  .passthrough();

export const transactionHistoryResponseSchema = z.array(
  transactionHistoryItemSchema,
);

export const submitDepositTxRequestSchema = z
  .object({
    txHash: z.string().min(1),
    depositAddress: z.string().min(1),
    nearSenderAccount: z.string().min(1).optional(),
    memo: z.string().min(1).optional(),
  })
  .strict();

export type MvpQuoteRequest = z.infer<typeof mvpQuoteRequestSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type NearQuoteResponse = z.infer<typeof quoteResponseSchema>;
export type NearExecutionResponse = z.infer<typeof executionResponseSchema>;
