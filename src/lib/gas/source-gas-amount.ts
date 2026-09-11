export function calculateNetRouteAmount({
  grossAmount,
  sponsorshipFee,
}: {
  grossAmount: bigint;
  sponsorshipFee: bigint;
}) {
  if (grossAmount <= 0n || sponsorshipFee < 0n) {
    throw new Error("The source amount or sponsorship fee is invalid.");
  }
  const routeAmount = grossAmount - sponsorshipFee;
  if (routeAmount <= 0n) {
    throw new Error("The source amount must exceed the sponsorship fee.");
  }
  return routeAmount;
}
