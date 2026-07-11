
export interface WalletIdentifier {
  label?: string | null;
  nickname?: string | null;
  identificacao_wallet?: string | null;
  exchange?: string | null;
  exchangeWallet?: string | null;
  name?: string | null;
}

/**
 * Returns the best display name for a wallet based on priority rules.
 * Priority: nickname/identificacao_wallet/label > exchangeWallet/exchange/name
 */
export const getWalletDisplayName = (wallet: WalletIdentifier): string => {
  const name = 
    wallet.nickname?.trim() || 
    wallet.identificacao_wallet?.trim() || 
    wallet.label?.trim() || 
    wallet.exchangeWallet?.trim() || 
    wallet.exchange?.trim() || 
    wallet.name?.trim() ||
    'Wallet sem identificação';
  
  return name;
};

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

/**
 * Compact one-line label for wallet selects: "APELIDO • 0xabc...def".
 * Falls back to exchange/network when no nickname is set.
 */
export const getWalletShortDisplay = (
  wallet: WalletIdentifier & { endereco?: string | null; exchange?: string | null; network?: string | null },
): string => {
  const name =
    wallet.nickname?.trim() ||
    wallet.identificacao_wallet?.trim() ||
    wallet.label?.trim() ||
    wallet.exchangeWallet?.trim() ||
    wallet.exchange?.trim() ||
    wallet.name?.trim() ||
    wallet.network?.trim() ||
    "Wallet";
  const addr = wallet.endereco ? truncateAddress(wallet.endereco, 6, 4) : "";
  return addr ? `${name} • ${addr}` : name;
};