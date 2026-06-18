# Plan — UTM_Whatsapp: Mensagem Personalizada (custom message) + script `utm_whatsapp.js`

## 🎯 SCOPE

### Arquivos Afetados
- [x] `utm_whatsapp.js` (NOVO — raiz do projeto, JS de browser puro, sem build/npm)
- [x] `template.tpl` (MODIFICADO — novo param `CUSTOM_MESSAGE`, passa `msg` na URL injetada)
- [ ] `tests/` (NOVO — testes para funções puras do `utm_whatsapp.js`)

### Fora do Escopo
- Hospedagem/deploy de `utm_whatsapp.js` em `https://singularidata.com/static/` (responsabilidade de infra, não deste repo)
- Mudança no fluxo de obtenção do `client_id` (GA4 `gtag('get', ...)`) — mantido como está
- Build system / bundler / transpilação (projeto não tem)
- Mudança nas `___TESTS___` do template GTM (continuam vazias — não há runner GTM local)

### Riscos de Impacto
- R1: Re-execução do script (injeção múltipla pela tag GTM ou MutationObserver) pode duplicar a mensagem/sufixo → exige idempotência.
- R2: Parse incorreto do `text` existente pode corromper links já configurados → preservar demais params e number/phone.
- R3: `___WEB_PERMISSIONS___` desatualizada → confirmado que `https://singularidata.com/static/*` já cobre o novo `&msg=`; SEM nova permissão.
- R4: `encodeUriComponent` (sandbox) vs `encodeURIComponent` (browser) — nomes diferentes, não confundir.

## 📋 REQUIREMENTS

### Requisitos Funcionais
- [ ] RF01: `utm_whatsapp.js` lê seus parâmetros (`clientId`, `msg`) a partir do `src` do próprio `<script>` via `document.currentScript`, com fallback procurando `script[src*="utm_whatsapp.js"]`.
- [ ] RF02: Seleciona todos os `<a>` cujo `href` contenha `web.whatsapp.com` ou `wa.me`.
- [ ] RF03: Monta o texto pré-preenchido como: `msg` (começo) + texto existente do link (meio) + ` (ID: <clientId>)` (fim), partes unidas por espaço.
- [ ] RF04: Suporta `wa.me/<numero>?text=...` e `web.whatsapp.com/send?phone=...&text=...`, ambos via param `text`. Decode → recompõe → encode (encodeURIComponent). Preserva número/phone e demais params.
- [ ] RF05: Idempotente — não duplica o sufixo `(ID: ...)` mesmo rodando várias vezes; não re-empilha a `msg`.
- [ ] RF06: Reprocessa links adicionados dinamicamente (MutationObserver simples e robusto).
- [ ] RF07: `template.tpl` ganha campo TEXT `CUSTOM_MESSAGE` (displayName "Mensagem personalizada (vai no começo)").
- [ ] RF08: Sandbox passa `CUSTOM_MESSAGE` como `&msg=` na URL injetada usando `encodeUriComponent`; mantém `clientId` e `v`.

### Requisitos Não-Funcionais
- [ ] RNF01: Sem dependências externas / sem npm. Compatível com browsers (ES5-friendly o suficiente; evitar APIs muito modernas).
- [ ] RNF02: Falha segura — todo o processamento dentro de try/catch; nunca quebra a página.
- [ ] RNF03: Código auto-documentado, sem comentários desnecessários (padrão CLAUDE.md).
- [ ] RNF04: Funções puras (parse de querystring, montagem do text, reescrita do href) testáveis isoladamente.

### Critérios de Aceitação
- [ ] CA01: Link `wa.me/5511999999999` sem `text` → vira `wa.me/5511999999999?text=<msg>%20(ID:%20<clientId>)`.
- [ ] CA02: Link `wa.me/55...?text=Ola` → `text=<msg>%20Ola%20(ID:%20<clientId>)`.
- [ ] CA03: Link `web.whatsapp.com/send?phone=55...&text=Ola` → preserva `phone`, atualiza `text`.
- [ ] CA04: Rodar o processamento 2x no mesmo link NÃO duplica `(ID: ...)` nem a `msg`.
- [ ] CA05: `text` com caracteres especiais/acentos é corretamente decode/encode.
- [ ] CA06: `msg` vazio → resultado é texto existente + ` (ID: <clientId>)` (sem espaço inicial sobrando).
- [ ] CA07: `clientId` vazio/ausente → não anexa `(ID: )` malformado (sufixo só quando há clientId).

