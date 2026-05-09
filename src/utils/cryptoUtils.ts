/**
 * Truncates a crypto address to show the beginning and the end.
 * Example: 0xB718Af...F3A2
 */
export const truncateAddress = (address: string, charsStart = 6, charsEnd = 4): string => {
  if (!address) return "";
  if (address.length <= charsStart + charsEnd + 3) return address;
  return `${address.slice(0, charsStart)}...${address.slice(-charsEnd)}`;
};

/**
 * Formats a network name for display.
 */
export const formatNetworkName = (network: string | null | undefined): string => {
  if (!network) return "";
  // Standardize some common names
  const upper = network.toUpperCase();
  if (upper.includes("ERC20") || upper === "ETH" || upper === "ETHEREUM") return "Ethereum (ERC20)";
  if (upper.includes("TRC20") || upper === "TRX" || upper === "TRON") return "Tron (TRC20)";
  if (upper.includes("BEP20") || upper === "BSC" || upper === "BINANCE") return "BNB Chain (BEP20)";
  if (upper.includes("SOL") || upper === "SOLANA") return "Solana";
  if (upper.includes("POLYGON") || upper === "MATIC") return "Polygon";
  
  return network;
};