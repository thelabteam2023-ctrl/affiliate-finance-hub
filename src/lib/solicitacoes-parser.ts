import type { SolicitacaoTipo } from '@/types/solicitacoes';

// ============================================================
// PARSER INTELIGENTE PARA CRIAÇÃO EM LOTE DE SOLICITAÇÕES
// Interpreta texto desestruturado com contexto semântico
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

// ---- Plataformas conhecidas ----

const KNOWN_PLATFORMS = [
  'betano', 'bet365', 'b365', '365', 'superbet', 'sportingbet',
  'betfair', 'pinnacle', 'pixbet', 'stake', 'novibet', 'betsson',
  'rivalo', 'parimatch', 'galera', 'galerabet', 'kto', 'f12',
  'f12bet', 'estrelabet', 'estrela', 'casa de apostas', 'casadeapostas',
  'mrjack', 'mr jack', 'betnacional', 'luabet', 'reals', 'realsbet',
  'brazino', 'brazino777', 'vaidebet', 'blaze', 'jonbet', 'br4bet',
  'segurobet', 'bateubet', 'mc games', 'mcgames',
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

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2) return true;
  return NOISE_PATTERNS.some((p) => p.test(trimmed));
}

// ---- Detecção de tipo ----

function detectTipo(text: string): SolicitacaoTipo | null {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const entry of TIPO_SYNONYMS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(normalized)) return entry.tipo;
    }
  }
  return null;
}

// ---- Verificar se uma linha é APENAS um contexto (tipo isolado) ----

function isContextOnlyLine(line: string): boolean {
  // Lines like "Facial", "Dep", "SMS", "Saque" alone → context setters
  const clean = line.replace(/[✅❌🟢🟡🔴]/g, '').trim();
  // If after removing the type keyword, nothing meaningful remains
  const tipo = detectTipo(clean);
  if (!tipo) return false;
  // Remove the matched keyword and see if anything substantive remains
  const withoutType = removeTypeKeywords(clean);
  // If only whitespace/punctuation remains → context-only
  return withoutType.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').length < 2;
}

function removeTypeKeywords(text: string): string {
  let result = text;
  const keywords = [
    'dep', 'deposito', 'depósito', 'depositar', 'crédito', 'creditar', 'credito',
    'saque', 'saq', 'sacar', 'retirada', 'withdraw',
    'kyc', 'facial', 'selfie', 'documento', 'cpf', 'identidade',
    'verificar conta', 'verificação de conta', 'verificacao de conta',
    'sms', 'código', 'codigo', 'otp', 'e-mail',
    'verificação celular', 'verificacao celular', 'verificação sms', 'verificacao sms',
    'verificação email', 'verificacao email',
    'criar conta', 'abrir conta', 'cadastro', 'abertura', 'nova conta',
    'parceria', 'afiliado', 'contato',
  ];
  for (const kw of keywords) {
    result = result.replace(new RegExp(`\\b${kw}\\b`, 'gi'), '');
  }
  return result.trim();
}

// ---- Extrair plataforma ----

function extractPlatform(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const p of KNOWN_PLATFORMS) {
    const regex = new RegExp(`\\b${p}\\b`, 'i');
    if (regex.test(lower)) {
      // Return with original casing from known list (capitalize first letter)
      return p.charAt(0).toUpperCase() + p.slice(1);
    }
  }
  return undefined;
}

// ---- Extrair valor numérico ----

function extractValor(text: string): number | undefined {
  // Match patterns like: 900, 1.500, 1500,00, R$ 900
  const matches = text.match(/(?:R\$\s*)?(\d[\d.,]*)/g);
  if (!matches) return undefined;

  for (const m of matches) {
    const numStr = m.replace(/R\$\s*/, '');
    // Skip if it looks like a platform name number (e.g., "365" in "bet365")
    const idx = text.indexOf(m);
    const before = text.slice(Math.max(0, idx - 10), idx).toLowerCase();
    if (/bet|b$/.test(before.trim()) && numStr === '365') continue;

    const parsed = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0 && parsed !== 365) return parsed;
  }
  return undefined;
}

// ---- Extrair nome (titular/destinatário) ----

function extractName(text: string, platform?: string): string | undefined {
  let clean = text;

  // Remove emojis
  clean = clean.replace(/[✅❌🟢🟡🔴]/g, '');

  // Remove type keywords
  clean = removeTypeKeywords(clean);

  // Remove platform
  if (platform) {
    clean = clean.replace(new RegExp(`\\b${platform}\\b`, 'gi'), '');
  }

  // Remove numeric values and R$
  clean = clean.replace(/R\$\s*\d[\d.,]*/g, '');
  clean = clean.replace(/\b\d[\d.,]*\b/g, '');

  // Remove common filler words
  clean = clean.replace(/\b(para|pra|pro|da|do|de|bolsa|conta|na|no|em)\b/gi, '');

  // Trim and clean
  clean = clean.replace(/\s+/g, ' ').trim();

  // If something remains and looks like a name (starts with uppercase or is a word)
  if (clean.length >= 2) {
    // Capitalize first letter of each word
    return clean
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  return undefined;
}

// ============================================================
// PARSER PRINCIPAL — com detecção de blocos semânticos
// ============================================================

export function parseBatchText(text: string): ParsedItem[] {
  const lines = text.split('\n').map((l) => l.trim());
  const results: ParsedItem[] = [];
  let currentContext: SolicitacaoTipo | null = null;
  let itemIndex = 0;

  for (const line of lines) {
    if (!line || isNoiseLine(line)) continue;

    // 1) Check if this line is a context-setter (type keyword alone)
    if (isContextOnlyLine(line)) {
      currentContext = detectTipo(line);
      continue; // Don't create an item for context-only lines
    }

    // 2) Detect type from this line, or inherit from context
    const lineTipo = detectTipo(line);
    const tipo: SolicitacaoTipo = lineTipo ?? currentContext ?? 'outros';

    // If this line has a type, it also becomes the new context
    if (lineTipo) {
      currentContext = lineTipo;
    }

    // 3) Extract entities
    const bookmaker = extractPlatform(line);
    const valor = extractValor(line);
    const titular = extractName(line, bookmaker);

    // 4) Determine completeness
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
    });
  }

  return results;
}
