# public-landing Specification

## Purpose

Public landing page communicating MoneyDiary value prop (50/30/20, traffic-light, 4 Chilean banks), beta access, SEO, accessibility, security. No backend, no secrets.

## Requirements

### Requirement: Value Proposition Content

The landing MUST display hero above the fold on mobile (≤3s paint) communicating value prop: 50/30/20, traffic-light, 4 banks.

#### Scenario: Hero above the fold

- GIVEN a visitor on 375px viewport
- WHEN the page loads
- THEN hero (headline, subtitle, CTA) MUST be visible without scrolling
- AND Lighthouse LCP MUST be ≤2.5s

#### Scenario: Sections scannable

- GIVEN a visitor scrolling the page
- WHEN reaching each section
- THEN each MUST have a clear heading and one-paragraph explanation

### Requirement: Responsive Layout

The landing MUST use mobile-first responsive design adapting to tablet and desktop without horizontal overflow.

#### Scenario: Desktop three-column

- GIVEN a 1280px viewport
- WHEN viewing "How it works"
- THEN 3 steps MUST display in a horizontal row

#### Scenario: Mobile stacked

- GIVEN a 375px viewport
- WHEN viewing any multi-column section
- THEN content MUST stack vertically, touch targets ≥44×44px

### Requirement: Conditional Beta CTA

The CTA MUST render a direct link or email fallback via build-time static markup. No backend or runtime API calls.

#### Scenario: Link available

- GIVEN a beta link is configured in build environment
- WHEN the page renders
- THEN the CTA MUST link to that URL with `target="_blank" rel="noopener noreferrer"`

#### Scenario: Fallback email

- GIVEN no beta link is configured
- WHEN the page renders
- THEN the CTA MUST display `mailto:beta@moneydiary.cl`
- AND MUST NOT make network requests

### Requirement: SEO Metadata

The landing MUST include Open Graph and Twitter Card tags, `sitemap.xml`, `robots.txt`, and favicon.

#### Scenario: Social preview

- GIVEN a social crawler requests the page
- WHEN HTML renders
- THEN it MUST include `og:title`, `og:description`, `og:image`, and `twitter:card`

#### Scenario: Crawler discovery

- GIVEN a crawler requests `/robots.txt`
- THEN it MUST receive valid robots.txt allowing all crawlers
- AND `/sitemap.xml` MUST list all landing pages

### Requirement: Security Headers

The landing MUST serve via `vercel.json`: CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`.

#### Scenario: Blocks unsafe scripts

- GIVEN a browser loads the landing
- WHEN response is received
- THEN CSP MUST block inline scripts without nonce
- AND `img-src` MUST restrict to `self` and `https:`

#### Scenario: HSTS present

- GIVEN any response
- THEN `Strict-Transport-Security: max-age=31536000; includeSubDomains` MUST be present

### Requirement: WCAG 2.2 AA Accessibility

The landing MUST satisfy WCAG 2.2 AA: semantic landmarks, contrast ≥4.5:1 (text) / ≥3:1 (large text), alt text on images, visible focus indicators.

#### Scenario: Keyboard navigation

- GIVEN a keyboard-only visitor pressing Tab
- THEN every interactive element MUST receive a visible focus ring
- AND focus order MUST follow visual layout

#### Scenario: axe audit

- GIVEN the built page is scanned with axe-core
- THEN zero WCAG 2.2 AA violations MUST be reported

### Requirement: Performance Budget

The built landing MUST achieve Lighthouse Performance ≥90 and Accessibility ≥95.

#### Scenario: Lighthouse CI gate

- GIVEN the landing is deployed
- WHEN Lighthouse CI runs against production URL
- THEN Performance score MUST be ≥90
- AND Accessibility score MUST be ≥95

### Requirement: Zero Secrets in Bundle

The build MUST fail if `dist/` contains strings matching `API_KEY`, `DATABASE_URL`, `SECRET`, or `PRIVATE_KEY`.

#### Scenario: Secret grep passes

- GIVEN the build completes
- WHEN CI runs secret grep on `apps/landing/dist/`
- THEN zero matches MUST be found, OR the job MUST fail

### Requirement: Vercel Deployment

The landing MUST auto-deploy from `main` to Vercel with HTTPS, configurable domain, and fallback `*.vercel.app`.

#### Scenario: Deploy and verify

- GIVEN a push to `main` changes `apps/landing/` or `vercel.json`
- WHEN Vercel deployment completes
- THEN the landing MUST be reachable via HTTPS
- AND `curl -I` MUST return 200 with all security headers present

### Requirement: Bank Logo Rendering

The Bancos section MUST render SVG logos for each supported bank instead of emoji characters.

#### Scenario: SVG renders for each bank

- GIVEN the Bancos section is visible
- WHEN the page loads
- THEN each bank card MUST display an SVG image with descriptive `alt` text
- AND no emoji SHOULD appear as bank icon

#### Scenario: SVG load failure

- GIVEN a bank SVG file fails to load
- WHEN the image errors
- THEN the bank name MUST display as text fallback
- AND the card layout MUST NOT break

### Requirement: App Screenshot Rendering

The Capturas section MUST display real app screenshots with descriptive alt text instead of placeholder frames.

#### Scenario: Screenshots render

- GIVEN the Capturas section
- WHEN the page loads
- THEN each screenshot MUST load from a static asset path
- AND MUST include descriptive `alt` text

#### Scenario: Mobile responsive

- GIVEN a 375px viewport
- WHEN viewing the gallery
- THEN screenshots MUST stack vertically
- AND MUST maintain aspect ratio

### Requirement: Social Proof Bar

A stats bar with key metrics MUST render below the hero section.

#### Scenario: Stats visible

- GIVEN the social proof section
- WHEN the page renders
- THEN each stat MUST display a numeric value and a descriptive label
- AND the bar MUST be visually distinct from adjacent sections

#### Scenario: Zero-state

- GIVEN no stats metric is configured
- WHEN the section renders
- THEN zero values MUST display without animation placeholders

### Requirement: FAQ Accordion

A FAQ section with toggle behavior MUST render using static markup and client-side CSS/JS only. No backend calls.

#### Scenario: Expand answer

- GIVEN a FAQ question
- WHEN the user clicks it
- THEN the answer MUST expand below it

#### Scenario: Collapse answer

- GIVEN a FAQ answer is expanded
- WHEN the user clicks the same question again
- THEN the answer MUST collapse

#### Scenario: Keyboard accessible

- GIVEN a keyboard-only visitor
- WHEN they Tab to a FAQ question and press Enter
- THEN the answer MUST toggle visibility
- AND focus MUST remain on the question

### Requirement: Footer Privacy Link

The footer's privacy link MUST point to a valid privacy policy URL.

#### Scenario: Valid href

- GIVEN the footer renders
- WHEN inspecting the privacy link
- THEN its `href` MUST point to a valid URL
- AND it MUST NOT equal `#`
