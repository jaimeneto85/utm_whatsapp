'use strict';

var assert = require('assert');

// Stub browser globals so the IIFE does not throw when required in Node.
if (typeof global.window === 'undefined') {
  global.window = {};
}
if (typeof global.document === 'undefined') {
  global.document = {
    querySelectorAll: function () { return []; },
    currentScript: null
  };
}
if (typeof global.MutationObserver === 'undefined') {
  global.MutationObserver = undefined;
}

var fns = require('../utm_whatsapp.js');
var parseQuery    = fns.parseQuery;
var parseScriptSrc = fns.parseScriptSrc;
var composeText   = fns.composeText;
var rewriteHref   = fns.rewriteHref;

// ---------------------------------------------------------------------------
// Minimal test runner
// ---------------------------------------------------------------------------
var passed = 0;
var failed = 0;
var failures = [];

function test(label, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS ' + label);
  } catch (e) {
    failed++;
    failures.push({ label: label, error: e });
    console.log('  FAIL ' + label);
    console.log('       ' + e.message);
  }
}

function describe(label, fn) {
  console.log('\n' + label);
  fn();
}

// ---------------------------------------------------------------------------
// parseQuery
// ---------------------------------------------------------------------------
describe('parseQuery', function () {

  test('empty string returns empty array', function () {
    assert.deepStrictEqual(parseQuery(''), []);
  });

  test('leading ? is stripped', function () {
    var result = parseQuery('?foo=bar');
    assert.deepStrictEqual(result, [['foo', 'bar']]);
  });

  test('multiple pairs are parsed in order', function () {
    var result = parseQuery('?a=1&b=2&c=3');
    assert.deepStrictEqual(result, [['a', '1'], ['b', '2'], ['c', '3']]);
  });

  test('percent-encoded value is decoded', function () {
    var result = parseQuery('?text=Ol%C3%A1%20mundo');
    assert.deepStrictEqual(result, [['text', 'Olá mundo']]);
  });

  test('+ in value is treated as space (EC07)', function () {
    var result = parseQuery('?text=hello+world');
    assert.deepStrictEqual(result, [['text', 'hello world']]);
  });

  test('URL-encoded msg from GTM encodeUriComponent is decoded (EC07)', function () {
    var encoded = encodeURIComponent('Olá cliente');
    var result = parseQuery('?msg=' + encoded);
    assert.deepStrictEqual(result, [['msg', 'Olá cliente']]);
  });

  test('key without = gets empty value', function () {
    var result = parseQuery('?flagonly');
    assert.deepStrictEqual(result, [['flagonly', '']]);
  });

  test('duplicate keys preserved as separate entries', function () {
    var result = parseQuery('?text=a&text=b');
    assert.deepStrictEqual(result, [['text', 'a'], ['text', 'b']]);
  });

  test('special chars in key and value are decoded', function () {
    var result = parseQuery('?k%3D=v%26');
    assert.deepStrictEqual(result, [['k=', 'v&']]);
  });

});

// ---------------------------------------------------------------------------
// parseScriptSrc
// ---------------------------------------------------------------------------
describe('parseScriptSrc', function () {

  test('returns empty strings when no query string', function () {
    var result = parseScriptSrc('https://example.com/utm_whatsapp.js');
    assert.deepStrictEqual(result, { clientId: '', msg: '' });
  });

  test('extracts clientId and msg', function () {
    var result = parseScriptSrc('https://example.com/utm_whatsapp.js?clientId=ABC123&msg=Oi');
    assert.deepStrictEqual(result, { clientId: 'ABC123', msg: 'Oi' });
  });

  test('decodes URL-encoded msg (EC07)', function () {
    var src = 'https://example.com/utm_whatsapp.js?clientId=X&msg=' + encodeURIComponent('Olá cliente');
    var result = parseScriptSrc(src);
    assert.strictEqual(result.msg, 'Olá cliente');
    assert.strictEqual(result.clientId, 'X');
  });

  test('returns empty msg when only clientId present', function () {
    var result = parseScriptSrc('https://example.com/utm_whatsapp.js?clientId=X');
    assert.deepStrictEqual(result, { clientId: 'X', msg: '' });
  });

  test('returns empty clientId when only msg present', function () {
    var result = parseScriptSrc('https://example.com/utm_whatsapp.js?msg=Hello');
    assert.deepStrictEqual(result, { clientId: '', msg: 'Hello' });
  });

  test('last occurrence of repeated param wins', function () {
    var result = parseScriptSrc('https://example.com/utm_whatsapp.js?clientId=A&clientId=B');
    assert.strictEqual(result.clientId, 'B');
  });

});