### Edge Cases
- EC01: `<a>` sem `href` ou href relativo contendo a substring → tratar via try/catch, pular se não parseável.
- EC02: `href` com fragmento (`#`) ou múltiplos `?` malformados.
- EC03: Texto existente que JÁ contém `(ID: <clientId>)` (re-run) → não duplicar.
- EC04: Texto existente que já começa com a `msg` (re-run) → não re-prefixar.
- EC05: `document.currentScript` indisponível (script async/defer em alguns contextos) → fallback por seletor.
- EC06: MutationObserver não suportado (browsers muito antigos) → degradar para processamento único sem quebrar.
- EC07: Acentuação na `msg` vinda já encodada pelo `encodeUriComponent` do GTM → decodificar uma vez ao ler do querystring.

## 🏗️ DESIGN

### Padrões Utilizados
- IIFE com `'use strict'` para isolar escopo e não poluir `window`.
- Funções puras separadas da manipulação do DOM (testabilidade): `parseQuery`, `buildText`, `rewriteHref`.
- Guard de idempotência por marcação no texto (detecção do sufixo `(ID: clientId)` e do prefixo `msg`) — preferir detecção semântica a flag de atributo, mas usar atributo `data-utmwa` como reforço opcional de "já processado nesta sessão" sem impedir reprocessamento quando o href muda.

### Fluxo de Dados
```
<script src=...?clientId=X&msg=Y>
   → readParams(currentScript)  → { clientId, msg }
   → collectLinks()             → [a, a, ...] (wa.me | web.whatsapp.com)
   → para cada link:
        rewriteHref(href, msg, clientId)
            → parse URL/querystring
            → text' = compose(msg, decode(text), clientId)  (idempotente)
            → re-encode text', preserva phone/number/outros params
        link.href = href'
   → MutationObserver → re-roda collect+rewrite em nós adicionados
```

### Interfaces/Contratos (funções puras)
```js
// Decompõe a querystring em pares preservando ordem
parseQuery(search) -> Array<[key, value]>

// Monta o text final de forma idempotente
// existing = texto JÁ decodificado do link (pode conter msg/sufixo de run anterior)
composeText(msg, existing, clientId) -> string

// Reescreve um href de whatsapp; retorna novo href ou o original em caso de no-op/erro
rewriteHref(href, msg, clientId) -> string
```

### Regras de composição (composeText) — idempotência
1. Definir `suffix = clientId ? "(ID: " + clientId + ")" : ""`.
2. Remover do `existing` qualquer ocorrência final do `suffix` literal (string match, NÃO regex — evita falso-positivo com `{{placeholders}}` e caracteres especiais) → `core`.
3. Remover do `core` o prefixo `msg` SOMENTE se `msg` for não-vazio E `core` começar com `msg` → `middle`. **Se `msg === ''`, PULAR este passo** (toda string "começa com" string vazia — bug CRÍTICO se não tratado).
4. Resultado = `[msg, middle, suffix].filter(Boolean).join(' ')` (cobre CA06, CA07 e no-double-space numa única expressão).
5. Colapsar espaços duplicados internos e `trim()`.

> Nota: a idempotência semântica acima é a defesa SECUNDÁRIA (cross-load/cross-session). A defesa PRIMÁRIA contra loop do observer é o atributo `data-utmwa` (ver MutationObserver).

### Componentes Reutilizáveis
- `encodeUriComponent` da API sandbox já está importada no template — reusar (não adicionar require novo).
- Padrão de URL injetada já existente em `updateLinks` — apenas concatenar `&msg=`.

### template.tpl — mudanças
1. `___TEMPLATE_PARAMETERS___`: adicionar objeto:
   ```json
   { "type": "TEXT", "name": "CUSTOM_MESSAGE", "displayName": "Mensagem personalizada (vai no começo)", "simpleValueType": true }
   ```
2. `updateLinks`: ler `data.CUSTOM_MESSAGE` e adicionar `&msg='+encodeUriComponent(data.CUSTOM_MESSAGE || '')` à URL.
3. `___WEB_PERMISSIONS___`: SEM alteração (confirmado: `inject_script` allowlist = `https://singularidata.com/static/*`).

## 📝 TASKS

