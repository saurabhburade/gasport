export function QuoteDetail({
  detail,
  inlineDetail = false,
  label,
  value,
}: {
  detail?: string;
  inlineDetail?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-xs tabular-nums">
        {inlineDetail ? (
          <>
            <span className="text-foreground">{value}</span>
            {detail && (
              <span className="ml-2 text-muted-foreground">{detail}</span>
            )}
          </>
        ) : (
          <>
            <span className="block text-foreground">{value}</span>
            {detail && (
              <span className="block text-muted-foreground">{detail}</span>
            )}
          </>
        )}
      </span>
    </div>
  );
}