// ---------------------------------------------------------------------------
// composeText
// ---------------------------------------------------------------------------
describe('composeText', function () {

  // CA01 / CA06 — no existing text, with msg + clientId
  test('CA01: msg + empty existing + clientId → "msg (ID: clientId)"', function () {
    var result = composeText('Oi', '', 'ABC');
    assert.strictEqual(result, 'Oi (ID: ABC)');
  });

  // CA02 — existing text present
  test('CA02: msg + existing + clientId → "msg existing (ID: clientId)"', function () {
    var result = composeText('Oi', 'Olá', 'ABC');
    assert.strictEqual(result, 'Oi Olá (ID: ABC)');
  });

  // CA06 — msg is empty
  test('CA06: empty msg + existing + clientId → "existing (ID: clientId)" (no leading space)', function () {
    var result = composeText('', 'Olá', 'ABC');
    assert.strictEqual(result, 'Olá (ID: ABC)');
  });

  // CA07 — clientId is empty
  test('CA07: msg + existing + empty clientId → no malformed "(ID: )" suffix', function () {
    var result = composeText('Oi', 'Olá', '');
    assert.strictEqual(result, 'Oi Olá');
    assert.ok(!result.includes('(ID:'), 'must not contain "(ID:"');
  });

  test('CA07: all empty → empty string', function () {
    var result = composeText('', '', '');
    assert.strictEqual(result, '');
  });

  // CA04 / EC03 — idempotence on suffix
  test('EC03: re-run does NOT duplicate "(ID: clientId)"', function () {
    var first = composeText('Oi', 'Olá', 'ABC');
    var second = composeText('Oi', first, 'ABC');
    assert.strictEqual(first, second);
  });

  // EC04 — idempotence on prefix
  test('EC04: re-run does NOT re-prefix msg', function () {
    var first = composeText('Oi', '', 'ABC');
    var second = composeText('Oi', first, 'ABC');
    assert.strictEqual(first, second);
  });

  test('idempotent with msg + non-empty existing after multiple runs', function () {
    var r1 = composeText('Promo', 'Olá equipe', 'X1');
    var r2 = composeText('Promo', r1, 'X1');
    var r3 = composeText('Promo', r2, 'X1');
    assert.strictEqual(r1, r2);
    assert.strictEqual(r2, r3);
  });

  // CA05 — accented characters
  test('CA05: accented chars in msg/existing are preserved', function () {
    var result = composeText('Olá', 'mundo ação', 'C1');
    assert.strictEqual(result, 'Olá mundo ação (ID: C1)');
  });

  test('empty msg with empty existing and valid clientId → only suffix', function () {
    var result = composeText('', '', 'XYZ');
    assert.strictEqual(result, '(ID: XYZ)');
  });

  test('no double spaces when existing is empty and msg present', function () {
    var result = composeText('Hello', '', 'C1');
    assert.ok(!result.includes('  '), 'must not contain double spaces');
  });

  test('msg empty, clientId empty, existing present → existing unchanged', function () {
    var result = composeText('', 'hello', '');
    assert.strictEqual(result, 'hello');
  });

  test('suffix is literal string match (no regex) — clientId with special chars', function () {
    var clientId = 'A.B+C';
    var first = composeText('Hi', '', clientId);
    var second = composeText('Hi', first, clientId);
    assert.strictEqual(first, second);
  });

});

