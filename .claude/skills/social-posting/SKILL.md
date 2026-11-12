---
name: social-posting
description: Plan, write, check and book weeks of social media posts for any brand through the Sociamonials connector (Facebook, Instagram, X, Bluesky, Threads, TikTok, Pinterest, YouTube, LinkedIn, Google Business). Use when asked to set up a brand's social posting, write a batch or month of posts, schedule or book posts in Sociamonials, top up a content calendar, check that scheduled posts went out, or set up a recurring posting routine. Not for one-off replies to comments.
---

# Social posting for any brand (Sociamonials)

A repeatable way to keep a brand's social calendar several weeks ahead:
**brand file → content plan → batch of posts → owner review → book in
Sociamonials → check delivery → monthly top-up.** It was worked out on
TardiGeddon (its files are the worked example: `docs/social/`,
`scripts/social/posts.ts`, `scripts/social-posts.ts`), and works the same for
any brand in any of the agency's workspaces.

Sociamonials writes go to real audiences and cannot be recalled. Follow the
connector's own operating rules (call `get_started` once, then
`get_workspace_context`) on top of everything here.

## 0. Pick the right workspace (every time)

1. `list_assigned_workspaces`. Several brands share one login. Match the
   brand **by name** and say which workspace you'll use (e.g. "TardiGeddon,
   38884") before any write. Never reuse an id from an earlier session.
2. `get_workspace_context` for that workspace: the brand profile, CTA and
   hashtag groups, categories, watermarks and **Pinterest boards**. Names
   there are exact strings; a wrong one is dropped silently (a 200 with a
   warning, and a live post with that part missing).
3. `list_social_profiles`: only profiles with `agent_can_publish_to: true`.
   Note each network's capabilities (TikTok and YouTube take video or photo
   carousels only; Instagram needs media; Pinterest needs a board).

## 1. The brand file (once per brand)

Keep one file per brand (in its repo, e.g. `docs/social/README.md`, or a
`brands/<brand>.md` for clients without a repo). Ask the owner for anything
missing. It holds:

- **Names and links:** brand name spelling, each handle, the one link every
  post ends with (and a tracked short link if they use one).
- **Bios** at 30, 80 and 160 characters, plus one paragraph.
- **Voice:** three or four words, an example line, spelling (UK or US).
- **Rules:** words and claims never to use (competitors' names, health or
  money promises, prices that change), what's legally sensitive (children,
  alcohol, finance, regulated claims), who the audience is.
- **Hashtags:** the brand's own tag always, then a pool of 2–3 to rotate.
- **Content pillars** (categories) with how many a week, e.g. product,
  tip, fact, behind the scenes, community question, offer.
- **Fixed dates:** launches, sales with their exact end dates, holidays
  that matter to the audience (and ones to skip).
