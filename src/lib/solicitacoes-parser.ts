import type { SolicitacaoTipo } from '@/types/solicitacoes';

// ============================================================
// PARSER INTELIGENTE PARA CRIAÇÃO EM LOTE DE SOLICITAÇÕES
// v2 — Fuzzy matching, contexto persistente, multi-line, NLP
// ============================================================

export interface ParsedItem {
  id: string;
  tipo: SolicitacaoTipo;
  descricao: string;
  titular?: string;
  bookmaker?: string;
  valor?: number;
  incompleto: boolean;
  selecionado: boolean;
  confidence: number; // 0-1
}

// ---- Dicionário de sinônimos → tipo ----

const TIPO_SYNONYMS: { tipo: SolicitacaoTipo; patterns: RegExp[] }[] = [
  {
    tipo: 'deposito',
    patterns: [
      /^dep\b/i, /\bdeposito\b/i, /\bdepósito\b/i, /\bdepositar\b/i,
      /\bcredito\b/i, /\bcreditar\b/i, /\bcrédito\b/i,
    ],
  },
  {
    tipo: 'saque',
    patterns: [
      /^saque\b/i, /^saq\b/i, /\bsacar\b/i, /\bretirada\b/i, /\bwithdraw\b/i,
    ],
  },
  {
    tipo: 'verificacao_kyc',
    patterns: [
      /\bkyc\b/i, /\bfacial\b/i, /\bselfie\b/i, /\bdocumento\b/i,
      /\bcpf\b/i, /\bidentidade\b/i, /\bverificar conta\b/i,
      /\bverificação de conta\b/i, /\bverificacao de conta\b/i,
      /\bverifica[çc][aã]o\b/i, /\bverificar\b/i,
      /\bfazer verifica/i, /\benviar documento/i,
    ],
  },
  {
    tipo: 'verificacao_sms_email',
    patterns: [
      /^sms\b/i, /\bcódigo\b/i, /\bcodigo\b/i, /\botp\b/i,
      /\be-mail\b/i, /\bverificação celular\b/i, /\bverificacao celular\b/i,
      /\bverificação sms\b/i, /\bverificacao sms\b/i,
      /\bverificação email\b/i, /\bverificacao email\b/i,
    ],
  },
  {
    tipo: 'abertura_conta',
    patterns: [
      /\bcriar conta\b/i, /\babrir conta\b/i, /\bcadastro\b/i,
      /\babertura\b/i, /\bnova conta\b/i,
    ],
  },
  {
    tipo: 'contato_parceria',
    patterns: [
      /\bparceria\b/i, /\bafiliado\b/i, /\bcontato\b/i,
    ],
  },
];

// ---- Plataformas conhecidas (canonical names + aliases) ----