// ---------------------------------------------------------------------------
// rewriteHref
// ---------------------------------------------------------------------------
describe('rewriteHref', function () {

  // CA01 — wa.me without ?text
  test('CA01: wa.me without query → adds ?text=msg%20(ID%3A%20clientId)', function () {
    var result = rewriteHref('https://wa.me/5511999999999', 'Oi', 'ABC');
    var url = new URL(result);
    assert.strictEqual(url.searchParams.get('text'), 'Oi (ID: ABC)');
    assert.ok(result.startsWith('https://wa.me/5511999999999?'));
  });

  // CA02 — wa.me with existing text
  test('CA02: wa.me with existing text → prepends msg and appends suffix', function () {
    var result = rewriteHref('https://wa.me/5511999999999?text=Ol%C3%A1', 'Oi', 'ABC');
    var url = new URL(result);
    assert.strictEqual(url.searchParams.get('text'), 'Oi Olá (ID: ABC)');
  });

  // CA03 — web.whatsapp.com preserves phone param
  test('CA03: web.whatsapp.com preserves phone param and updates text', function () {
    var href = 'https://web.whatsapp.com/send?phone=5511999999999&text=Ol%C3%A1';
    var result = rewriteHref(href, 'Oi', 'ABC');
    var url = new URL(result);
    assert.strictEqual(url.searchParams.get('phone'), '5511999999999');
    assert.strictEqual(url.searchParams.get('text'), 'Oi Olá (ID: ABC)');
  });

  // CA04 — running twice does not duplicate
  test('CA04: running rewriteHref twice does NOT duplicate msg or suffix', function () {
    var href = 'https://wa.me/5511999999999?text=Ol%C3%A1';
    var first = rewriteHref(href, 'Promo', 'X1');
    var second = rewriteHref(first, 'Promo', 'X1');
    assert.strictEqual(first, second);
  });

  // CA05 — special chars / accents
  test('CA05: accented chars in existing text are correctly decoded and re-encoded', function () {
    var href = 'https://wa.me/551199?text=' + encodeURIComponent('Ação e atenção');
    var result = rewriteHref(href, 'Oi', 'ABC');
    var url = new URL(result);
    assert.strictEqual(url.searchParams.get('text'), 'Oi Ação e atenção (ID: ABC)');
  });

  // CA06 — empty msg
  test('CA06: empty msg → existing text + suffix (no leading space)', function () {
    var href = 'https://wa.me/551199?text=Ol%C3%A1';
    var result = rewriteHref(href, '', 'ABC');
    var url = new URL(result);
    var text = url.searchParams.get('text');
    assert.strictEqual(text, 'Olá (ID: ABC)');
    assert.ok(!text.startsWith(' '), 'must not start with space');
  });

  // CA07 — empty clientId
  test('CA07: empty clientId → no "(ID: )" malformed suffix', function () {
    var href = 'https://wa.me/551199?text=Ol%C3%A1';
    var result = rewriteHref(href, 'Oi', '');
    var url = new URL(result);
    var text = url.searchParams.get('text');
    assert.ok(!text.includes('(ID:'), 'must not contain "(ID:" when clientId is empty');
    assert.strictEqual(text, 'Oi Olá');
  });

  // CA08 — backward compatible (empty msg, only ID suffix)
  test('CA08: empty msg + clientId → backward-compatible output with only suffix', function () {
    var result = rewriteHref('https://wa.me/551199', '', 'XYZ');
    var url = new URL(result);
    assert.strictEqual(url.searchParams.get('text'), '(ID: XYZ)');
  });

  // EC03 — existing text already contains suffix
  test('EC03: existing text already has "(ID: clientId)" → re-run does not duplicate', function () {
    var href = 'https://wa.me/551199?text=' + encodeURIComponent('Oi Olá (ID: ABC)');
    var result = rewriteHref(href, 'Oi', 'ABC');
    var url = new URL(result);
    var count = (url.searchParams.get('text').match(/\(ID: ABC\)/g) || []).length;
    assert.strictEqual(count, 1, 'should appear exactly once');
  });

  // EC04 — existing text already starts with msg
  test('EC04: existing text starts with msg → re-run does not re-prefix', function () {
    var href = 'https://wa.me/551199?text=' + encodeURIComponent('Oi Olá (ID: ABC)');
    var first = rewriteHref(href, 'Oi', 'ABC');
    var second = rewriteHref(first, 'Oi', 'ABC');
    assert.strictEqual(first, second);
  });

  // EC07 — msg already URL-encoded (from GTM encodeUriComponent)
  test('EC07: msg from GTM encodeUriComponent is decoded by parseQuery', function () {
    var encodedMsg = encodeURIComponent('Olá cliente');
    var src = 'https://example.com/utm_whatsapp.js?clientId=X&msg=' + encodedMsg;
    var parsed = fns.parseScriptSrc(src);
    var href = 'https://wa.me/551199';
    var result = rewriteHref(href, parsed.msg, parsed.clientId);
    var url = new URL(result);
    assert.strictEqual(url.searchParams.get('text'), 'Olá cliente (ID: X)');
  });

  // Fragment preservation
  test('fragment (#) is preserved and re-appended', function () {
    var href = 'https://wa.me/551199?text=Hi#section1';
    var result = rewriteHref(href, 'Hey', 'C1');
    assert.ok(result.endsWith('#section1'), 'fragment must be at the end');
    var base = result.split('#')[0];
    var url = new URL(base);
    assert.strictEqual(url.searchParams.get('text'), 'Hey Hi (ID: C1)');
  });

  // wa.me without ? — no spurious trailing ?
  test('wa.me without ? produces clean URL (no spurious trailing ?)', function () {
    var result = rewriteHref('https://wa.me/551199', 'Hi', 'C1');
    var queryStart = result.indexOf('?');
    assert.ok(queryStart !== -1, 'should have a query string since text was added');
    var textVal = new URL(result).searchParams.get('text');
    assert.strictEqual(textVal, 'Hi (ID: C1)');
  });

  // wa.me with empty msg AND empty clientId → text param set to empty string
  test('empty msg + empty clientId + no existing text → appends empty text param', function () {
    var href = 'https://wa.me/551199';
    var result = rewriteHref(href, '', '');
    var url = new URL(result);
    assert.strictEqual(url.searchParams.get('text'), '');
  });

  // + in existing text querystring is treated as space
  test('+ in querystring treated as space during parse', function () {
    var href = 'https://wa.me/551199?text=hello+world';
    var result = rewriteHref(href, 'Hi', 'C1');
    var url = new URL(result);
    assert.strictEqual(url.searchParams.get('text'), 'Hi hello world (ID: C1)');
  });

  // rewriteHref uses manual string parsing (no new URL()), so it handles non-standard hrefs
  // by treating everything before ? as the path part and appending text normally.
  test('non-standard href: manual parser treats path before ? as base and adds text', function () {
    var bad = 'not-a-url-at-all';
    var result = rewriteHref(bad, 'Hi', 'C1');
    assert.ok(result.includes('text='), 'should have added text param via manual parse');
    assert.ok(result.startsWith('not-a-url-at-all'), 'base path should be preserved');
  });

});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n--------------------------------------------------');
console.log('Tests:  ' + (passed + failed) + '  |  Passed: ' + passed + '  |  Failed: ' + failed);
if (failures.length) {
  console.log('\nFailed tests:');
  failures.forEach(function (f) {
    console.log('  - ' + f.label);
    console.log('    ' + f.error.message);
  });
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
  process.exit(0);
}