- **Pinterest boards:** created on Pinterest *before* connecting it, named
  with the words people search for, one per pillar. Not every pillar suits
  Pinterest (questions don't).
- **Posting times** per weekday in the brand's time zone; ask
  `get_best_times` for a starting point.

## 2. Plan the batch

A batch is about four weeks (the first one can be up to twelve):

- One slot a day, rotating pillars so the same kind never runs two days
  in a row; dated posts at their own times (never two in one slot).
- Every claim checked against a real source: the product's own code or
  site, the price list, a reliable reference for facts. Leave out anything
  unsure. Never invent offers, codes, reviews or testimonials.
- Offers with an end date: say the date plainly; no countdowns or
  "hurry"; never post about an offer after it ends.
- Keep a list of what's already been posted (ids), so a new batch adds
  new angles instead of repeats.

## 3. Write each post

- **One text for every network:** at most 280 characters (X) and 300
  (Bluesky), counting emoji as 2. Hook first, one idea, the link line last,
  then the hashtags.
- **Alt text** for every image: what it shows, in a sentence.
- **Images:** 1080×1350 (4:5) suits Instagram, Facebook, Threads, X,
  Bluesky, Pinterest and TikTok photo posts. **Video:** 1080×1920, 15–40 s,
  captions burned in. Use only the brand's own pictures and footage, or
  properly licensed ones; music only from a licensed library.
- If the brand has a repo, make the posts **data plus a script** (as
  `scripts/social/posts.ts` does): the script checks lengths and banned
  words, draws the cards from the brand's own art, and writes a review page
  and a CSV. Otherwise use Canva (the Canva connector) for cards, with the
  brand kit.
- Give each post a stable **id** (`tip-wind`, `offer-xmas`): the record of
  what was booked uses it.

## 4. Owner review (before anything is booked)

Show the whole batch on one page (an HTML page with every card and its
words, or an Artifact) and ask for a yes. Booking is its own step that the
owner asks for ("schedule batch 2"); approving the plan alone books nothing.

## 5. Book it in Sociamonials

For each post, in date order:

1. **Media:** copy it into the workspace's media library
   (`import_media_from_url` from a public URL, or `create_media_upload` →
   upload → `complete_media_upload`), in a collection named
   "<Brand> posts batch <n>". Posts then don't depend on any other link.
2. **Validate** (`validate_social_post`) when unsure of a network's rules.
3. **Schedule** (`schedule_social_post`) at the slot's time in the
   workspace's time zone, with: the profiles for that post (not Pinterest
   for questions), Pinterest's `board_name` exactly as listed, TikTok's
   title, YouTube's title and description for videos, alt text.
4. **Read the reply.** A 200 with warnings is a partial failure: fix it
   (usually a board or group name) or tell the owner exactly what's missing.
   Respect approval holds and say a post will wait for approval.
5. Never "publish now" or schedule under an hour ahead without the owner's
   yes in the same conversation, naming the post and the profiles.

Then write **the booking record**: `batch-<n>-scheduled.csv` with
`id, publish_at_utc, sociamonials_post_id, networks, pinterest_board`, next
to the batch. Never also bulk-import the batch's CSV: that would post
everything twice. To move or drop a post later, find it by id in the record
and `update_post` / `cancel_scheduled_post` (cancel rather than delete, so
there's a trace).

After booking, `list_posts` for the batch's dates and check the count per
network matches the record.

## 6. Check it went out

Schedule a one-off check for an hour after the first post
(`send_later`): `get_post` / `get_post_status` for its id, and report which
networks show a platform post id and any errors (new connections, TikTok and
Bluesky especially). If one network fails, fix the connection before the
next post rather than re-posting.

## 7. Keep it going

- **Monthly top-up:** a scheduled task on a fixed day (TardiGeddon: the
  20th) writes the next batch and opens a pull request (or, without a repo,
  a review page). Scheduled tasks can't reach the Sociamonials connector,
  so the task ends by asking the owner to say "schedule batch <n>" in a
  session that has it.
- **Every week:** `get_published_messages_report` (last 30 days) and
  `get_post_analytics` for the best and worst posts; move slots or pillars
  that don't work. Likes and comments for X aren't tracked there.
- **Replies:** remind the owner that a few minutes a day replying beats
  another post.
- **Contests** (Sociamonials' viral sweepstakes) only once ordinary posting
  works: they need official rules, the brand's privacy policy updated for
  entrants' details, no purchase required, and prizes the platforms allow.
  Draft them (`create_viral_sweepstakes` as a draft); the owner launches.

## Checklist before saying a batch is booked

- [ ] Right workspace, named, context loaded this session
- [ ] Every post: ≤ 280/300 characters, link line, 2–3 hashtags, alt text
- [ ] No banned words, no competitor names, every claim sourced
- [ ] Offers: end date stated, nothing after it
- [ ] Pinterest board names exact; questions not pinned
- [ ] Each schedule reply read; warnings fixed or reported
- [ ] Booking record written; counts per network checked with `list_posts`
- [ ] Delivery check scheduled for the first post