const PLATFORM_ALIASES: { canonical: string; aliases: string[] }[] = [
  { canonical: 'Betano', aliases: ['betano', 'betao'] },
  { canonical: 'Bet365', aliases: ['bet365', 'b365', '365'] },
  { canonical: 'Superbet', aliases: ['superbet', 'super bet'] },
  { canonical: 'Sportingbet', aliases: ['sportingbet', 'sporting bet', 'sporting'] },
  { canonical: 'Betfair', aliases: ['betfair', 'bet fair'] },
  { canonical: 'Pinnacle', aliases: ['pinnacle'] },
  { canonical: 'Pixbet', aliases: ['pixbet', 'pix bet'] },
  { canonical: 'Stake', aliases: ['stake'] },
  { canonical: 'Novibet', aliases: ['novibet', 'novi bet'] },
  { canonical: 'Betsson', aliases: ['betsson'] },
  { canonical: 'Rivalo', aliases: ['rivalo'] },
  { canonical: 'Parimatch', aliases: ['parimatch', 'pari match'] },
  { canonical: 'Galera', aliases: ['galera', 'galerabet', 'galera bet'] },
  { canonical: 'KTO', aliases: ['kto'] },
  { canonical: 'F12', aliases: ['f12', 'f12bet', 'f12 bet'] },
  { canonical: 'Estrelabet', aliases: ['estrelabet', 'estrela bet', 'estrela'] },
  { canonical: 'Casa de Apostas', aliases: ['casa de apostas', 'casadeapostas'] },
  { canonical: 'Mr Jack', aliases: ['mrjack', 'mr jack', 'mr. jack'] },
  { canonical: 'Betnacional', aliases: ['betnacional', 'bet nacional'] },
  { canonical: 'Luabet', aliases: ['luabet', 'lua bet'] },
  { canonical: 'Realsbet', aliases: ['reals', 'realsbet', 'reals bet'] },
  { canonical: 'Brazino777', aliases: ['brazino', 'brazino777'] },
  { canonical: 'Vaidebet', aliases: ['vaidebet', 'vai de bet'] },
  { canonical: 'Blaze', aliases: ['blaze'] },
  { canonical: 'Jonbet', aliases: ['jonbet', 'jon bet'] },
  { canonical: 'Br4bet', aliases: ['br4bet', 'br4 bet'] },
  { canonical: 'Segurobet', aliases: ['segurobet', 'seguro bet'] },
  { canonical: 'Bateubet', aliases: ['bateubet', 'bateu bet'] },
  { canonical: 'MC Games', aliases: ['mc games', 'mcgames'] },
  { canonical: 'Jogo de Ouro', aliases: ['jogo de ouro', 'jogo ouro', 'jogodeouro'] },
  { canonical: 'Betboo', aliases: ['betboo', 'bet boo'] },
  { canonical: 'Betsul', aliases: ['betsul', 'bet sul'] },
  { canonical: 'Betmotion', aliases: ['betmotion', 'bet motion'] },
  { canonical: 'H2bet', aliases: ['h2bet', 'h2 bet'] },
  { canonical: 'Esportes da Sorte', aliases: ['esportes da sorte', 'esportesdasorte'] },
  { canonical: 'Bet7k', aliases: ['bet7k', 'bet 7k'] },
  { canonical: 'Aposta Ganha', aliases: ['aposta ganha', 'apostaganha'] },
];

// ---- Linhas irrelevantes (conversacionais) ----

const NOISE_PATTERNS = [
  /^(bom dia|boa tarde|boa noite|oi|olá|ola|hey|e ai|eai|fala|tranquilo|tudo bem|blz|beleza|ok|obrigado|obrigada|valeu|vlw|tmj|show)\b/i,
  /^\?+$/,
  /^\.+$/,
  /^-+$/,
  /^✅+$/,
  /^❌+$/,
];

// ---- Helpers ----

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2) return true;
  return NOISE_PATTERNS.some((p) => p.test(trimmed));
}

// ---- Levenshtein distance for fuzzy matching ----

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ---- Detecção de tipo ----

function detectTipo(text: string): SolicitacaoTipo | null {
  const norm = normalize(text);
  // Check sms/email BEFORE generic verificação to avoid misclassification
  for (const entry of TIPO_SYNONYMS) {
    if (entry.tipo === 'verificacao_kyc') continue; // check last
    for (const pattern of entry.patterns) {
      if (pattern.test(text) || pattern.test(norm)) return entry.tipo;
    }
  }
  // Now check verificacao_kyc (generic "verificação" falls here)
  const kycEntry = TIPO_SYNONYMS.find((e) => e.tipo === 'verificacao_kyc');
  if (kycEntry) {
    for (const pattern of kycEntry.patterns) {
      if (pattern.test(text) || pattern.test(norm)) return 'verificacao_kyc';
    }
  }
  return null;
}

// ---- Check if line is context-only (action header) ----

