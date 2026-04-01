/**
 * Mapeamento de compatibilidade entre moedas crypto e redes.
 * Usado para filtrar wallets elegíveis por coin selecionada.
 */

const NETWORK_KEYWORDS_BY_COIN: Record<string, string[]> = {
  BTC:  ['BTC', 'Bitcoin'],
  ETH:  ['ERC20', 'Ethereum'],
  USDT: ['ERC20', 'Ethereum', 'TRC20', 'Tron', 'BEP20', 'BNB'],
  USDC: ['ERC20', 'Ethereum', 'TRC20', 'Tron', 'BEP20', 'BNB'],
  LTC:  ['LTC', 'Litecoin'],
  BNB:  ['BEP20', 'BNB'],
};

/**
 * Verifica se uma wallet com determinada `network` é compatível com a `coin` selecionada.
 * Retorna false se a wallet não tem network ou se a rede é incompatível.
 */
export function isWalletNetworkCompatible(network: string | null | undefined, coin: string): boolean {
  if (!network || !coin) return false;

  const allowedKeywords = NETWORK_KEYWORDS_BY_COIN[coin.toUpperCase()];

  // Se a moeda não está no mapa, fallback: aceita qualquer rede
  if (!allowedKeywords) return true;

  const networkUpper = network.toUpperCase();
  return allowedKeywords.some(kw => networkUpper.includes(kw.toUpperCase()));
}

/**
 * Filtro completo: verifica se a wallet suporta a coin E se a rede é compatível.
 */
export function isWalletCompatibleWithCoin(
  wallet: { moeda?: string[] | null; network?: string | null },
  coin: string
): boolean {
  if (!coin) return false;
  const hasCoin = Array.isArray(wallet.moeda) && wallet.moeda.includes(coin);
  if (!hasCoin) return false;
  return isWalletNetworkCompatible(wallet.network, coin);
}
