# Trustindex "What clients say" widget — CORS regression

**Date investigated:** 2026-05-19
**Status:** Broken for most new viewers. Bug is on Trustindex's side, not ours.
**Widget ID:** `005ca16713968743b79629dff8b`
**Embed location:** `index.html:933`

## Symptom

The reviews section ("01 WHAT CLIENTS SAY") renders the literal Trustindex
fallback string:

> "Widget not found! Probably it is already deleted or there is typo in its ID.
> We suggest that you log in to the Trustindex system and follow the widget
> configuration instructions. Or, if you don't have an account, create one for
> free at www.trustindex.io"

Affected: most new viewers (confirmed in AU). Unaffected: viewers whose browser
HTTP cache still holds a pre-regression response (e.g. project owner in IL).

## Root cause

`https://cdn.trustindex.io/widgets/00/<id>/content.html` now responds with an
**HTTP 301 redirect** to an S3 bucket. The redirect response is missing
`Access-Control-Allow-Origin`.

```
$ curl -i -H "Origin: https://suki-systems.com" \
    "https://cdn.trustindex.io/widgets/00/005ca16713968743b79629dff8b/content.html"

HTTP/2 301
location: https://trustindex.s3.amazonaws.com/cdn/widgets/00/005ca16713968743b79629dff8b/content.html
server: Apache/2.4.52 (Ubuntu)
x-cache: Miss from cloudfront
x-amz-cf-pop: MEL51-P2
(no Access-Control-Allow-Origin header)
```

Per the Fetch spec, a redirect during a CORS request must itself carry
`Access-Control-Allow-Origin`. Without it, the browser aborts the fetch
before following the redirect — the JS never sees the bytes, and Trustindex's
loader (`TrustindexCommon.js:424`) catches the failure and prints the
"Widget not found" placeholder.

This is why curl + direct-address-bar navigation both succeed (no CORS),
while the XHR from `suki-systems.com` fails.

## DevTools fingerprint (from AU viewer)

- Request: `cdn.trustindex.io/widgets/00/005ca16713968743b79629dff8b/content.html`
- Status: "CORS error"
- Provisional headers shown / no response headers visible
- Timing: stalled at Connection Start (~15ms) then aborted
- Initiator: `TrustindexCommon.js:424` → `request` → `getWidgetHtml`

## Ruled out

- Widget deleted or wrong ID — direct URL fetch returns the HTML
- Free-plan impression cap — no quota response from server
- Domain allow-list mismatch — would produce a server response, not a redirect with no CORS
- DNS block — `nslookup cdn.trustindex.io` resolves to CloudFront IPs
- Ad blocker / extension — fails in Incognito with extensions off
- Network / ISP block — fails on mobile hotspot too
- Geo / IP issue — direct URL works from the same AU machine

## Why it worked yesterday

Trustindex changed their CDN routing. They moved widget HTML behind an
Apache origin (`admin.trustindex.io`) that 301-redirects to S3, and the
change shipped without CORS headers on the redirect. Pre-change responses
cached in viewers' browsers continue to work until their local HTTP cache
expires.

## Fix paths

### Preferred: Trustindex must fix it

Support ticket to Trustindex. Suggested message:

> Widget `005ca16713968743b79629dff8b` is broken for embedding sites. Your
> CDN at `cdn.trustindex.io/widgets/00/<id>/content.html` returns a 301
> redirect to S3, but the 301 response is missing
> `Access-Control-Allow-Origin`. This breaks all CORS-enabled XHR fetches
> from any embedding site. Please add CORS headers to the 301, or remove
> the redirect and serve the file directly with CORS.

Fix on their side is one header.

### Workaround we can ship if Trustindex is slow

Netlify Function that proxies
`https://trustindex.s3.amazonaws.com/cdn/widgets/00/<id>/content.html`
through our own domain so no CORS is needed. Trustindex's loader.js would
also need to be patched / routed through the same proxy. Non-trivial.

### Not doing

Hardcoding testimonials — explicitly ruled out by project owner.
