# Legal pages (drafts)

These are TardiGeddon's legal pages, written from the owner's own template
pack. They describe what the game actually does today:

- no cookies, analytics, ads or accounts
- local storage only for settings and teams
- the online server keeps team names, room codes and inputs in memory only

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
- **15 Refunds, 18 Subscription & Billing:** add **before the cosmetic shop opens**.
- **16 Shipping, 17 Warranty:** add only if physical merchandise is sold.
- **21 EULA:** add if a downloadable or desktop build ships.
- **23–27, 30 (corporate policies):** add when there are staff, suppliers or enterprise customers.
- **28 Security & Vulnerability Disclosure:** worth adding soon after launch; it's cheap goodwill.
- **29 Bug Bounty:** only with a bounty programme.

**Accounts are coming** (a free account will be required for online play).
When they launch, update the Privacy Policy, Children's Privacy and the
Cookie & Storage Policy with the new data, sign-in cookies and retention.

## Still to fill in (owner)

- Company details are filled in: EVCV Limited, company number 13570383, 28 Oak Tree Lane, Cookhill, Alcester, Warwickshire, B49 5LH, VAT GB389265053. Still to add: directors (`legal-notice.md`, if you want them listed).
- ICO registration: ZB232228 (filled in; renewal due 07/10/2027).
- Effective / Last Modified dates: set them at launch.
- **Minimum age for online play:** the draft says 13+, or younger players with a parent. Confirm it.
- **Hosts:** the draft names Cloudflare (website) and Fly.io in London (game server). Confirm them once deployed.
- **Contact addresses:** support@, legal@ and privacy@tardigeddon.com. Set these up when the domain is bought, or replace them.

Find everything still to do with: `grep -n "\[" site/legal/*.md`
