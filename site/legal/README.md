# Legal pages (drafts)

These are TardiGeddon's legal pages, written from the owner's own template
pack. They describe what the game actually does:

- no analytics, ads or tracking; everything playable without an account
- local storage for settings, teams and (if signed in) owned shop items
- the online server keeps team names, room codes and inputs in memory only
- optional accounts (13+, self-declared) and a cosmetic shop: account data
  and purchase records in Neon, payments through Stripe, sign-in cookies
  only when signed in (docs/ACCOUNTS.md). The code must keep matching these
  pages: e.g. sessions store no IP address, expired sessions are purged, and
  checkout requires the 14-day-cancellation consent.

The website will render them at `/legal/<name>`. **They are drafts:** fill in
the placeholders below and have a solicitor review them before launch. That
matters most for the Terms and the Privacy Policy, as the template pack's own
README advises.

## Pages

| File | Based on template |
|---|---|
| `terms-of-service.md` | 01 Terms of Service (+ 19 Acceptable Use, 31 Dispute Resolution folded in) |
| `privacy-policy.md` | 02 Privacy Policy (+ 08 UK GDPR Notice, 12 DSAR Procedure folded in) |
| `cookie-policy.md` | 03 Cookie Policy (rewritten as a Cookie & Storage Policy: no cookies are used) |
| `accessibility-statement.md` | 05 Accessibility Statement (keeps the BETA framing on purpose) |
| `copyright-policy.md` | 06 Copyright & DMCA Policy |
| `legal-notice.md` | 07 Legal Notices (Imprint) |
| `childrens-privacy.md` | 11 Children's Privacy Policy |
| `third-party-licences.md` | 14 Third-Party Licences & Attributions |
| `community-guidelines.md` | 20 Community Guidelines |
| `ai-policy.md` | None: the pack has no AI policy template, so this one was written from scratch in the same format. Have it reviewed with the others. |

## Templates not used yet, and when to add them

- **04 Disclaimer:** TardiGeddon isn't an advice or content site. The Terms cover "as is".
- **09 CCPA Notice:** add if Californian players become significant, or once there are accounts or sales.
- **10 DPA, 22 API Terms:** there are no business customers and no public API.
- **13 Trademark & Brand Guidelines:** add when you register the TardiGeddon mark or invite fan art or streaming.
- **15 Refunds, 18 Subscription & Billing:** one-off purchases and refunds are in Terms §5. Add 18 before selling any subscription (e.g. a paid season pass).
- **16 Shipping, 17 Warranty:** add only if physical merchandise is sold.
- **21 EULA:** add if a downloadable or desktop build ships.
- **23–27, 30 (corporate policies):** add when there are staff, suppliers or enterprise customers.
- **28 Security & Vulnerability Disclosure:** worth adding soon after launch; it's cheap goodwill.
- **29 Bug Bounty:** only with a bounty programme.

**Accounts and the shop** were added in v1.1 (Privacy, Cookies & Storage,
Children's Privacy, Terms §3 and §5, Community Guidelines, Licences). The
plan's idea of requiring an account for online play is *not* in the Terms:
add it there before enforcing it. Refunds and billing are covered in Terms §5
rather than separate pages (templates 15 and 18).

Owner to confirm before the shop opens:

- The legal entity names of Neon and Stripe for the processors list (Privacy 4.0.2–4.0.3).
- That Stripe sends receipts (Stripe → Settings → Emails → successful payments): Terms 5.1.3 promises one.
- The 30 days' notice before closing the shop or Services (Terms 5.4.2) and the liability cap (9.1.3).
- VAT on sales outside the UK: see docs/ACCOUNTS.md.
- The Children's Privacy promise of no time-limited pressure to buy (1.2.3) rules out countdown sales; revisit before adding a daily shop or season pass.

## Still to fill in (owner)

- Company details are filled in: EVCV Limited, company number 13570383, 28 Oak Tree Lane, Cookhill, Alcester, Warwickshire, B49 5LH, VAT GB389265053. Directors are not listed; the Legal Notice links to Companies House instead.
- ICO registration: ZB232228 (filled in; renewal due 07/10/2027).
- Solicitor review of the Terms and Privacy Policy is pending; until it is done they show an "under review" note (`UNDER_REVIEW` in `site/src/pages/Legal.tsx`). Remove them from that list afterwards.
- Effective date: 9 October 2026, the launch date. Last Modified: 9 October 2026; update it whenever a page changes.
- Minimum age for online play: 13+, or younger with a parent's permission and supervision (confirmed).
- Hosts: Cloudflare Pages (website) and Fly.io in London (game server), confirmed at launch.
- Support emails are kept for up to 24 months after the conversation ends (Privacy Policy 5.1.3). **Delete older ones** from the support inbox to match: UK GDPR requires a set period, and the policy promises this one.
- Copyright year: 2026.
- Contact addresses: support@, legal@ and privacy@tardigeddon.com forward to the owner via Cloudflare Email Routing.

Find everything still to do with: `grep -n "\[" site/legal/*.md`
