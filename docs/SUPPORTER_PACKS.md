# Supporter packs: setting them up

Two packs of looks, bought with money in one go, on sale **1 December 2026 to
31 January 2027** (UTC), then never again (Terms 5.13):

| Pack | Price | Product id (Google Play and App Store) | Gives |
|---|---|---|---|
| Supporter pack | £9.99 | `supporter_2026` | Supporter's heart cap (hat), Sunshine (skin), 💛 badge |
| Patron pack | £19.99 | `patron_2026` | Everything above, plus Patron's Palace (world), Patron's Waltz (music), Golden heart (aim), 💖 badge instead |

**Built** (server, website, apps, tests): `SUPPORTER_PACKS` and
`SUPPORTER_SALE` in `src/shop/catalog.ts`; granting and refunds in
`server/store.ts`; the three payment routes in `server/accounts.ts`; the
Shop's section in `src/ui/shop.ts`; Restore purchases in
`ios/App/App/AppStorePlugin.swift`. `tests/accounts.test.ts` covers every
store, sending twice, refunds and the badge.

**What you need to do:** nothing for Stripe; create two products in Play
Console and two in App Store Connect (below), and ship the app update with
them **before about 15 November**, so Apple's review is done by 1 December.

---

## 0. The time limit (decided: a one-off)

Terms 5.1.2 used to promise "We never show countdowns or time-limited offers".
The packs are a time-limited offer, so 5.1.2 now says the launch Supporter
packs are the only exception, and that their end date is always shown plainly
(no countdowns, no "hurry"). Decided (3 Nov 2026): a one-off launch sale, never repeated, and no other
time-limited or direct-money items after it.

---

## 1. Stripe (website): nothing to set up

Checkout sends each pack's name and price with the order, so there's no
product to create in the Stripe dashboard. VAT works as for coins (Managed
Payments). The packs only appear while the sale is on.

**You can try it before 1 December**: the owner's account (`ADMIN_EMAILS`)
sees the packs and can buy them at any time. Use Stripe's test mode, or buy
one for real and refund it from the Stripe dashboard (the looks go back).

## 2. Google Play (Android)

1. **Play Console → the app → Monetise with Play → Products → One-time products → Create one-time product.**
2. For each pack:

   | Field | Supporter pack | Patron pack |
   |---|---|---|
   | Product ID | `supporter_2026` | `patron_2026` |
   | Name | Supporter pack | Patron pack |
   | Description | Back TardiGeddon at launch: a hat, a skin and a 💛 badge. | Back TardiGeddon at launch: a hat, a skin, a world, music, an aim and a 💖 badge. |
   | Purchase option id | `supporter-2026-buy` | `patron-2026-buy` |
   | Purchase option | type **Buy**, backwards compatible on, multi-quantity **off** | the same |
   | Price | **Set prices → all countries/regions**, £9.99 | £19.99 |

   The product id can never be reused or changed (that's why it has the year in it).
3. **Activate** the purchase option, then the product.
4. Nothing else: the server already checks Google purchases (the service
   account from `docs/GOOGLE_PLAY.md` §7). The server **acknowledges** a pack
   (Google keeps it as owned for good) instead of "consuming" it as it does
   for coins.
5. **Test:** licence testers (Play Console → Settings → License testing) buy
   for free; the purchase counts as £0 on the Sales page.

**Data safety:** no change: "Financial info → Purchase history" already
covers it.

## 3. App Store (iPhone and iPad)

1. **App Store Connect → the app → Monetization → In-App Purchases → +**, type
   **Non-Consumable** (not Consumable, as coins are).
2. For each pack:

   | Field | Supporter pack | Patron pack |
   |---|---|---|
   | Reference name | Supporter pack | Patron pack |
   | Product ID | `supporter_2026` | `patron_2026` |
   | Price | Base country United Kingdom, £9.99 | £19.99 |
   | Localization (English U.K.): display name | Supporter pack | Patron pack |
   | Description | A hat, a skin and a 💛 badge. | A hat, a skin, a world, music, an aim and a 💖 badge. |
   | Family Sharing | **Off** (the looks belong to one TardiGeddon account) | Off |

3. **Review screenshot:** the Shop with the Supporter section, taken from the
   TestFlight build on an iPhone (sign in as the owner, who sees the packs
   early). Add a **Review note**: "Cosmetic looks only. On sale 1 Dec 2026 to
   31 Jan 2027. Restore purchases is in the Shop, under the packs."
4. **Submit them with the next app version** (Apple reviews new in-app
   purchases with a build). Add both to the version's **In-App Purchases and
   Subscriptions** section before you submit it.
5. Nothing else on the server: `APPLE_APP_ID` and the refund notifications
   URL (`docs/IOS.md` §3) already cover them.
6. **Test** with a sandbox account (`docs/IOS.md` §3 step 5): buy, delete
   and reinstall the app, then tap **Restore purchases** in the Shop.

**App Privacy:** no change: "Purchases" is already declared.

## 4. On 1 December

The packs appear in the Shop by themselves on 1 December (UTC), in the
browser and in the apps. Say so in the launch News post and on socials.

## 5. On 1 February: end the sale

The game stops offering the packs by itself at the start of 1 February (UTC),
and the website stops selling them. In the stores:

- **App Store Connect:** each pack → **Remove from Sale**. Players who bought
  one keep it, and Restore purchases still works.
- **Play Console:** each product → **Deactivate**. Players who bought one keep
  it.

Never delete the products: their ids can't be used again, and Google and
Apple keep them for restores.

## 6. Refunds

Refunds come in the same way as for coins (Stripe's dashboard and webhook,
Google's voided purchases, Apple's notifications). The server takes back
that pack's looks and its badge, except looks another pack they still own
also gives.
