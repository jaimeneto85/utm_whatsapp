(function () {
  'use strict';

  if (window.__utmwa_initialized) return;
  window.__utmwa_initialized = true;

  try {
    var WA_SELECTOR = 'a[href*="wa.me"], a[href*="web.whatsapp.com"]';
    var SCRIPT_SRC_MARKER = 'utm_whatsapp.js';

    function parseQuery(search) {
      var result = [];
      var str = search.charAt(0) === '?' ? search.slice(1) : search;
      if (!str) return result;
      var pairs = str.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i];
        var eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          result.push([decodeURIComponent(pair.replace(/\+/g, '%20')), '']);
        } else {
          var key = decodeURIComponent(pair.slice(0, eqIdx).replace(/\+/g, '%20'));
          var val = decodeURIComponent(pair.slice(eqIdx + 1).replace(/\+/g, '%20'));
          result.push([key, val]);
        }
      }
      return result;
    }

    function composeText(msg, existing, clientId) {
      var suffix = clientId ? '(ID: ' + clientId + ')' : '';
      var core = existing;
      if (suffix && core.slice(-suffix.length) === suffix) {
        core = core.slice(0, core.length - suffix.length).replace(/\s+$/, '');
      }
      var middle = core;
      if (
        msg !== '' &&
        middle.slice(0, msg.length) === msg &&
        (middle.length === msg.length || middle.charAt(msg.length) === ' ')
      ) {
        middle = middle.slice(msg.length).replace(/^\s+/, '');
      }
      return [msg, middle, suffix].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
    }

    function buildQuery(pairs) {
      return pairs.map(function (pair) {
        return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]);
      }).join('&');
    }

    function rewriteHref(href, msg, clientId) {
      try {
        var hashIdx = href.indexOf('#');
        var fragment = '';
        var base = href;
        if (hashIdx !== -1) {
          fragment = href.slice(hashIdx);
          base = href.slice(0, hashIdx);
        }

        var qIdx = base.indexOf('?');
        var pathPart = qIdx === -1 ? base : base.slice(0, qIdx);
        var queryStr = qIdx === -1 ? '' : base.slice(qIdx);

        var pairs = parseQuery(queryStr);

        var lastTextIdx = -1;
        for (var i = pairs.length - 1; i >= 0; i--) {
          if (pairs[i][0] === 'text') {
            lastTextIdx = i;
            break;
          }
        }

        var existingText = lastTextIdx !== -1 ? pairs[lastTextIdx][1] : '';
        var newText = composeText(msg, existingText, clientId);

        if (newText === existingText && lastTextIdx !== -1) {
          return href;
        }

        if (lastTextIdx !== -1) {
          pairs[lastTextIdx] = ['text', newText];
        } else {
          pairs.push(['text', newText]);
        }

        var newQuery = buildQuery(pairs);
        var newBase = newQuery ? pathPart + '?' + newQuery : pathPart;
        return newBase + fragment;
      } catch (e) {
        console.warn('[utm_whatsapp] rewriteHref error for href:', href, e);
        return href;
      }
    }

    function parseScriptSrc(src) {
      var qIdx = src.indexOf('?');
      if (qIdx === -1) return { clientId: '', msg: '' };
      var pairs = parseQuery(src.slice(qIdx));
      var clientId = '';
      var msg = '';
      for (var i = 0; i < pairs.length; i++) {
        if (pairs[i][0] === 'clientId') clientId = pairs[i][1];
        if (pairs[i][0] === 'msg') msg = pairs[i][1];
      }
      return { clientId: clientId, msg: msg };
    }

    function readParams() {
      var src = '';
      var scripts = document.querySelectorAll('script[src*="' + SCRIPT_SRC_MARKER + '"]');
      if (scripts && scripts.length) {
        src = scripts[scripts.length - 1].src;
      } else if (document.currentScript && document.currentScript.src) {
        src = document.currentScript.src;
      }
      if (!src) {
        console.warn('[utm_whatsapp] could not locate script src — clientId and msg will be empty');
        return { clientId: '', msg: '' };
      }
      return parseScriptSrc(src);
    }

    function processLink(anchor, msg, clientId) {
      if (anchor.getAttribute('data-utmwa') === 'true') return;
      anchor.setAttribute('data-utmwa', 'true');
      var newHref = rewriteHref(anchor.href, msg, clientId);
      if (newHref !== anchor.href) {
        anchor.href = newHref;
      }
    }

    function collectLinks(root, msg, clientId) {
      var scope = root || document;
      var anchors = scope.querySelectorAll(WA_SELECTOR);
      for (var i = 0; i < anchors.length; i++) {
        processLink(anchors[i], msg, clientId);
      }
      if (root && root.matches && root.matches(WA_SELECTOR)) {
        processLink(root, msg, clientId);
      }
    }

    var params = readParams();
    var clientId = params.clientId;
    var msg = params.msg;

    collectLinks(null, msg, clientId);

    if (typeof MutationObserver !== 'undefined') {
      var debounceTimer = null;
      var pendingNodes = [];

      var observer = new MutationObserver(function (mutations) {
        for (var m = 0; m < mutations.length; m++) {
          var added = mutations[m].addedNodes;
          for (var n = 0; n < added.length; n++) {
            pendingNodes.push(added[n]);
          }
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          var nodes = pendingNodes.splice(0);
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.nodeType !== 1) continue;
            collectLinks(node, msg, clientId);
          }
        }, 100);
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    if (typeof module !== 'undefined') {
      module.exports = {
        parseQuery: parseQuery,
        parseScriptSrc: parseScriptSrc,
        composeText: composeText,
        rewriteHref: rewriteHref
      };
    }
  } catch (e) {
    console.warn('[utm_whatsapp] initialization error:', e);
  }
})();
