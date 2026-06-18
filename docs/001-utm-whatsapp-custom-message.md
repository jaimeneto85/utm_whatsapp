# [001] - UTM_Whatsapp: Mensagem Personalizada

## Contexto
O template GTM "UTM_Whatsapp" injeta `https://singularidata.com/static/utm_whatsapp.js` para decorar links de WhatsApp da página com o `client_id` do GA4. Faltava (a) o próprio `utm_whatsapp.js` no repositório e (b) a capacidade de prefixar uma mensagem personalizada, configurável no GTM, no texto pré-preenchido do WhatsApp.

## Escopo

### Incluído
- Criação de `utm_whatsapp.js` (JS de browser puro, sem npm/build) na raiz.
- Novo parâmetro `CUSTOM_MESSAGE` no `template.tpl`, passado como `&msg=` na URL injetada.
- Testes das funções puras do script.

### Excluído
- Hospedagem/deploy de `utm_whatsapp.js` em `singularidata.com/static/` (infra).
- Fluxo de obtenção do `client_id` (GA4) — inalterado.
- Build system / test runner GTM (inexistentes no projeto).

## Solução Implementada

### Arquitetura
- `utm_whatsapp.js`: IIFE com `'use strict'`, try/catch global e guard `window.__utmwa_initialized`.
- Funções puras (`parseQuery`, `composeText`, `rewriteHref`, `parseScriptSrc`) separadas da manipulação do DOM e exportadas em Node via guard `typeof module !== 'undefined'`.
- Parâmetros lidos do próprio `<script>` via `querySelectorAll('script[src*="utm_whatsapp.js"]')` (último match), com fallback `document.currentScript`.
- Texto final: `msg` (começo) + texto existente (meio) + ` (ID: <clientId>)` (fim), via `[msg, middle, suffix].filter(Boolean).join(' ')`.
- Idempotência em três camadas: atributo `data-utmwa` (defesa primária, setado antes do `href`, evita loop do observer), remoção literal do sufixo e remoção do prefixo `msg` com word-boundary.
- `rewriteHref` cobre `wa.me/<phone>` (com/sem `?text`), `web.whatsapp.com/send?phone=&text=`, fragmento `#` separado/re-anexado, sem `?` espúrio; substitui apenas a última ocorrência de `text`; re-encode com `encodeURIComponent`.
- `MutationObserver` com `{ childList: true, subtree: true }` (sem `attributes`), processando apenas `addedNodes` com links de WhatsApp, debounce ~100ms; degrada com segurança se não suportado.
- `template.tpl`: param `CUSTOM_MESSAGE` (`defaultValue: ""`, backward-compatible) e append de `&msg=` com `encodeUriComponent(data.CUSTOM_MESSAGE || '')`. Também corrigido bug pré-existente que invocava `gtmOnSuccess()/gtmOnFailure()` em vez de passá-los como referências ao `injectScript`.

### Arquivos Modificados
| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `utm_whatsapp.js` | Criado |
| `tests/utm_whatsapp.test.js` | Criado |
| `template.tpl` | Modificado |

## Testes
| Métrica | Valor |
|---------|-------|
| Testes Unitários | 44 |
| Passando | 44 |
| Runner | `node tests/utm_whatsapp.test.js` (zero deps) |
| Cobertura | CA01–CA08, EC03/EC04/EC07 e as 5 formas de URL |

## Verificação de Qualidade
| Critério | Status |
|----------|--------|
| Build (tests como gate) | ✅ |
| Conformidade de Escopo | ✅ |
| Testes | ✅ |
| Performance (observer só em addedNodes) | ✅ |
| Segurança (escrita em `href`, não innerHTML) | ✅ |
| Permissões GTM (`/static/*` inalterada) | ✅ |

### Limitações Conhecidas
- Links dentro de Shadow DOM não são percorridos.
- Redirect-wrappers (`l.facebook.com/l.php?u=`) não são desembrulhados.
- `CUSTOM_MESSAGE` deve conter texto literal (não pré-encodado).
- (Pré-existente, fora de escopo) `gtag('get', ...)` sem timeout pode deixar a tag pendente se o `client_id` nunca resolver.

---
**Verificado por:** Workflow Orchestrator
**Data:** 2026-06-18
**Status Final:** ✅ APROVADO PARA PRODUÇÃO