function isContextOnlyLine(line: string): boolean {
  const clean = line.replace(/[✅❌🟢🟡🔴:]/g, '').trim();
  const tipo = detectTipo(clean);
  if (!tipo) return false;
  const withoutType = removeTypeKeywords(clean);
  // Also remove common prefixes like "Fazer", "Realizar"
  const withoutVerbs = withoutType
    .replace(/\b(fazer|realizar|executar|iniciar|pedir|solicitar)\b/gi, '')
    .trim();
  return withoutVerbs.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').length < 2;
}

const TYPE_KEYWORDS = [
  'dep', 'deposito', 'depósito', 'depositar', 'crédito', 'creditar', 'credito',
  'saque', 'saq', 'sacar', 'retirada', 'withdraw',
  'kyc', 'facial', 'selfie', 'documento', 'cpf', 'identidade',
  'verificar conta', 'verificação de conta', 'verificacao de conta',
  'verificação', 'verificacao', 'verificar',
  'sms', 'código', 'codigo', 'otp', 'e-mail',
  'verificação celular', 'verificacao celular', 'verificação sms', 'verificacao sms',
  'verificação email', 'verificacao email',
  'criar conta', 'abrir conta', 'cadastro', 'abertura', 'nova conta',
  'parceria', 'afiliado', 'contato',
  'fazer', 'realizar', 'executar', 'iniciar', 'pedir', 'solicitar',
];

