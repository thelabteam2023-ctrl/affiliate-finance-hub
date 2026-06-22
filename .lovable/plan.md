
# Plano: auditar "Fundos fora de projetos" no seu workspace

Sua desconfiança faz sentido — se você **sabe** que tem caixa cripto + saldos em bancos de parceiros, o número de "Fundos fora de projetos" deveria refletir isso. Se ele está pequeno, **uma destas três coisas está acontecendo** (e o plano abaixo descobre qual):

1. **Esses saldos JÁ estão atribuídos a algum projeto** → entram no Resultado Teórico, não no resíduo.
2. **A engine canônica está contando-os indevidamente** dentro do Teórico (atribuição errada via `projeto_id_snapshot`).
3. **Há sinal cruzado** (parte positiva órfã anulando parte negativa) que mascara o valor real.

---

## O plano (só leitura, sem alterar nada)

### Passo 1 — Confirmar workspace
Tenho acesso a 5 workspaces no seu projeto. Preciso que você me diga **qual é o seu** (ou eu rodo para o que aparece como ativo na sua sessão):
- LABBET ONE
- LABBET CONSULTORIA
- LF & DUDA
- LABBET
- BROKER 🫱🏻‍🫲🏽 TH

### Passo 2 — Reconstruir o número parcela por parcela
Rodo **5 consultas read-only** e te entrego uma tabela única no chat:

| Bloco | O que mostra |
|---|---|
| **A. Patrimônio decomposto** | Caixa fiat / Caixa crypto / Bookmakers / Contas parceiros / Wallets parceiros — cada um em BRL |
| **B. Capital próprio** | Aportes − Liquidações (acumulado) |
| **C. Resultado Teórico por projeto** | Lista cada projeto ativo com seu Lucro Operacional canônico |
| **D. Saldos órfãos** | Bookmakers sem `projeto_id` com saldo > 0 + Contas/Wallets de parceiros não-caixa + Bookmakers de projetos arquivados |
| **E. Reconciliação final** | `Patrimônio − Capital Próprio − Teórico = Fundos fora` vs. `Σ(saldos órfãos do bloco D)` — a diferença entre os dois é o "ruído contábil" (câmbio, eventos sem projeto) |

### Passo 3 — Diagnóstico
Com os blocos D e E lado a lado, dá pra responder objetivamente:
- Se **D ≈ E** → o número está correto, e o que você vê na tela reflete fielmente os saldos órfãos.
- Se **D >> E** → tem saldo "fora de projeto" sendo somado dentro do Teórico (atribuição errada de projeto em alguma bookmaker/conta).
- Se **D << E** → tem ruído cambial ou eventos de ledger sem `projeto_id_snapshot` inflando o resíduo.

### Passo 4 — Recomendação
Te entrego, **sem implementar**, uma das três trilhas:
- **Cosmético** — renomear a linha pra "Capital não atribuído a projeto" e ajustar tooltip pra refletir o que de fato compõe.
- **UX** — tornar a linha clicável abrindo drawer com os mesmos blocos D acima.
- **Correção de dados** — se houver atribuição errada de `projeto_id`, eu listo as linhas exatas e proponho o ajuste (você aprova caso a caso).

---

## Consultas que vou rodar (transparência total)

```sql
-- A. Patrimônio decomposto
SELECT 'caixa_fiat'   AS bucket, c.moeda, SUM(c.saldo) FROM v_saldo_parceiro_contas c
  JOIN parceiros p ON p.id = c.parceiro_id
  WHERE c.workspace_id = $1 AND p.is_caixa_operacional GROUP BY 2
UNION ALL
SELECT 'caixa_crypto', w.coin, SUM(w.saldo_usd) FROM v_saldo_parceiro_wallets w
  JOIN parceiros p ON p.id = w.parceiro_id
  WHERE w.workspace_id = $1 AND p.is_caixa_operacional GROUP BY 2
UNION ALL
SELECT 'bookmakers', moeda, SUM(saldo_atual) FROM bookmakers
  WHERE workspace_id = $1 AND status IN ('ativo','ATIVO','EM_USO','limitada','LIMITADA','AGUARDANDO_SAQUE')
  GROUP BY 2
UNION ALL
SELECT 'contas_parceiros_nao_caixa', c.moeda, SUM(c.saldo)
  FROM v_saldo_parceiro_contas c JOIN parceiros p ON p.id = c.parceiro_id
  WHERE c.workspace_id = $1 AND NOT p.is_caixa_operacional GROUP BY 2
UNION ALL
SELECT 'wallets_parceiros_nao_caixa', w.coin, SUM(w.saldo_usd)
  FROM v_saldo_parceiro_wallets w JOIN parceiros p ON p.id = w.parceiro_id
  WHERE w.workspace_id = $1 AND NOT p.is_caixa_operacional GROUP BY 2;

-- D. Saldos órfãos (o "deveria ser" o número)
-- D1
SELECT 'bk_sem_projeto' AS fonte, nome, moeda, saldo_atual
  FROM bookmakers WHERE workspace_id = $1 AND projeto_id IS NULL AND saldo_atual > 0;
-- D2
SELECT 'bk_projeto_arquivado', p.nome, b.moeda, b.saldo_atual
  FROM bookmakers b JOIN projetos p ON p.id = b.projeto_id
  WHERE b.workspace_id = $1 AND p.status = 'ARQUIVADO' AND b.saldo_atual > 0;
-- D3
SELECT 'parceiro_nao_caixa', p.nome, c.moeda, SUM(c.saldo)
  FROM v_saldo_parceiro_contas c JOIN parceiros p ON p.id = c.parceiro_id
  WHERE c.workspace_id = $1 AND NOT p.is_caixa_operacional GROUP BY 1,2,3 HAVING SUM(c.saldo)>0;
```

---

## Decisão necessária de você

Me diga **qual workspace** (dos 5 listados) e eu rodo agora e devolvo a tabela completa com a reconciliação. Não vou mexer em nenhum dado.