### Fase 1: Implementação do script de browser
- [x] T1.1: [LOW] Criar esqueleto IIFE de `utm_whatsapp.js` com `'use strict'`, try/catch global, guard de inicialização única (`window.__utmwa_initialized`) e `readParams` lendo de `querySelectorAll('script[src*="utm_whatsapp.js"]')` pegando o ÚLTIMO (primary); fallback `currentScript.src`; decode único do `msg`/`clientId`.
- [x] T1.2a: [MEDIUM] Funções puras `parseQuery` (manual, ES5-friendly, preserva duplicados, handle `+`→space) e `composeText` (idempotente, com fix do `msg` vazio e suffix por string match).
- [x] T1.2b: [MEDIUM] `rewriteHref` cobrindo as 5 formas de URL: (a) wa.me sem `?`, (b) wa.me com `text`, (c) web.whatsapp.com `send?phone=&text=`, (d) sem trailing `?` espúrio, (e) com fragmento `#` separado e re-anexado. Substitui apenas a ÚLTIMA ocorrência de `text`. encode via `encodeURIComponent`. Retorna href original em no-op/erro (com `console.warn` no path de erro).
- [x] T1.3: [LOW] `collectLinks` (`a[href*="wa.me"], a[href*="web.whatsapp.com"]`) + aplicação; marca `data-utmwa` ANTES de setar `href`; expõe funções puras via guard `typeof module !== 'undefined' && (module.exports = {...})` (NÃO poluir `window` em produção). `parseScriptSrc` também exportada para testabilidade de `readParams`.
- [x] T1.4: [LOW] MutationObserver com `{ childList: true, subtree: true }` (SEM `attributes`), processando apenas `addedNodes` que sejam/contenham `<a>` whatsapp; guard de suporte (EC06); debounce ~100ms via `setTimeout`. MutationObserver escaneia sub-árvore do nó adicionado (não document inteiro).

### Fase 2: Atualização do template GTM
- [x] T2.1: [LOW] Adicionar campo `CUSTOM_MESSAGE` em `___TEMPLATE_PARAMETERS___`.
- [x] T2.2: [LOW] Atualizar `updateLinks` no sandbox para anexar `&msg=` com `encodeUriComponent`. Fix adicional: remover `()` de `gtmOnSuccess`/`gtmOnFailure` (eram chamados imediatamente em vez de passados como callbacks).
- [x] T2.3: [LOW] Validar/confirmar `___WEB_PERMISSIONS___` inalteradas e justificar (URL ainda em `/static/*`).

### Fase 3: Testes
- [x] T3.1: [MEDIUM] Testes das funções puras (`composeText`, `rewriteHref`, `parseQuery`) cobrindo CA01–CA07 e EC03/EC04/EC05/EC07. Runner simples sem deps (node puro ou expor funções).

## Análise Dual

### 🔴 Riscos (upsidedown) — incorporados ao plano
- **Loop do MutationObserver** ao reescrever `href`: mitigado → observer NÃO observa `attributes` (só `childList`/`subtree`) + atributo `data-utmwa` setado antes do `href`. (T1.3, T1.4)
- **Double-encode GTM↔browser**: usar `currentScript.src` (URL absoluta já decodificada pelo browser), decode único. `CUSTOM_MESSAGE` deve ser texto literal, não pré-encodado. (T1.1, doc no NOTES)
- **`currentScript` null em script externo**: fallback por seletor é caminho real; pegar o ÚLTIMO match (params mais recentes). (T1.1)
- **Múltiplas injeções / re-fire / preview mode**: guard `window.__utmwa_initialized` evita múltiplos observers acumulados. (T1.1)
- **`msg` vazio quebra remoção de prefixo**: passo 3 do `composeText` pula quando `msg===''`. (Design)
- **Fragmento `#` corrompe `text`** em parse manual: `rewriteHref` separa e re-anexa o hash. (T1.2b)
- **wa.me sem querystring** → evitar `?` espúrio na reconstrução. (T1.2b)
- **Suffix por regex** causaria erro com `{{placeholders}}`/regex-chars: usar string match literal. (Design)
- **T1.2 subestimada**: dividida em T1.2a (parse/compose) e T1.2b (rewriteHref 5 formas).
- **Limitações documentadas (NOTES)**: Shadow DOM não é percorrido; redirect-wrappers (`l.facebook.com/l.php?u=`) não são desembrulhados.

### 🟢 Oportunidades (downsideup) — incorporadas
- **Zero nova permissão**: `inject_script` allowlist `/static/*` já cobre `&msg=`. Confirmado em T2.3.
- **`encodeUriComponent` já importado** no sandbox: reuso direto, append de 1 linha em `updateLinks`. (T2.2)
- **`data.CUSTOM_MESSAGE || ''`** + `"defaultValue": ""` no param → backward-compatible, zero breaking para tags existentes. (T2.1, T2.2, CA08)
- **`module.exports` guard** torna funções puras testáveis em Node sem deps/jsdom. (T1.3, T3.1)
- **`[msg, middle, suffix].filter(Boolean).join(' ')`** resolve CA06/CA07/no-double-space numa expressão. (Design)
- **Observer só em `addedNodes` whatsapp** → evita re-scan global do documento. (T1.4)

### Critério adicional
- [ ] CA08: `CUSTOM_MESSAGE` ausente/não configurado no GTM → tag funciona como hoje (apenas `(ID: <clientId>)` é anexado), sem erro.
