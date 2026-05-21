export function formatEconomyTransactionLabel(type: string): string {
  switch (type) {
    case "TOURNAMENT_ENTRY":
      return "Tournament entry";
    case "TOURNAMENT_PAYOUT":
      return "Tournament payout";
    case "TOURNAMENT_SEAT":
      return "Tournament seat";
    case "TOURNAMENT_BUST":
      return "Tournament bust";
    case "REFUND":
      return "Refund";
    case "DEPOSIT":
      return "Deposit";
    case "BUY_IN":
      return "Buy-in";
    case "CASH_OUT":
      return "Cash out";
    default:
      return type.replace(/_/g, " ").toLowerCase();
  }
}
