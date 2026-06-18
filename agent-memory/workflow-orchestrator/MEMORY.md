# Agent Memory — workflow-orchestrator

## Padrões do Projeto
- Repo é um GTM Custom Template. Arquivo central: `template.tpl` (seções `___SECTION___`).
- Sandbox JS do template usa APIs só via `require(...)` (ex.: `encodeUriComponent`, `injectScript`, `createArgumentsQueue`, `getTimestampMillis`).
- `injectScript` injeta `https://singularidata.com/static/utm_whatsapp.js?clientId=...&v=...`. O `utm_whatsapp.js` é JS de browser puro (roda na página, NÃO sandbox), criado na raiz.
- Sem build/npm/test runner. Testes do template GTM (`___TESTS___`) ficam vazios. Testes do browser script = funções puras rodáveis em Node via guard `typeof module !== 'undefined' && module.exports`.
- Permissões em `___WEB_PERMISSIONS___`: `inject_script` allowlist = `https://singularidata.com/static/*`. Adicionar query params NÃO requer nova permissão.

## Decisões Arquiteturais
- IIFE com `'use strict'`, try/catch global, funções puras (`parseQuery`, `composeText`, `rewriteHref`) separadas do DOM para testabilidade.
- Idempotência: defesa PRIMÁRIA = atributo `data-utmwa` (setado ANTES do href, evita loop do observer); SECUNDÁRIA = detecção semântica de prefixo `msg` + sufixo `(ID: ...)`.
- MutationObserver: SOMENTE `{ childList: true, subtree: true }` — NUNCA `attributes` (causa loop ao reescrever href).
- Ler params do próprio script via `currentScript.src` (URL absoluta já decodificada), fallback `querySelectorAll('script[src*="utm_whatsapp.js"]')` pegando o ÚLTIMO.

## Erros Recorrentes & Soluções
- `encodeUriComponent` (API sandbox GTM) ≠ `encodeURIComponent` (browser). Não confundir entre os dois arquivos.
- `msg` vazio: ao remover prefixo, toda string "começa com" string vazia → pular o passo quando `msg===''`.
- Suffix por regex quebra com `{{placeholders}}`/chars especiais → usar string match literal.
- `wa.me` sem `?` → não gerar `?` espúrio na reconstrução.
- Fragmento `#` corrompe parse manual de querystring → separar e re-anexar.

## Aprendizados de QA
- Projeto sem `package.json` → o "build gate" é o test runner: `node tests/utm_whatsapp.test.js` (zero deps). 44 testes passaram em 1 ciclo (APPROVED direto).
- Bug pré-existente encontrado e corrigido: `injectScript(url, data.gtmOnSuccess(), data.gtmOnFailure())` invocava os callbacks na hora; o correto é passar as REFERÊNCIAS (`data.gtmOnSuccess, data.gtmOnFailure`). API: `injectScript(url, onSuccess, onFailure, cacheToken)`.
- Strip de prefixo `msg` precisa de word-boundary: checar `middle.charAt(msg.length) === ' '` (ou fim da string) para não mutilar palavras quando `msg` é prefixo de caractere (ex.: msg="Oi" em "Oiça"). Era idempotente mesmo sem isso, mas corrigido.
- `parseQuery` deve converter `+`→`%20` antes de `decodeURIComponent` (form-urlencoded).
- `document.currentScript` é null para script injetado dinamicamente (injectScript) → querySelectorAll é o caminho primário, não fallback.

## Dependências & Integrações
- GA4 via `gtag('get', measurementId, 'client_id', cb)` para obter `client_id`. Mantido inalterado.
- WhatsApp deep links: `wa.me/<phone>?text=` (phone no path) e `web.whatsapp.com/send?phone=&text=` (phone em param). Ambos usam param `text`.

## Observações
- `&v=<timestamp>` quebra cache HTTP a cada fire (débito técnico pré-existente, não alterado).
- Limitações conhecidas: Shadow DOM não percorrido; redirect-wrappers (`l.facebook.com/l.php?u=`) não desembrulhados.
