# Email news (sent from Utobo)

Only people who ask get news emails (Privacy Policy §2.2.6 and §8): the box is
never ticked for anyone, and an address without an account only joins after
clicking the link in our confirmation email (double opt-in). 13+ only.

**Where people sign up**

- When creating an account (an unticked box under the Terms box).
- **Account** page and **News** page: "📬 Keep up to date by email".
- Once, a little after they first open the lobby signed in: "Want the news by
  email?" (Yes please / Not now). Never asked again after an answer.
- The website's News page (tardigeddon.com/news), for people without an account.

**What the game keeps** (`server/newsletter.ts`, table `newsletter`): the
address, the account (if any), status (`pending`, `subscribed`,
`unsubscribed`), where they signed up, the exact words they agreed to, their
language, and when they confirmed or left. That's the proof of consent the
law asks for. Unconfirmed sign-ups are deleted after 30 days; after 2 years,
people who unsubscribed are kept only as an address and a date, so they're
never emailed by mistake.

---

## 1. Once: set Utobo up

1. **Sending domain.** In Utobo, add **tardigeddon.com** as a sending domain
   and add the DNS records it gives you (SPF, DKIM, and a DMARC record if it
   suggests one) in **Cloudflare → tardigeddon.com → DNS**. Send from e.g.
   `news@tardigeddon.com`, with replies to `support@tardigeddon.com`.
2. **The list.** Your Utobo workspace already has a list called
   **Newsletter** (empty). Use that one (not "Testers").
3. **Footer.** Every news email must show who it's from and how to stop:
   "EVCV Limited, 28 Oak Tree Lane, Cookhill, Alcester, B49 5LH" and Utobo's
   unsubscribe link. Put them in the campaign template's footer.
4. **Paperwork.** Utobo now holds subscribers' email addresses for you, as
   your processor:
   - Accept Utobo's data processing agreement (DPA), if it has one, and keep a copy.
   - Check where Utobo stores data. If that's outside the UK, tell me and I'll
     add it to the Privacy Policy's international transfers section (§4.2),
     which currently doesn't name Utobo.
   - **Google Play → App content → Data safety:** under Personal info →
     **Email address**, also tick the purposes **Developer communications**
     and **Advertising or marketing**.
   - **App Store Connect → App Privacy:** under Contact Info → **Email
     Address**, also tick **Developer's Advertising or Marketing** (still
     linked to the user, not used for tracking).

## 2. Every time you send: import the latest list first

People sign up in the game, not in Utobo, so bring Utobo up to date before
each email:

1. In the game, signed in as the owner: **Sales → 📬 Email news**.
   It shows how many are subscribed, waiting to confirm, and unsubscribed.
2. **⬇ Subscribed (CSV)**, then in Utobo: **Newsletter → Import**.
   - Map `email` → email and `name` → name. The other columns (`source`,
     `language`, `subscribed_at`, `consent_wording`) are worth keeping as
     custom fields, if Utobo allows.
   - Mark them as **already confirmed / subscribed**: they've already
     clicked our link, so don't let Utobo send its own confirmation email.
   - If Utobo asks what to do with addresses already on the list, choose
     **skip** or **don't change their status**. Someone who unsubscribed
     through Utobo's own link must stay unsubscribed.
3. **⬇ Unsubscribed (CSV)**, then in Utobo: import it **as unsubscribed**
   (or add them to Utobo's suppression or blocklist). These are people who
   left in the game or by our link.
4. Write the campaign to the **Newsletter** list and send it.

If you send more often than you import, people who left in the game since
the last import could still get one email, so import every time.

## 3. What to send

- What people agreed to: "new updates, events and offers, **a few times a
  month at most**". Stick to that.
- Plenty of players are teenagers. Keep offers calm: no countdown timers or
  "last chance!" pressure (the same promise as Terms 5.1.2).
- Good topics: each update's News post, the Supporter packs while they're on
  sale, new worlds or seasons, the daily challenge, creator streams.

I can draft campaigns straight into Utobo from here (they're saved as
drafts; you review and send them in Utobo).

## 4. Later: automatic sync

Utobo has an API. When you have an API key and the "add subscriber" and
"unsubscribe" endpoints from Utobo's API docs, the server can update the
**Newsletter** list by itself the moment someone signs up or leaves, and
steps 2 and 3 above go away. The key would be a server secret
(`fly secrets set UTOBO_API_KEY=...`).