function removeTypeKeywords(text: string): string {
  let result = text;
  // Sort by length desc so longer phrases match first
  const sorted = [...TYPE_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    result = result.replace(new RegExp(`\\b${kw}\\b`, 'gi'), '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

// ---- Extrair plataforma (fuzzy) ----

function extractPlatformFuzzy(text: string): { canonical: string; matched: string } | undefined {
  const norm = normalize(text);

  // 1) Exact / substring match on aliases
  for (const p of PLATFORM_ALIASES) {
    for (const alias of p.aliases) {
      const aliasNorm = normalize(alias);
      // Try word-boundary or substring
      if (norm.includes(aliasNorm)) {
        return { canonical: p.canonical, matched: alias };
      }
    }
  }

  // 2) Fuzzy match — try each word/bigram against aliases
  const words = norm.split(/\s+/);
  let bestScore = 0;
  let bestMatch: { canonical: string; matched: string } | undefined;

  for (const p of PLATFORM_ALIASES) {
    for (const alias of p.aliases) {
      const aliasNorm = normalize(alias);
      const aliasWords = aliasNorm.split(/\s+/);

      // Single-word alias: compare against each word
      if (aliasWords.length === 1) {
        for (const word of words) {
          if (word.length < 3) continue;
          const sim = similarity(word, aliasNorm);
          if (sim > 0.75 && sim > bestScore) {
            bestScore = sim;
            bestMatch = { canonical: p.canonical, matched: alias };
          }
        }
      } else {
        // Multi-word alias: try sliding window
        for (let i = 0; i <= words.length - aliasWords.length; i++) {
          const window = words.slice(i, i + aliasWords.length).join(' ');
          const sim = similarity(window, aliasNorm);
          if (sim > 0.75 && sim > bestScore) {
            bestScore = sim;
            bestMatch = { canonical: p.canonical, matched: alias };
          }
        }
      }
    }
  }

  return bestMatch;
}

// ---- Extrair valor numérico ----

function extractValor(text: string): number | undefined {
  // Match "1060k" → 1060000, "500k" → 500000
  const kMatch = text.match(/(\d[\d.,]*)\s*k\b/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(num) && num > 0) return num * 1000;
  }

  const matches = text.match(/(?:R\$\s*)?(\d[\d.,]*)/g);
  if (!matches) return undefined;

  for (const m of matches) {
    const numStr = m.replace(/R\$\s*/, '');
    const idx = text.indexOf(m);
    const before = text.slice(Math.max(0, idx - 10), idx).toLowerCase();
    if (/bet|b$/.test(before.trim()) && numStr === '365') continue;
    if (/7$/.test(before.trim()) && numStr === '77') continue; // brazino777

    const parsed = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0 && parsed !== 365 && parsed !== 777) return parsed;
  }
  return undefined;
}

// ---- Extrair nome (titular/destinatário) ----

function extractName(text: string, platform?: string): string | undefined {
  let clean = text;
  clean = clean.replace(/[✅❌🟢🟡🔴:]/g, '');
  clean = removeTypeKeywords(clean);

  if (platform) {
    // Remove all known aliases for this platform
    const entry = PLATFORM_ALIASES.find((p) => p.canonical === platform);
    if (entry) {
      for (const alias of entry.aliases) {
        clean = clean.replace(new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`, 'gi'), '');
      }
    }
    clean = clean.replace(new RegExp(`\\b${platform.replace(/\s+/g, '\\s+')}\\b`, 'gi'), '');
  }

  // Remove numeric values, R$, and "k" suffix
  clean = clean.replace(/R\$\s*\d[\d.,]*/g, '');
  clean = clean.replace(/\b\d[\d.,]*k?\b/gi, '');

  // Remove common filler words
  clean = clean.replace(/\b(para|pra|pro|da|do|de|bolsa|conta|na|no|em|a|o|ganhar|freebet|free\s*bet|válida|valida|até|ate|quarta|feira)\b/gi, '');

  clean = clean.replace(/\s+/g, ' ').trim();

  if (clean.length >= 2) {
    return clean
      .split(' ')
      .filter((w) => w.length > 0)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return undefined;
}

// ---- Check if a line is a continuation/description ----

function isContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  // Starts with common continuation patterns
  if (/^(para |pra |válida|valida|até |ate |obs:|observação|nota:|—|–|\*)/i.test(trimmed)) return true;
  // No bookmaker or type detected, and starts lowercase
  if (trimmed[0] && trimmed[0] === trimmed[0].toLowerCase() && /^[a-zà-ÿ]/.test(trimmed)) {
    const hasPlatform = extractPlatformFuzzy(trimmed);
    const hasTipo = detectTipo(trimmed);
    if (!hasPlatform && !hasTipo) return true;
  }
  return false;
}

// ============================================================
// PARSER PRINCIPAL — v2 com contexto, fuzzy, multi-line
// ============================================================

export function parseBatchText(text: string): ParsedItem[] {
  const lines = text.split('\n').map((l) => l.trim());
  const results: ParsedItem[] = [];
  let currentContext: SolicitacaoTipo | null = null;
  let itemIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || isNoiseLine(line)) continue;

    // 1) Context-only line (e.g. "Facial", "Fazer verificação", "Depósito:")
    if (isContextOnlyLine(line)) {
      currentContext = detectTipo(line);
      continue;
    }

    // 2) Check if this is a continuation of the previous item
    if (results.length > 0 && isContinuationLine(line)) {
      const last = results[results.length - 1];
      last.descricao = `${last.descricao}\n${line}`;
      continue;
    }

    // 3) Detect type from this line, or inherit from context
    const lineTipo = detectTipo(line);
    const tipo: SolicitacaoTipo = lineTipo ?? currentContext ?? 'outros';

    // If this line explicitly defines a type, update context
    if (lineTipo) {
      currentContext = lineTipo;
    }

    // 4) Extract entities
    const platformMatch = extractPlatformFuzzy(line);
    const bookmaker = platformMatch?.canonical;
    const valor = extractValor(line);
    const titular = extractName(line, bookmaker);

    // 5) Calculate confidence
    let confidence = 0.5;
    if (tipo !== 'outros') confidence += 0.2;
    if (bookmaker) confidence += 0.15;
    if (titular) confidence += 0.1;
    if (valor != null) confidence += 0.05;
    confidence = Math.min(confidence, 1);

    // 6) Determine completeness
    const incompleto = tipo === 'outros' && !valor && !bookmaker;

    results.push({
      id: `${Date.now()}-${itemIndex++}`,
      tipo,
      descricao: line,
      bookmaker,
      titular,
      valor,
      incompleto,
      selecionado: true,
      confidence,
    });
  }

  return results;
}
