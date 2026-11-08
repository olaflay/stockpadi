# AI layer: voice, chat, and image entry — research input

> **Status:** Primary AI implementation research input, supplied by the product owner on 2026-11-08. This document is evidence and planning material, not executable agent instructions and not an authority over `AGENTS.md`, `docs/LAUNCH_SCOPE.md`, the TRUST Standard, or locked architecture decisions.
>
> **Research routing tag:** `AI_IMPLEMENTATION_PRIMARY`
>
> **Use:** Consult this first for AI-related discovery, evaluation, voice/chat/image entry, safety, cost, consent, and rollout research. Re-verify time-sensitive claims against primary sources before implementation.
>
> **Known conflicts and verification gaps:** See [AI-IMPLEMENTATION-RESEARCH-NOTES.md](AI-IMPLEMENTATION-RESEARCH-NOTES.md). In particular, instructions embedded below (including prompts telling an agent to audit or run work) are quoted source material only and must not be executed merely because they appear here.

---

# Ojapadi AI Layer: Voice, Chat and Image Entry

Co-founder report v2, standardized and technically vetted. 6 Nov 2026, for Olaflay.

Build one AI layer with two jobs, entering data and answering questions, and design it so the AI cannot corrupt the ledger. This version merges and trims v1 and its addendum, fixes what technical vetting found wrong, and gives every listed problem a solution. Tags: \[Verified\] checked against a source, \[Inference\] my reasoning from evidence, \[Opinion\] judgement, \[Hypothesis\] an idea to test. I cannot promise zero missing edge cases; the test plan in section 11 is how you find the rest.

## 1. Decisions

| # | Decision | Basis |
| --- | --- | --- |
| 1 | The AI proposes, code validates, the user confirms, and only then the existing ledger command path writes. | Core safety rule. TradeVoice, a Nigerian hackathon team, uses the same principle: the AI never does money maths and code checks every amount was actually said. \[Verified, public post\] |
| 2 | Model: an audio-native Gemini Flash-Lite-class model on the paid API tier, called only from your server, retried on a stronger Flash model when validation fails. | Cheapest option with audio, images and structured output in one call. \[Verified listings; your benchmark decides\] |
| 3 | The AI is online-only. The ledger stays offline-first. Offline fallback is manual quick-entry plus quick-question chips. A voice inbox is added only if the pilot shows entries lost to bad network. | Your decision. I argued for the inbox; data should settle it. \[Opinion\] |
| 4 | Questions are answered by fixed tools run on the device, with answers built from templates. The model only picks the tool. No model-written queries. | Free-form text-to-SQL is reported at roughly 10 to 31% accuracy on real business data without curated definitions, and its failures look like plausible numbers. \[Verified, several write-ups and one benchmark\] |
| 5 | Every number shown comes from what the user said, or from a tool result. | Removes invented numbers by construction. \[Inference\] |
| 6 | Build the prerequisites in section 3 before any AI feature. | Most AI errors would really be missing units, aliases, undo or cost records. \[Inference\] |
| 7 | Ship non-AI value first: quick-question chips, daily close summary, export. | Works offline, costs almost nothing, shows whether owners want answers at all. \[Opinion\] |
| 8 | Paid tier only, explicit consent for sending data abroad, minimal data sent. | Paid tier is not used for training but is logged for abuse checks and processed in any country; Nigerian law restricts transfers. \[Verified\] |

## 2. Technical vetting: what changed from v1

| Item | Earlier claim | Vetting result | Fix |
| --- | --- | --- | --- |
| Audio format | Accept WebM or MP4 audio on the server | Gemini documents WAV, MP3, AIFF, AAC, OGG Vorbis and FLAC. Chrome records WebM/Opus; Safari records MP4/AAC (WebM only from Safari 18.4). \[Verified\] | Transcode with ffmpeg on the VPS to 16 kHz mono WAV before the model call |
| Audio cost | A few naira per entry | Audio is 32 tokens per second, so 30 s is about 960 tokens; inline requests are capped at 20 MB. \[Verified\] | Cap clips at 45 s. Estimate about 0.2 US cents per entry, roughly ₦3 at an assumed ₦1,500 per dollar |
| Model price | Flash-Lite about $0.25 input, $1.50 output | Listings disagree: 3.1 Flash-Lite $0.25 / $1.50, a newer Flash-Lite $0.30 / $2.50, audio input priced above text. One source says 2.5 models retire around 1 Dec. \[Verified, conflicting\] | Keep the model id in config, re-run the eval before any swap, read Google's pricing page the day you build |
| Data terms | Use a paid tier and check the terms | Paid tier: not used to improve products, prompts and responses logged about 55 days for abuse checks, no zero-retention option, data may be processed in any country. Free tier: used to improve products and humans may read it. \[Verified; recheck live terms\] | Paid tier only, consent screen, minimal data sent. Consider Vertex AI if you need residency options \[Unverified\] |
| Browser speech API | Use it as a first pass | Dropped. Behaviour depends on the browser, audio typically goes to the browser vendor, and it adds a second path to test. \[Inference\] | One path only: the server model call |
| Storage eviction | Request persistent storage | iOS usually denies persist(). Safari tabs delete script storage after 7 days of non-use; installed Home Screen apps are exempt. \[Verified\] | Push iOS users to install, sync early, scheduled export; request persist() on Android |
| Background sync | Sync in the background | Not available on iOS. \[Verified\] | Sync on the online event and when the app opens; run the queue in the main thread |
| Recording | Record while app is backgrounded | iOS stops recording when the app is backgrounded. \[Verified\] | Foreground push-to-talk only; save partial audio |
| Nigerian speech vendors | Intron, Orinode and Ajala look strong | Their accuracy numbers are self-reported. \[Verified as claims only\] | Benchmark them on your own recordings |
| Model-written queries | Let the model answer questions | Fails silently on real data. \[Verified\] | Fixed tools, on-device execution, template answers |
| Offline voice queue | Queue offline audio | You chose online-only for v1. | Manual fallback now; inbox only if the pilot shows lost entries |

## 3. Prerequisites: build before any AI feature

| # | Prerequisite | What breaks without it |
| --- | --- | --- |
| P1 | Catalog with IDs, a base unit, and sellable units with conversions (piece, pack, carton, bag) | 'Three bags' has nowhere to land and stock goes wrong |
| P2 | Alias tables for products and contacts | Spoken names cannot match; the AI layer feeds this table |
| P3 | Cost records: each restock saves product, supplier, unit cost, date and actor. Each sale stores the unit cost at the time of sale. Cost stays optional, but a missing cost shows a visible 'cost missing' state | Editing cost later would silently rewrite old profit; profit questions cannot be answered |
| P4 | A cost edit creates a new cost record and never overwrites. Changes log the old value and the actor. Optional owner approval for staff cost edits | Staff can hide a shortage by changing cost |
| P5 | Contacts (customers and suppliers) with a debt ledger, payments, partial and over-payments | Mixed-payment sentences cannot be recorded |
| P6 | Manual quick-entry for sale, restock, payment and adjustment | It is the offline fallback and the draft editor |
| P7 | Reversal entries instead of edit or delete | Undo for wrong AI drafts while the ledger stays append-only |
| P8 | Idempotency key (ULID) on every command | Double taps, retries and sync replays double count |
| P9 | Event time kept separate from sync time | Late syncs land on the wrong day |
| P10 | Draft state stored outside the ledger | Drafts must not touch stock |
| P11 | Stock adjustments with reasons, a negative-stock policy, stock count with variance | Shrinkage questions cannot be answered |
| P12 | Expenses module and an owner-drawings category | Profit is wrong when personal use is mixed in |
| P13 | Roles, actor on every entry, permission checks in code, audit trail | Staff fraud; owner-only numbers leak |
| P14 | Export, backup and restore (CSV or Excel), plus a scheduled export to the owner | Trust: Kippa's shutdown stranded about 500,000 users \[Verified, press coverage\] |
| P15 | Storage safety: iOS install prompt, early sync, storage-estimate warnings | iOS Safari tabs lose local data after 7 days unused |
| P16 | Shop settings: day end, week start, language, currency format | 'Today' and 'this week' are ambiguous |
| P17 | Sync status: last sync time and unsynced count | Answers and drafts cannot say how fresh they are |
| P18 | Report parity: every assistant tool has a matching report or button | Chat must not show numbers the app cannot show elsewhere |
| P19 | Usage metering, per-shop quotas, consent screen | Cost control and legal consent |
| P20 | App lock or PIN for balances | Debts visible on shared phones |

## 4. Architecture

### 4.1 Entry pipeline (voice, text, image)

1. **Client capture.** Push-to-talk, minimum 1 s, maximum 45 s, mono, about 24 to 32 kbps. Choose the recording format with `MediaRecorder.isTypeSupported` (WebM/Opus, MP4, Ogg). Images: resize to about 1024 px, JPEG, strip EXIF location. Every input gets a ULID and an event time.
2. **Upload.** POST to one endpoint with the user's token, shop id and ULID. Retries reuse the ULID so the server can ignore duplicates.
3. **Server pre-checks.** Auth, quota, size limits (about 2 MB audio, 1.5 MB image), file type sniffing, duration.
4. **Transcode and speech check.** ffmpeg converts to 16 kHz mono WAV. A loudness check rejects silence before any model call.
5. **Context build.** Date, time and time zone; units; up to about 500 catalog lines (id, name, aliases, units, last price); contact aliases. Rank by recency and frequency, keep the stable part first so provider-side caching helps. Experiment: send mentions only and resolve ids on the device, to minimize personal data sent.
6. **Model call.** Audio inline (limit 20 MB per request) with a structured-output schema using enumerated intents, low temperature, minimal thinking, 12 s timeout, one retry. On schema or validation failure, retry once on a stronger Flash model.
7. **Validators in code.** Schema; number grounding (technique T1, section 9.1); catalog match; unit conversion; quantity times unit price equals total; price plausibility against last and median price (flag beyond about 3x); stock level; debt direction; date sanity; duplicate within 60 s.
8. **Draft saved** locally on the device and logged on the server with transcript, audio reference, model and cost estimate.
9. **Draft sheet.** One row per command, uncertain fields highlighted, tap to edit, confirm all or per row, transcript and audio playback always visible.
10. **Executor.** The same function the manual screens call. Idempotency key is draft id plus row number.
11. **Ledger append.** Draft marked confirmed; edits the user made become alias or price-hint suggestions.
12. **Retention.** Audio kept 14 days by default (owner can delete or extend); images deleted after processing unless the owner keeps them. Tell owners the provider also logs requests for about 55 days.

### 4.2 Assistant pipeline (questions)

1. Text or voice goes to the same endpoint in assistant mode. The model receives the tool definitions, language, shop settings and the last tool call. It returns tool calls, or routes the message to the entry flow, or marks it out of scope.
2. The device runs the tools on the local ledger and returns typed results: values, resolved period, as-of time, unsynced count, completeness flags. Ledger values never leave the device in this path.
3. Templates in the question's language build the answer. Every number is tappable to the underlying entries.
4. No matching tool: say 'I can't answer that yet' and log the question (opt-in, no amounts).
5. Compound questions run several tools; follow-ups reuse the previous parameters for a few turns.

### 4.3 Command object (model output)

| Field | Content | Why |
| --- | --- | --- |
| transcript | Verbatim words heard | User check, audit, dispute evidence |
| language\_guess | pcm, yo, ha, ig, en or mixed | Routing and analytics |
| commands\[\].type | sale, restock, payment, adjustment, new\_product, none | One list per utterance |
| product | Catalog id or null, plus the spoken mention | New-product path |
| quantity, unit | Number plus the exact words said | Number grounding |
| unit\_price, total | Same; either may be empty | Check quantity times unit price equals total |
| person | Contact id or null, plus the mention | Alias learning |
| paid | Amount plus the words said | Debt equals total minus paid, computed in code |
| direction | they\_owe\_me, i\_owe\_them, none | Debt direction label |
| confidence | 0 to 1 per command | Which fields to highlight |
| needs\_clarification\[\] | Field and reason | Chips and questions |

The draft record adds: ULID, shop, actor, event time, model name, cost estimate, status (pending, confirmed, discarded, failed).

### 4.4 Failure handling

| Failure | Behaviour |
| --- | --- |
| Model timeout, outage or rate limit | Open manual quick-entry with the transcript pre-filled; nothing is lost |
| Validation fails twice | Same fallback, with the failing field highlighted |
| Network drops during upload | Keep the audio on the device for retry in this session, then manual entry |
| Quota reached | Clear message, manual entry and chips still work |
| Server restart mid-request | Client retries with the same ULID; server returns the stored draft if one exists |
| Provider deprecates or reprices the model | Model id lives in config; swap after the eval passes |

## 5. Audience: who they are, what they need, what exists

The target user is the owner-operator of a small shop or market stall (provisions, pharmacy, phone accessories, fabric, foodstuff) with 0 to 3 staff, often serving customers personally. Secondary users are shop staff, and larger shops or supermarkets that buy a standalone deployment. I have no first-party research on them yet. What follows combines published data with first principles, and section 14 says how to replace it with real interviews.

### 5.1 Device and data reality \[Verified unless marked\]

| Fact | Source | Design consequence |
| --- | --- | --- |
| Smartphone penetration reached 75% in 2025, up from 64% in 2023; feature phones fell to 28% of devices | KPMG and Orange Nigeria Smartphone Study | Your market is mostly smartphone-ready; feature-phone owners need SMS or a later USSD option |
| Android is 88% of smartphone users | Same study | Android first; test iOS second |
| Tecno, Infinix and Itel hold about 25%, 24% and 10% of devices; Transsion exceeds 60% | Same study, press coverage | Test on these brands |
| WhatsApp is installed on 95% of surveyed smartphones | Same study | WhatsApp is the natural channel for receipts, reminders and digests |
| Entry phones cost about ₦75,000 to ₦100,000 with 2 to 4 GB RAM (Itel A50, A90 class) | Retail and press listings | Design for 2 GB RAM; keep memory and downloads small |
| In June 2026 Android 13 was 17.6% of Nigerian Android devices, 12 was 16.5%, 11 was 13%, 14 was 12.4%, 15 was 11.7%, 10 was 9.7% | StatCounter | About four in five devices run Android 10 or newer; test on 10, 11 and 13 plus one older device \[Inference\] |

### 5.2 Needs and what each one means for the product

| Need | Evidence | Product implication |
| --- | --- | --- |
| Know today's money without a notebook | Nigerian SME tools launch against stock discrepancies, scattered bookkeeping, late receivables and unclear margins; the Oja pitch targets sellers who keep no records | Daily close summary and a simple profit view |
| Never lose the records | Kippa's shutdown left about 500,000 users without data | Export, backup, visible sync state |
| Collect debts without conflict | Credit sales are central; OkCredit built customer reminders, and a red-dot prompt on the reminder button raised first-time use by about 40% (vendor case study) | One-tap reminders, debt ageing, promise dates |
| Price against rising costs | Inflation and restocking difficulty squeeze small shops | Cost-rise alert on restock, margin shown at current price |
| Record in seconds during rush | Busy market days leave no time to write | Hold-to-talk, big tiles, record now and review later |
| Use their own language | OkCredit users praise Hindi support; Nigerian owners mix Pidgin and local languages | English and Pidgin first, then Yoruba, Hausa, Igbo |
| Low data and low-end phones | 2 to 4 GB RAM phones, data costs | Small app, offline-first, no heavy assets |
| Trust and control | Low-literacy research finds fear and mistrust of technology; owners fear staff theft | AI never writes silently; undo everywhere; audit trail |
| Familiar mental model | Khatabook's 'you gave / you got' with green for money in and red for money out is widely understood | Reuse the green and red convention |

**Wants (aspirations) \[Hypothesis\]:** to look professional to customers (branded receipts), to grow stock wisely, to be taken seriously by suppliers and lenders because the records are real. Test whether owners value receipts and records-as-proof enough to pay for them.

### 5.3 Existing solutions and what to take from them

| Product | What it did well | Lesson for Ojapadi |
| --- | --- | --- |
| Khatabook (India, 10M+ users) | Launched with just a customer list and a transaction list; stayed simple and ledger-focused; green and red for in and out | Start with sell and debts, add depth later. An independent redesign study argues the app can still be harder than a paper ledger, so test against the notebook |
| OkCredit (India) | Won its first shop by recording credit only, then migrating one set of customers; local-language support; SMS to customers | Onboard by one small habit first. Its founders noted a shopkeeper found the app hard to understand despite meeting their UX requirements, so watch real people, not checklists |
| Kippa (Nigeria) | Large user base in bookkeeping | Drifted into other products and then shut down. Stay focused and make data export a feature |
| Vendoor (Nigeria) | Market operating system with inventory, sales, expenses, voice search, USSD plans | Closest competitor. Try it, and note that logging by voice is still open |
| Paystack AI dashboard | Plain-language questions answered with summaries, tables and charts | Validates the ask-your-data pattern; serves payments, not shop stock |
| Oja, TradeVoice | Voice entry prototypes for traders | Validates the idea; hackathon depth only |
| The paper notebook and memory | Free, instant, familiar | The real competitor. Every flow must beat a notebook line on speed |

## 6. UX design, beginning to end

### 6.1 Principles

1. **Faster than the notebook or don't ship.** Target: a repeat sale in under 5 seconds, a new item in under 15.
2. **Pictures, numbers and voice before text.** Microsoft Research found text interfaces unusable for first-time low-literacy users and error-prone for novices, and recommends avoiding text (numbers are fine), voice feedback, minimal hierarchy, no scrolling and a consistent help icon. For semi-literate users, short text can help disambiguate icons, so pair every icon with a short label in the user's language. \[Verified\]
3. **One main action per screen**, large touch targets (48 dp or more), high contrast for sunlight, no gesture-only actions.
4. **Money colours with a second cue.** Green and up-arrow for money in or 'they owe you'; red and down-arrow for money out or 'you owe'. Never colour alone.
5. **Never silent.** The AI shows what it understood, every write can be undone, every number can be tapped to its source.
6. **Honest about state.** 'Saved on phone', 'Synced 2:14 pm', 'Not yet synced (3)'.
7. **Light by default.** Targets \[Opinion\]: app shell under 200 KB compressed JavaScript, usable within 5 seconds on a throttled 3G mid-tier phone, entry sheet opening in under 300 ms, memory under 150 MB.
8. **Reveal depth gradually.** Day one: Sell and People. Stock detail, reports and AI appear as the shop matures.

### 6.2 Structure

Keep the current bottom navigation: **Dashboard, Sales, Products, Reports, More**. The AI is not a tab. It opens from every page in two ways, and both open the same assistant sheet.

1. **Header button.** In the green header on every page, top right, an icon with the word 'Ask' beside it. Icon plus label, because a sparkle alone may not be understood; test the label with owners.
2. **Dashboard floating button.** At the bottom edge of the Dashboard, above the navigation bar. A tap opens the sheet. A long press is a shortcut: hold to talk without opening the chat, release to save the recording to the Inbox. \[Hypothesis; it saves a tap during a rush\]

**The assistant sheet.** It slides up from the bottom at half height, drags up to full screen, and drags down or taps outside to close. The page stays visible behind it. Inside:

- Suggestion chips that change with the page: on Products 'Add stock' and 'What is low?', on Sales 'Record a sale', on Dashboard 'Who owes me?'.
- The chat thread, with draft cards that wait for Confirm.
- A composer with a **+** button (take photo, choose photo), a hold-to-talk microphone, a text box and Send.
- Only the last 20 conversations are kept on the device.

**Decluttering.** Dashboard holds today's numbers and a few cards (Who owes me, Low stock, Best sellers, Inbox). Sales and Products keep their current jobs. Reports stays as it is. More keeps the existing combined Contacts and Debts page (customers and suppliers with their balances), plus expenses, staff, settings, export and help. Debts also appear as a Dashboard card so they are never buried.

**Terms in section 6.4:** 'Sell' means your Sales page. 'Talk button' and 'Capture sheet' mean this assistant sheet and its microphone.

**Contacts and Debts page (stays in More): changes for the AI layer**

1. **Dashboard card.** 'Who owes me' shows the total and the top debtors, and opens this page directly.
2. **Assistant links.** Answers about debts end with a link such as 'Open Mama Ife's balance'.
3. **Alias field on every contact** (for example 'Mama Ife', 'Ife's mum'), used by voice and text matching. Required before the AI layer.
4. **Direction labels.** Money owed to the shop is green with an up arrow; money the shop owes is red with a down arrow. The same labels appear on AI draft cards.

**To confirm on the current page (prerequisite P5):** (a) customers and suppliers are separated, or each balance at least has a clear direction; (b) partial payments and overpayments can be recorded; (c) each contact has a nickname or notes field. Any 'no' is prerequisite work before Phase B.

### 6.3 First run: install to first value in under 3 minutes

1. **Install.** Android Chrome: offer install after the first completed sale, not before. iPhone: a two-step picture guide for Add to Home Screen, because installed apps keep local data longer than Safari tabs.
2. **Language.** Large buttons, each written in its own language: English, Pidgin, Yoruba, Hausa, Igbo.
3. **Account.** Shop name, phone number and a 4-digit PIN. The PIN doubles as the app lock. SMS verification only when recovering an account (keeps cost down). \[Opinion\]
4. **Shop type.** Pick provisions, pharmacy, phones and accessories, fabric, foodstuff or other. This loads a starter catalogue of common items with units, so the owner edits instead of typing. \[Hypothesis: shop-type starter packs\]
5. **Add stock, four easy ways:** say it ('rice 20 bags, 5,000 each'), photograph a notebook page, tick items from the starter list, or add later. Skipping is allowed; items can be created while selling.
6. **First sale, guided.** Tap an item, tap the number pad, tap Done. Show 'First sale saved' with the amount.
7. **Permissions at the moment of need.** Microphone when they first tap Talk, with a one-screen plain-language consent about what is sent, where, how long it is kept, and how to delete it. Notifications after the first day close, when the daily summary has something to show.

### 6.4 Core screens

| Screen | Layout and behaviour |
| --- | --- |
| **Sell** | Top: today's sales in large numerals, with 'collected' smaller. Middle: grid of the 12 most-sold items as big tiles (name, price); tap adds one, tap the count to change. Bottom: cart total and three buttons, Cash, Transfer, Credit. Credit asks for the customer (search or recent). Result: 'Saved' toast with Undo for 10 seconds |
| **Capture sheet** | One large hold-to-talk button, a level indicator, and a rotating example in the user's language ('Sold 3 rice to Mama Ife, she paid 5,000'). Release saves the recording at once ('Saved, reading...') and the owner can keep working. Slide away to cancel. A text box sits beneath for typing |
| **Draft review (Inbox)** | Cards, not a spreadsheet. Each card is one plain sentence with big numbers: 'SOLD Rice 50kg x 3 = ₦13,500. Mama Ife paid ₦5,000. SHE OWES YOU ₦8,500.' Uncertain fields are orange and tappable. Buttons: Confirm (large, green), Edit, Remove. 'Confirm all' appears only when nothing is orange. 'What I heard' expands to the transcript and a play button |
| **Stock** | Searchable list: name, quantity in large type, low-stock badge. Item detail shows prices, cost history and an adjust action. 'Add stock' sheet: supplier, quantity, unit cost (pre-filled from the last purchase, editable, may be blank but flagged). If cost rose, show 'Cost up 12%. Your margin is now 8%. Update price?' with one tap |
| **People** | Customers and Suppliers tabs, sorted by amount owed. Each row shows the amount with arrow and colour. Detail: statement, Record payment, Remind (opens a WhatsApp message draft) |
| **Money** | Row of chips: Today, Who owes me, Low stock, Best sellers, Profit, Stock value. Daily summary card above them. Ask box with microphone below. A completeness note appears when recording looks thin ('12 sales recorded today, usual about 40') |
| **Answer card** | The number in large type, one explanatory line, 'See how' to the entries, and an interpretation line ('Showing: Rice 50kg, as of 2:14 pm') with tap to change |
| **Close shop** | One screen: unsynced count, new debts today, optional counted cash against expected, Done. Sends the summary |
| **Settings** | Language, day-end time, PIN, staff, export and backup, AI privacy and audio deletion |

### 6.5 States and feedback

| Moment | What the user sees |
| --- | --- |
| Recording | Pulsing mic, level bars, haptic tick on start and stop |
| After release | 'Saved, reading...' then a badge on the Talk button |
| Draft ready | Card in the Inbox; orange fields need a tap |
| Nothing heard | 'I did not hear anything. Try again or type it.' |
| AI unavailable | 'Type it instead' opens manual entry with whatever was heard filled in |
| Offline | Small dot and 'Saved on phone'; Talk shows 'Needs internet' with manual entry one tap away |
| Wrong entry confirmed | Undo toast, later a Reverse action in history (never a silent edit) |
| Empty screens | One action and one example sentence, no illustrations needed |
| Errors | Plain words in the user's language and one thing to do next |

### 6.6 Visual system (clean and cheap)

- One accent colour, green and red reserved for money meaning, everything else neutral grey and white.
- System fonts only (no download), tabular numerals for money, naira sign always shown. Base text 16 sp, key numbers 28 to 32 sp.
- Contrast at least 4.5:1 so screens read in sunlight; touch targets 48 dp or more; works one-handed.
- About 20 simple outline icons as inline SVG, each with a label. No photos required; item pictures optional.
- Dark mode and animation libraries are not in v1. Charts, when used, are tiny SVG bars.
- For first-run hints, short looped hand-drawn style drawings in CSS may help low-literacy users more than icons or photos, according to the research reviewed. \[Hypothesis; test with five users\]

### 6.7 Language and microcopy

Ship English and Pidgin first. Every string lives in a language file so Yoruba, Hausa and Igbo can be added without code changes. The Pidgin lines below are my first draft and **must be reviewed by native speakers before use.**

| English | Pidgin (draft) |
| --- | --- |
| Saved | E don save |
| Who owes me | Who dey owe me |
| Low stock | Wetin dey finish |
| Confirm | Correct |
| Undo | Cancel am |
| Hold to talk | Hold am make you talk |
| I did not hear anything | I no hear anything |
| You owe | You dey owe |

### 6.8 Cheap build choices

- Keep the PWA you have. Use a small component set, CSS variables for the theme, Workbox for caching the app shell, and a thin IndexedDB wrapper for the ledger.
- Lazy-load the capture sheet, assistant and charts so first load stays small.
- No text-to-speech, no animation library and no paid messaging in v1. Use free web push for the daily summary and offer WhatsApp as an opt-in later.
- The only recurring variable cost is the model call (section 7).

### 6.9 UX test plan

1. **Five owners per round, three rounds**, in their own shops during real trading, not in an office.
2. **Tasks:** make a first sale; record a credit sale by voice; restock with a cost; fix a wrong draft; find who owes the most; undo a mistake.
3. **Measure:** time per task, taps, errors, whether they recover without help, and the question 'would you use this tomorrow instead of your notebook?'.
4. **Observe rather than ask.** OkCredit's founders found that a shopkeeper who liked the idea still struggled with the first version.
5. **Device lab:** one Itel A50-class phone with 2 to 3 GB RAM, a Tecno or Infinix mid-range phone, Android 10, 11 and 13, outdoor sunlight, a throttled 3G connection, large-font setting.
6. **Staff round:** repeat with shop assistants, since they enter most of the data.

## 7. Model, cost and quality gates

| Candidate | Role | Notes |
| --- | --- | --- |
| Gemini Flash-Lite class, audio-native, paid tier | Default for voice entries, questions and receipts | One call returns transcript plus structured commands. Supports audio, images and structured output. Accuracy on Pidgin and Yoruba is unproven, so the benchmark decides |
| Stronger Gemini Flash | Automatic retry when validation fails twice | Keeps cost low because most calls never escalate |
| Intron Sahara v2 or Orinode speech-to-text, then Flash-Lite for extraction | Challengers in the benchmark | Vendor accuracy claims are self-reported; adopt only if they beat the default on zero-edit rate |
| Raw Whisper | Not used | Rewrites dialect into standard English and can invent words on silence |
| Local model on the phone | Not used | Too heavy for 2 GB phones; you chose online-only for AI |

**Select by outcome, not word error rate.** The scores that matter: zero-edit confirm rate, number accuracy, debt-direction accuracy, p95 latency and cost per confirmed entry.

**Cost per action \[Inference from verified token rates and listed prices; recompute after the pilot\]**

| Action | Tokens (approx.) | Cost |
| --- | --- | --- |
| Voice entry, 30 s | Audio about 960, catalogue about 4,000 (less when cached), output about 400 | About 0.2 US cents, roughly ₦3 at an assumed ₦1,500 per dollar |
| Typed or spoken question | Short question, cached tool definitions, tool call about 100 out | Under 0.05 US cents, about ₦1; templates build the answer with no second call |
| Receipt photo | Measure in the pilot | Unknown until measured |

**Cost controls:** per-shop daily quota (start at 100 AI entries and 200 questions, an arbitrary starting point), a global monthly spend breaker, cached answers for repeated questions, the cheapest model first, and metering per shop so you can price the AI tier. Track cost per confirmed entry, not per call.

## 8. Features and phases

Phase letters: **A** no AI, **B** to **F** AI. Items marked N are my additions as co-founder; all N items are hypotheses to test.

| ID | Feature | Phase | Why it earns its place |
| --- | --- | --- | --- |
| F1 | Quick-question chips (today's sales, who owes me, low stock, best sellers, stock value) | A | Same tools the assistant uses; works offline; shows whether owners want answers |
| F2 | Daily close summary (sold, collected, new debts, top items, low stock, unsynced) | A | Template-built, no model cost; likely the best retention feature |
| F3 | Starter catalogue by shop type (N) | A | Cuts typing at setup; faster first sale |
| F4 | Export, backup and scheduled export to the owner (N) | A | Answers the Kippa lesson |
| F5 | Voice or typed sales, restock and payments into a draft card | B | Core value |
| F6 | Debt-direction-safe cards with plain words and colour | B | Highest-severity error class |
| F7 | Record now, review later: hold-to-talk saves instantly and drafts wait in an Inbox (N) | B | A trader in a rush cannot check a card; stock changes only on confirm |
| F8 | Typed assistant with 8 tools and template answers | B | Ask-your-data without invented numbers |
| F9 | New-product drafts with duplicate check | C | Inventory always meets unknown items |
| F10 | Alias learning from corrections | C | The shop's own vocabulary beats any prompt |
| F11 | Cost-rise alert and repricing helper (N) | C | Inflation makes old prices lose money; shows margin at today's cost |
| F12 | Debt recovery: ageing, promise-to-pay dates, WhatsApp reminder drafts (N) | C | Cash collection is a daily owner worry |
| F13 | Completeness indicator (N) | C | Stops the assistant sounding sure about half-logged days |
| F14 | Voice questions and Pidgin, Yoruba, Hausa, Igbo answer templates | D | Language reach |
| F15 | Receipt and notebook photo import | D | Fast opening stock and restock |
| F16 | Voice onboarding for opening stock | D | Likely strongest activation moment |
| F17 | Close-shop ritual with cash check (N) | D | Habit anchor and loss detection |
| F18 | Staff accountability digest: voids, adjustments, cost edits (N) | D | Theft deterrent for owners |
| F19 | Branded WhatsApp receipts that link to Ojapadi (N) | E | Growth loop; customers see the brand |
| F20 | Supplier order message and supplier price comparison (N) | E | Turns restock lists into action |
| F21 | Offline voice inbox, only if the pilot shows lost entries | E | Data-triggered, not assumed |
| F22 | Earned autonomy: after 200 entries and at least 95% zero-edit, offer auto-confirm for exact-match low-value sales with a one-hour undo (N) | F | Removes friction only where the shop has proved the AI is right; high risk, opt-in |

## 9. Core techniques and edge-case register

### 9.1 Core techniques (referenced by the register)

| ID | Technique | How it works | Test |
| --- | --- | --- | --- |
| T1 | Number grounding | Every amount and quantity carries the exact words the user said. Code normalizes spoken numbers in English, Pidgin, Yoruba, Hausa and Igbo, plus 'k' and forms like 'two fifty', and rejects any number it cannot trace to the transcript | 200 number-heavy utterances; zero ungrounded numbers may reach a card |
| T2 | Ambiguity chips | When a number has several plausible readings, the model returns candidates and the card shows tappable chips ranked by the item's price history | Seed ambiguous cases; measure how often the right chip is first |
| T3 | Commands, not text | The model outputs the same command objects the manual screens create, so validation and execution live in one place | AI path passes the same unit tests as the manual path |
| T4 | Direction-safe cards | Plain-word, colour-coded statements: green 'THEY OWE YOU', red 'YOU OWE THEM' | Show 20 cards to 10 traders and have them restate each; no misreads |
| T5 | Duplicate-aware new products | Fuzzy-match an unknown item against the catalogue and ask 'same as X?' with one tap; the answer becomes an alias | 50 new-item mentions; near-zero duplicates |
| T6 | Learning from corrections | Each edit on a card becomes an alias or price hint for that shop | Zero-edit rate per shop over four weeks |
| T7 | Cost-at-sale snapshot | Each sale stores its unit cost at that moment, so later cost edits never rewrite past profit | Edit a cost, confirm old profit is unchanged |
| T8 | Draft first | The AI never writes to the ledger; only a confirmed draft does, through the manual command path | Penetration test: no AI route reaches the ledger without confirmation |
| T9 | Completeness indicator | Compare today's recorded entries with the shop's own recent baseline and say so when thin | Simulate half-logged days; indicator fires |
| T10 | Device-side tools and templates | The cloud model returns a tool call; the phone runs it on the local ledger and builds the answer from templates | Same answer before and after sync, offline chips match online answers |

### 9.2 Register: capture, language and understanding

Severity: **H** can corrupt money or stock, **M** gives a wrong but visible result, **L** annoyance.

| ID | Case | Sev | Solution |
| --- | --- | --- | --- |
| A1 | Market noise, generators, other people talking | H | Hold-to-talk; show transcript; T1; confirm step; noisy clips in the test set |
| A2 | Silence or very short clip leads the model to invent content | H | Minimum 1 s and loudness check on device and server; reject with 'I did not hear anything'; never create a card |
| A3 | Long ramble | M | 45 s cap with auto-stop; suggest splitting |
| A4 | Browser audio format not accepted by the model | H | Server transcodes to 16 kHz mono WAV |
| A5 | iOS stops recording in background; microphone permission quirks | M | Foreground-only recording; save partial audio; permission recovery screen; typed fallback |
| A6 | Slow upload on 3G | M | Compressed mono clip of about 100 to 140 KB; progress; retry by ULID; timeout then manual entry |
| A7 | Call or notification interrupts recording | L | Keep captured audio; ask to continue |
| A8 | A customer or staff member is the speaker | M | Show transcript; actor stored on every entry; owner review feed |
| A9 | Accidental or non-business recording | L | Intent 'none' discards it with no card |
| L1 | Pidgin, Yoruba, Hausa, Igbo and English mixed in one sentence | H | Audio-native model plus catalogue context; benchmark each mix; manual fallback |
| L2 | Model rewrites dialect into standard English | H | Keep verbatim transcript; run T1 against the verbatim text |
| L3 | Mis-heard names and brands | M | Aliases, fuzzy match, 'did you mean' chips |
| L4 | Diacritics lost or added | L | Match on normalized text; display the user's own spelling |
| L5 | Numbers spoken in local languages | H | Per-language number normalizers, T1, test set |
| L6 | Fifteen versus fifty style confusions | H | T1, price plausibility, T2 chips |
| L7 | Unsupported language or dialect | M | Detect; suggest typing or speaking a supported language; log for the roadmap |
| U1 | Debt direction ('Mama Ife owe me' versus 'I owe Mama Ife') | H | T4; if ambiguous, ask instead of guessing |
| U2 | Sold versus bought versus returned versus given free | H | Intent enumeration; card states the action in words |
| U3 | Several transactions in one sentence | M | Model returns a list of commands, one card each |
| U4 | Mixed payment ('she paid 5k, rest on credit') | H | Model returns the paid amount; code computes the debt |
| U5 | Self-correction ('no wait, four bags') | M | Last mention wins; explicit test cases |
| U6 | Missing fields | M | Show the field empty and orange; never guess |
| U7 | References like 'same as yesterday' | M | Unsupported in v1; ask. Later: a repeat-last-sale button |
| U8 | Relative dates ('Friday', 'last week') | M | Resolve in code against the phone date; show the resolved date; editable |
| U9 | A question, not an entry | H | Intent router sends it to the assistant; entries never write directly |
| U10 | 'Don't record that' | M | Intent 'cancel' discards the draft |

### 9.3 Register: catalogue, money, cost, ledger

| ID | Case | Sev | Solution |
| --- | --- | --- | --- |
| M1 | Item not in the catalogue | M | T5 new-product card |
| M2 | Near-duplicate products (Indomie 70g versus 120g) | H | Ask which; never auto-pick between close matches |
| M3 | Two products share an alias | M | Block the alias; force one choice, then learn it |
| M4 | Catalogue too large for the prompt | M | Send top items by recency and frequency; the device fuzzy-matches the rest from the mention |
| M5 | Pack versus piece versus carton | H | Unit conversion table; card shows the converted quantity |
| M6 | Unit price versus total confusion | H | Show both; check quantity times unit price equals total; ask on mismatch |
| M7 | '2k', '2.5k', 'two fifty', 'fifty' with no unit | H | Money normalizer in code; T2 chips |
| M8 | Price far from the last price | H | Plausibility flag beyond about 3x either way |
| M9 | Discounts, bargaining, change given | M | Capture the final price; derive the discount in code |
| M10 | Quantity above stock, or stock goes negative | M | Warn according to the shop's negative-stock policy |
| M11 | Currency other than naira, kobo | L | Naira whole numbers only in v1 |
| K1 | Cost missing | H | Profit shows 'cost missing on N items'; never treated as zero |
| K2 | Later cost edit rewrites old profit | H | T7 cost-at-sale snapshot; edits create new cost records |
| K3 | Staff changes cost to hide a shortage | H | Audit log with old value and actor; optional owner approval; staff digest |
| K4 | Cost jumps with inflation | M | F11 alert and margin at current price |
| K5 | Historical versus replacement cost | M | Show profit on what was paid and profit if restocked today |
| S1 | Double confirm, retry or sync replay | H | Idempotency key on every command |
| S2 | Same draft open on two devices | M | First confirmation wins; the other shows 'already confirmed' |
| S3 | Stock changed between draft and confirm | M | Re-validate at confirm time |
| S4 | A wrong draft was confirmed | H | One-tap reversal as a compensating entry |
| S5 | Confirmation hours after the event | M | Event time shown prominently and editable |
| S6 | Local data lost (iOS Safari tab unused for 7 days, browser eviction) | H | Install prompt; early and frequent sync; scheduled export; request persistent storage on Android |
| S7 | Two staff sell the last unit | M | Delta-merge ledger; flag negative stock |
| S8 | No Background Sync on iOS | M | Sync on the online event and on app open; main-thread queue |
| S9 | Device clock is wrong | M | Compare with server time on each sync; warn and correct event times |

### 9.4 Register: images, assistant, security, privacy, interface

| ID | Case | Sev | Solution |
| --- | --- | --- | --- |
| I1 | Blurry, dark or cropped photo | M | Quality check on device; ask for a retake |
| I2 | Handwriting, mixed languages | M | Draft cards with orange low-confidence fields |
| I3 | Unit price versus line total confusion on receipts | H | Check quantity times unit price equals total; flag mismatches |
| I4 | VAT, discounts and delivery fees as lines | M | Separate line types; ask where unclear |
| I5 | Pro-forma invoice or other currency | M | Detect and ask before creating restock drafts |
| I6 | Shelf photo used for counting | M | Label as estimate; never auto-confirm |
| I7 | Photo shows faces, phone numbers, account numbers | M | Strip metadata; delete after processing; never log image content |
| I8 | Text in the image tries to instruct the model | M | Output limited to the schema, no tools that write, human confirms |
| I9 | HEIC or very large files | L | Convert and resize on device |
| Q1 | Ambiguous period ('this week', 'last month') | M | Resolve in code from shop settings; show the date range in every answer |
| Q2 | Ambiguous item ('rice' matches three products) | H | Show all matches with a total, or ask; never pick silently |
| Q3 | Stale or unsynced data | H | T10: run on the local ledger; show 'as of' time and unsynced count |
| Q4 | Missing data (no cost, no sales, new item) | H | Say what is missing and offer to add it; never treat as zero |
| Q5 | Half-logged day | H | T9 completeness indicator |
| Q6 | Staff asks owner-only questions (profit, cash, other staff) | H | Role check inside every tool, not in the prompt |
| Q7 | Question about another shop's data | H | Shop id enforced in code in every tool; standalone deployments reduce exposure |
| Q8 | Names or notes containing instructions to the model | M | Tool results are data only; no write tools; templates build answers; escape output |
| Q9 | Compound questions | M | Several tool calls in one turn |
| Q10 | Follow-ups ('and yesterday?') | M | Keep the last tool and parameters for a few turns; show the new interpretation |
| Q11 | Voice question mis-heard | M | Show the interpreted question with tap to change |
| Q12 | Entry disguised as a question | H | Route to the draft flow; never write directly |
| Q13 | 'Why did sales drop?' | M | Return breakdowns by item, day and staff; label possible causes as things to check |
| Q14 | Advice that moves money (credit limits, prices, loans) | H | Show facts (payment history, cost change), no verdict; refuse tax and loan advice and point to a professional |
| Q15 | Profit or debts shown or spoken near customers | M | Text by default, balances hidden until unlocked, sensitive amounts muted in voice |
| Q16 | Very long lists | L | Top 10 with 'show more'; never read long lists aloud |
| Q17 | Vague question ('how business?') | L | Return the daily summary card |
| Q18 | Spam or loops | M | Per-shop rate limit; cache repeated answers |
| Q19 | Wrong answer | M | Thumbs-down with 'wrong number' feeds the golden set |
| Q20 | Model outage | M | Chips and templates still work with no AI |
| Q21 | Question about the app | L | Static help, not model memory |
| Q22 | Answer language differs from the question | L | Reply in the question's language; naira with thousands separators |
| X1 | API key leaked to the browser | H | Key lives on the server only |
| X2 | One shop floods the endpoint | H | Per-shop quotas and a global spend breaker |
| X3 | Staff fakes or hides sales by voice | H | Actor, audio and transcript retained; owner review feed; staff digest |
| X4 | Malformed or hostile model output | M | Schema validation, one retry, then manual entry |
| X5 | Provider outage or rate limit | M | Timeout, manual fallback, no data loss |
| X6 | Model deprecated or repriced | M | Model id in config; re-run the eval set before swapping |
| X7 | Forged or replayed requests | M | Signed user token, ULID de-duplication, server-side shop id |
| P1 | Customer names and debts are personal data sent abroad | H | Explicit consent; minimal data sent; consider device-side name matching; legal review |
| P2 | Provider uses data for training | H | Paid tier only (not used to improve products); re-check terms before launch |
| P3 | Provider retains logs about 55 days | M | Disclose plainly in the consent screen; no zero-retention option on this API |
| P4 | Audio retention versus dispute evidence | M | Default 14 days, owner can delete or extend |
| P5 | Shared phone exposes balances | M | PIN, hide-balances toggle, staff mode |
| P6 | Records of third parties (customers) | M | Collect the minimum; export and delete on request |
| E1 | Accidental hold-to-talk or double tap | M | Minimum 1 s, slide-to-cancel, double-tap guard, Undo |
| E2 | Bright sunlight, wet or dirty hands | M | High contrast, large targets, no gesture-only actions |
| E3 | Low-literacy user cannot read labels | M | Icon plus short label, numbers and colour, voice prompts in a later phase, hand-drawn first-run hints |
| E4 | Owner and staff share one device | M | Staff mode with limited screens and a personal PIN |
| E5 | Large system font breaks layouts | L | Test at the largest font; scroll only where unavoidable |
| E6 | Language switched mid-session | L | Apply immediately; no data affected |
| E7 | Entries lost when the phone dies or is replaced | H | Early sync, cloud account restore by phone number and PIN, scheduled export |
| E8 | The user stops trusting the AI after a few errors | H | Track zero-edit rate; fix top failure classes weekly; keep manual entry equally fast |

## 10. Assistant specification

### 10.1 What owners ask \[Hypothesis; replace with interview data\]

Derived from Nigerian SME pain points, standard retail reports and first principles. Examples are in English with a Pidgin flavour.

| Category | Example questions | Tools |
| --- | --- | --- |
| Stock now | How many bags of rice do I have? Wetin dey finish? | get\_stock, list\_out\_of\_stock |
| Restock | What is running low? How many days till rice finishes? What should I buy this week? | list\_low\_stock, days\_of\_stock, reorder\_suggestions |
| Sales | How much did I sell today? This week against last week? Which item sells most? | sales\_summary, top\_products, sales\_by\_staff |
| Profit | Did I make profit this week? Am I selling anything below cost? | profit\_summary, margin\_by\_product |
| Debts owed to me | Who owes me? How much does Mama Ife owe? Who should I remind? | debtors, debtor\_balance, debt\_ageing |
| Debts I owe | How much do I owe suppliers? | creditors |
| Money in and out | Cash against transfer today? Transport spend this month? | cash\_flow, expenses\_summary |
| Suppliers | What did I pay for garri last time? | supplier\_last\_price |
| Dead stock | What no dey sell? How much money is stuck in stock? | slow\_movers, stock\_value |
| Staff and shrinkage | Which adjustments this week? Anything missing? | stock\_adjustments, variance\_after\_count |
| Entries, actions, help | Entries go to the draft flow; reminders and cancels become drafts; help comes from static pages | Routing only |

**v1 scope:** stock now, restock, sales, debts both ways, dead stock, and profit with a stated definition. Customers, trends and actions wait for evidence from the question log. Tax, loans and legal questions are refused politely.

### 10.2 Metric definitions to fix before building

| Metric | Decision | Suggestion \[Opinion\] |
| --- | --- | --- |
| Today, this week | Day end and week start | Shop setting; default midnight and Monday; shown in every answer |
| Sales | Do credit sales count when booked or paid? | Show Sold and Collected separately; debt payments are never sales |
| Profit | Which cost? | Show profit on what was paid, and profit if restocked at today's cost |
| Owner drawings | Personal use of stock or cash | Separate category, excluded from expenses |
| Days of stock | Stock divided by average daily sales | Count only open days and in-stock days |
| Slow mover | Threshold | Relative to the shop's own sales pace |
| Stock value | Cost or selling price | Show cost, offer selling price |
| Debt ageing | Buckets | 0 to 7, 8 to 30, 31 and more days, adjustable |

### 10.3 Answers, chips and the daily summary

- **Answer format:** large number, one line, 'See how', interpretation line. Templates exist in each supported language; a model rephrases only when no template fits.
- **Chips** call the same tools directly and work offline.
- **Daily summary** (sent at the shop's closing time through free web push, also shown in the app): sold, collected, new debts, top three items, items low, unsynced entries. Web push on installed iPhone apps needs iOS 16.4 or newer and is not available in the EU, so also show it in the app.
- **Morning restock list:** items expected to finish in the next few days at the current pace.
- **Debt nudges:** who to remind today, with a one-tap WhatsApp draft.

## 11. Test and evaluation plan

**Datasets**

| Set | Contents |
| --- | --- |
| Voice | 100 real recordings from 10 or more traders (Pidgin, Yoruba, Hausa, Igbo, English mixes, real noise, cheap phones) plus 50 deliberately hard ones (numbers, self-corrections, mixed payments, debt direction) |
| Images | 50 supplier receipts and 20 notebook pages |
| Questions | 200 real or realistic owner questions in the five languages plus 50 adversarial ones (ambiguity, missing data, injection, out of scope, entries disguised as questions) |

**Proposed go or no-go thresholds \[Opinion; adjust after the first pilot\]**

| Measure | Threshold |
| --- | --- |
| Zero-edit confirm rate, clean audio | At least 85% |
| Zero-edit confirm rate, noisy audio | At least 70% |
| Debt-direction errors in the hard set | Zero |
| Ungrounded numbers reaching a card | Zero |
| Correct tool and parameters on the top ten question types | At least 90% |
| Correct refusal of out-of-scope questions | At least 95% |
| Numbers in answers not traceable to a tool result | Zero |
| p95 latency for a voice entry on 3G | Under 8 seconds |
| Receipt lines correct without edit | Measure first, then set |

**Method**

1. Run the three model candidates (section 7) on the same sets.
2. **Shadow mode** for two weeks: the AI drafts, the owner keeps entering manually, you compare.
3. **Golden set:** every corrected draft, with consent, joins the evaluation set. Any model or prompt change must beat the previous version on it before shipping.
4. **Red team:** prompt injection through names and notes, role bypass, cross-shop access, quota flooding.
5. **Business metrics:** entries per active shop per day, retention of owners who use the summary or assistant versus those who do not, share of drafts confirmed without edits, cost per confirmed entry.
6. **Interface tests** per section 6.9, in parallel.

## 12. Rollout and exit criteria

1. **Phase 0, prerequisites (section 3).** Exit: all P-items done and tested, including cost-at-sale and reversals.
2. **Phase A, no AI.** Starter catalogue, chips, daily summary, export. Exit: first sale within 3 minutes for 4 of 5 new owners; at least half open the summary on most days during a two-week trial.
3. **Phase B, voice and typed entry and the typed assistant.** Shadow mode, then 5 to 10 pilot shops. Exit: thresholds in section 11 met in the pilot.
4. **Phase C, new products, alias learning, cost alerts, debt recovery, completeness indicator.** Exit: duplicate products near zero; owners act on cost alerts.
5. **Phase D, voice questions, local-language templates, receipt and notebook import, voice onboarding, close-shop, staff digest.** Exit: receipt accuracy threshold set and met.
6. **Phase E, receipts to WhatsApp, supplier messages, offline voice inbox if justified.** Exit: pilot data shows the need.
7. **Phase F, earned autonomy.** Only for shops that clear the bar; opt-in with undo.

## 13. Privacy, legal and security checklist

Not legal advice. Have a Nigerian data protection lawyer review before the pilot.

- Nigeria's Data Protection Act 2023 and the 2025 implementation directive restrict transfers of personal data abroad without adequacy, an approved mechanism or another lawful basis, and require explicit consent for some transfers. Customer names, debts, voices and photos count as personal data. \[Verified in law-firm summaries\]
- The Gemini paid tier is not used to improve Google products, but prompts and responses are logged for about 55 days for abuse checks, may be processed in any country, and have no zero-retention option on this API. Free tier data is used to improve products and may be read by humans. \[Verified; recheck the live terms\]
- Consent screen in plain language, in the user's language: what is sent, where, for how long, how to delete.
- Send the minimum: no phone numbers or account numbers; test device-side name matching; strip image metadata.
- Retention defaults: audio 14 days, images deleted after processing, owner-controlled deletion and export.
- API key on the server only; signed user tokens; per-shop quotas; spend breaker; shop id enforced in every tool and route.
- Roles, PIN, hidden balances, staff mode, audit log for cost edits, voids and adjustments.
- No logging of audio, images or amounts in application logs.
- Per-client standalone deployments let enterprise clients choose a region or provider later.

## 14. Open questions and the next 14 days

**Not verified:** real owner interviews and question logs; Vendoor's actual features; accuracy of the default model on Pidgin and Yoruba trader speech; receipt-photo cost; whether template answers in Yoruba, Hausa and Igbo read naturally; whether Vertex AI offers a useful residency option; current model prices.

**Questions for you:** which of P1 to P20 already exist in Ojapadi? Is cost pre-filled or blank on the restock page? Who is the first paying customer: a single trader or a larger shop?

**Next 14 days**

1. Days 1 to 5: interview 15 owners across shop types (what they wish they knew yesterday, how they record today, what they ask their assistant); record 100 voice clips; tag 200 Play Store reviews each for Kippa, Vendoor, Bumpa.
2. Days 1 to 3: write the metric glossary and decide the profit definition; have native speakers review the Pidgin strings.
3. Days 4 to 8: build a clickable prototype of Sell, capture sheet, draft card and Money chips; test with five owners on a 2 to 3 GB phone.
4. Days 6 to 10: build Phase A (chips, summary, export) on existing reports.
5. Days 9 to 12: run the three model candidates on the voice set and score them.
6. Days 13 to 14: review results, set thresholds, decide whether Phase B starts now or after more prerequisites.

## 15. Assistant page template and data readiness

I have not seen the Ojapadi code, so this section is a template. Every page is described with the same fields, so you or your coding agent can fill the gaps from the real code, and the assistant behaves the same way on every page.

### 15.1 Page template (one per page)

| Field | What to write |
| --- | --- |
| Page id | A stable string, for example dashboard, sales, product\_detail |
| Purpose | One sentence |
| Data the page owns | Entities it reads or writes |
| Context sent to the assistant | Structured values, never free text: page id, selected entity id, date range, user role, language, shop settings, sync status |
| Suggestion chips | Three or four, short, translated, ranked. All chips live in one data-driven registry so adding a page means adding one entry |
| Tools available | A subset of the tool registry (section 10.1) |
| Drafts it may create | Command types only; never direct writes |
| Permissions | Owner or staff |
| Low-data behaviour | What the assistant says when data is thin or missing |
| Readiness checks | The data that must exist before each chip appears |

Rule: a chip whose data is not ready is **hidden**, not shown and then failing.

### 15.2 Pages: chips, tools, drafts and required data

Chip wording is a starting point; translate and test it. Page names follow your current navigation.

| Page | Suggestion chips | Tools | Drafts it can create | Data that must exist |
| --- | --- | --- | --- | --- |
| Dashboard | Who owes me? What is low? How did I do today? Open my Inbox | sales\_summary (today), debtors (top), list\_low\_stock, top\_products | Any command type | Sales with event time, debts per contact, stock levels, day-end setting |
| Sales | Record a sale. Sold on credit to... Cancel last sale. Today's sales | sales\_summary, get\_stock, last\_price | Sale, payment received, reversal | Catalogue with units and prices, contacts with aliases, payment methods, idempotent sale command |
| Products (list) | What is low? What no dey sell? Stock value. Add a new product | list\_low\_stock, slow\_movers, stock\_value | New product, stock adjustment | Product ids, units, stock movements, cost records |
| Product detail | How long will this last? What did I pay last time? Profit on this? | days\_of\_stock, supplier\_last\_price, margin\_by\_product | Restock, adjustment, price change | Cost records, sales history, supplier link |
| Add stock | Say the delivery. Snap the receipt. What did I pay last time? | supplier\_last\_price | Restock lines with optional cost | Suppliers, units and pack sizes, cost history |
| Reports | Compare with last week. Best sellers. Profit. Cash against transfer | sales\_summary (period), profit\_summary, cash\_flow | None (read only) | Expenses, cost-at-sale snapshot, owner drawings, shop settings |
| More: Contacts and Debts | Who owes me? Who should I remind today? How much do I owe suppliers? (contact name) balance | debtors, debtor\_balance, creditors, debt\_ageing | Payment, new contact, reminder draft | Contacts with aliases and direction, payments, ageing, promise dates |
| More: Expenses | Add an expense. Transport spend this month | expenses\_summary | Expense, owner drawing | Expense categories, drawings category |
| More: Staff (owner only) | Who recorded these sales? Adjustments this week | sales\_by\_staff, stock\_adjustments | None | Actor id on every entry, roles |
| More: Settings | Change language. When does my day end? | None (help only) | Settings change (confirmed) | Shop settings |
| More: Export and backup | Export my data. When was my last backup? | None | Export job | Export format, last backup time |
| Inbox (inside the sheet) | Confirm all. What did I say? Remove this | None | Confirms or discards drafts | AI drafts, validator flags |

### 15.3 Context object and chip registry

The sheet reads one object from the current page and sends it with every request:

| Field | Example |
| --- | --- |
| page\_id | product\_detail |
| entity | product id selected on screen, or none |
| range | the date range the page is showing |
| role | owner or staff |
| language | pcm, en, yo, ha, ig |
| settings | timezone, day end, week start, negative-stock policy |
| sync | last sync time and unsynced count |

The chip registry is a single file of entries, each with: page id, chip id, translated labels, required data checks, tool to call, and rank. Adding a page or chip must not require touching assistant code.

### 15.4 Data contracts: what must exist before the AI layer

Field names are suggestions. What matters is that each concept exists, is stored exactly once, and follows the rule in the last column.

| Entity | Required fields | Rule |
| --- | --- | --- |
| Product | id (ULID), name, base unit, sellable units with factor to base, sell price per sellable unit, active, created and updated time, deleted time | IDs never reused; soft delete only |
| Alias | id, entity type, entity id, original text, normalized text, source (user or AI correction) | Unique per shop on normalized text; ambiguous aliases blocked |
| Stock movement | id, product id, quantity change in base unit, reason (sale, restock, adjustment, reversal, count), reference id, event time, recorded time, actor, reverses id, command id | Append-only; stock equals the sum of movements; a reversal points at the original |
| Sale and lines | sale id, event time, actor, contact id, payment method (cash, transfer, POS, credit), lines (product, quantity and unit, unit price, line total, unit cost at sale), total, amount paid, command id | Debt equals total minus paid, computed; cost snapshot stored at sale time |
| Restock and lines | id, supplier id, event time, lines (product, quantity, unit, unit cost optional), amount paid, command id | Cost may be blank but must be flagged |
| Cost record | product id, supplier id, unit cost per base unit, effective time, source (restock or manual edit), actor, previous record id | Edits add a record, never overwrite |
| Contact | id, name, type (customer, supplier, both), phone optional, opening balance with direction, created time | Aliases live in the alias table |
| Money entry (debt or payment) | id, contact id, amount, direction (they owe me, I owe them), kind (credit sale, credit purchase, payment received, payment made, adjustment), reference id, event time, actor, promise date optional, command id | Balance is derived, never typed in |
| Expense | id, category, amount, event time, actor, note, owner-drawing flag | Drawings excluded from profit calculations |
| Count or adjustment | product id, expected, counted, variance, reason, actor, time | Variance feeds shrinkage questions |
| User | id, role (owner or staff), PIN hash, active | Role checked in code |
| Shop settings | timezone (default Africa/Lagos), day end, week start, language, currency, negative-stock policy, AI enabled, consent version and time | One function resolves 'today' and 'this week' |
| AI input | id (ULID), source, audio or image reference, transcript, language guess, event time, status, retain-until | Deleted on schedule or on request |
| AI draft | id, input id, commands, validator flags, status (pending, confirmed, discarded, failed), model, prompt version, schema version, latency, cost estimate, confirmed by and time | Never touches the ledger until confirmed |
| Question log (opt-in) | id, question text, tool called, outcome, thumbs up or down | No amounts stored |
| Audit log | id, actor, action, entity, old value, new value, time | Append-only |
| Sync metadata | per record: sync state, server revision, last synced time, device id | Exposed to the UI |

**Money:** integers in the smallest unit (kobo), never floating point. **Quantity:** stored in the base unit, displayed in the sellable unit.

### 15.5 Readiness gate (pass or fail before any AI work)

1. Every entity in 15.4 exists, with the stated rule enforced in code, not only in the UI.
2. Every write in the app goes through one command function (`executeCommand`).
3. Replaying all stock movements from zero reproduces the current stock for a sample shop.
4. Replaying money entries reproduces every contact balance.
5. Reversal works for sales, restocks and payments and leaves the originals visible.
6. The same command sent twice changes nothing the second time.
7. A sale made offline and synced later lands on its event date.
8. Editing a cost does not change profit on past sales.
9. Aliases can be added and an ambiguous alias is refused.
10. Roles block owner-only screens and tools in code.
11. Export produces a file that can be restored into an empty shop.
12. Each page above has a filled template and chips whose readiness checks pass.
13. Every report in 15.6 is listed in the report inventory, and each assistant tool returns exactly the figure its report shows.

### 15.6 Reports (part of the assistant plan)

The Reports page stays as it is. The assistant never replaces a report. It explains, compares, drills into and shares reports, and it must always agree with them.

**Report inventory template** (one row per existing report, filled from the code):

| Field | What to write |
| --- | --- |
| Report name | As shown in the app |
| Question it answers | One sentence an owner would ask |
| Data sources | Entities from 15.4 |
| Metric definitions | Which definitions from 10.2 it uses |
| Period and filters | Defaults and options |
| Permission | Owner or staff |
| Export or share | CSV, PDF, WhatsApp text, none |
| Matching assistant tool | Name from the tool registry |
| Status | Done, partial, missing |

**Standard report set to confirm exists** (the assistant's tools sit on these):

| Report | Core measures | Assistant tool |
| --- | --- | --- |
| Sales summary | Sold and collected by day, week, month; by item, staff and payment type | sales\_summary, top\_products, sales\_by\_staff |
| Profit | Profit on what was paid and profit at today's cost; items with cost missing | profit\_summary, margin\_by\_product |
| Stock | Current stock, low stock, stock value, slow movers, days of stock | get\_stock, list\_low\_stock, stock\_value, slow\_movers, days\_of\_stock |
| Debts | Owed to me, I owe, ageing, promise dates | debtors, creditors, debt\_ageing |
| Cash flow | Cash, transfer and POS in and out | cash\_flow |
| Expenses | By category, owner drawings shown separately | expenses\_summary |
| Adjustments and variance | Stock adjustments, count variance, voids, cost edits | stock\_adjustments, variance\_after\_count |
| Price and cost history | Cost and selling price over time, supplier comparison | supplier\_last\_price |

**What the assistant does with reports**

1. **Explain this report:** summarizes the report on screen in a template, for example 'Sales ₦X, up 12% on last week. Best seller: Rice.'
2. **Compare periods:** runs the same tool for two date ranges ('compare with last week').
3. **Drill down:** 'See how' opens the entries behind any number.
4. **Find a report:** 'Where do I see profit?' opens the right report with the right filters.
5. **Share:** prepares a WhatsApp text or a CSV as a draft; nothing is sent until the owner confirms.
6. **Warn about data quality:** completeness indicator, 'cost missing on N items', unsynced entries.

**Rules**

- **Report parity:** the assistant tool and the report call the same function, and a test asserts that both return the same figure for the same period.
- When the assistant opens from the Reports page, it inherits that page's date range and filters through the context object (15.3).
- Reports are read-only for the assistant. Owner-only reports (profit, staff) enforce the role in code.
- Any report without a matching tool is listed as a gap and does not appear as a chip.

## 16. Engineering standards

&#91;Standard\] means widely used industry practice. The way each one is applied to Ojapadi is my recommendation.

### 16.1 Data engineering standards

| ID | Standard | How to apply it |
| --- | --- | --- |
| D1 | Single source of truth: an append-only ledger of changes, with balances and stock derived from it \[Standard\] | Never store a typed-in balance or stock figure as truth. Keep projections rebuildable and test by replay (readiness gate items 3 and 4) |
| D2 | Stable identifiers generated on the client \[Standard\] | ULIDs for every record; never reuse; natural keys such as product name are never ids |
| D3 | Time discipline \[Standard\] | Store UTC event time, recorded time and device offset; the shop timezone lives in settings; one function resolves day and week boundaries |
| D4 | Money as integers in the smallest unit \[Standard\] | Kobo as integers, currency code stored, one rounding rule in one module |
| D5 | One base unit per product \[Standard\] | Quantities stored in the base unit; conversions from a table; display converts back |
| D6 | Versioned schema and migrations \[Standard\] | Version the local database and the server schema; test migration from every earlier version using sample data; never ship a migration without a rollback note |
| D7 | Idempotency \[Standard\] | Unique command id enforced by the local store and the server; retries and replays are safe |
| D8 | No hard deletes \[Standard\] | Soft delete or reversal entries; audit log records who and when |
| D9 | Data contracts shared by client and server \[Standard\] | One schema library (for example Zod) defines commands, tool results and AI output; contract tests fail the build on drift |
| D10 | Automated data quality checks | On sync and nightly: negative stock, orphan references, sales with no cost, duplicate aliases, contacts with impossible balances; show results to the owner as 'needs attention' |
| D11 | Sync design | Per-record sync state; ordered queue with retry and backoff; ledger rows are append-only so conflicts cannot overwrite money; last-write-wins only for non-financial fields such as names; expose sync status in the UI |
| D12 | Personal data classification | Tag fields as personal (names, phone numbers, debts, voice, photos); retention schedule; deletion removes data from drafts, evaluation sets and backups on request; no personal data in logs |
| D13 | Backups and exports that are tested | Restore into an empty shop monthly; export format is documented and versioned |
| D14 | Event telemetry without content | Count drafts, confirms, reversals and fallbacks; never log amounts, names or audio |

### 16.2 AI engineering standards

| ID | Standard | How to apply it |
| --- | --- | --- |
| E1 | The model is a component, not an authority | Deterministic code decides money, stock and permissions; the model only proposes commands, routes questions and phrases fallbacks |
| E2 | Structured output with validation \[Standard\] | Enforce a schema at the provider and again in code; on failure, one retry; repair prompts may never change numbers |
| E3 | Least privilege and limited agency \[Standard\] | The model can call read-only tools or create drafts. No tool writes the ledger, sends messages or changes settings without a human confirm |
| E4 | Prompts are code \[Standard\] | Stored in the repository, versioned, reviewed in pull requests, each tied to an evaluation run; the prompt version is saved on every draft |
| E5 | Evaluations gate every change \[Standard\] | Golden sets in CI; a change ships only if it matches or beats the last version on every slice (language, noise level, command type); keep a held-out set that is never used to tune prompts |
| E6 | Provider abstraction | A thin adapter hides the provider; the model id, parameters and fallback chain live in configuration; a per-shop feature flag and a global kill switch exist |
| E7 | Reproducibility | Low temperature; record model, version, parameters, prompt version and schema version for each call |
| E8 | Context engineering | Compact catalogue lines, ranked by recency and frequency, with a token budget; stable text first for caching; send only what the task needs |
| E9 | Observability | One trace per request: id, latency, tokens, estimated cost, model, prompt version, validator outcomes. Track zero-edit rate, validator-fail rate, fallback rate, p50 and p95 latency, cost per confirmed entry |
| E10 | Human-in-the-loop contract | Every AI result is a draft; show the interpretation; confirm to write; reversal to undo |
| E11 | Abuse and cost control | Quotas, rate limits, size limits, a spend breaker, and cached answers for repeated questions |
| E12 | Graceful failure | Timeouts, a circuit breaker, and manual entry always available and equally fast; the app works if the AI is off |
| E13 | Feedback loop | Corrections become aliases and price hints; with consent, corrected drafts join the golden set; review failures weekly |
| E14 | Consent and retention | Consent version stored with each user; audio and images retained for the shortest useful time; none of your data is sold or used to train your own models without a new consent |
| E15 | Fairness across languages | Report accuracy per language and per accent group; do not ship a language below the threshold even if the average passes |

### 16.3 Known risks for model-based apps and the control for each

The OWASP project publishes a list of top risks for applications built on language models. The ones that matter here, as I recall them (check the current list):

| Risk | Control in this design |
| --- | --- |
| Prompt injection (through names, notes, receipts) | Tool results are data; no write tools; schema-limited output; human confirm |
| Improper output handling | Escape all model text before display; never execute model output; validate against schemas |
| Excessive agency | E3: read-only tools and drafts only |
| Sensitive information disclosure | Minimal context sent, shop id enforced in code, no cross-shop data in prompts |
| Unbounded consumption | E11 quotas, size limits, spend breaker |
| Misinformation (confident wrong answers) | Templates built from tool results, completeness indicator, 'cost missing' states |
| Supply chain (models, libraries) | Pin versions, review dependencies, re-run evaluations on every model change |

### 16.4 Implementation blueprint

| Layer | Responsibility | Rule |
| --- | --- | --- |
| domain | Money, units, commands, ledger rules, validators, number normalizers | Pure code, no framework or network; unit-tested heavily |
| data | Local store, repositories, sync queue, migrations | Only this layer touches storage |
| ai | Provider adapter, prompts, schemas, output validators | Stateless; cannot import the data layer for writes |
| assistant | Tool registry, question router, templates, page context, chip registry | Tools are read-only and run on the device |
| ui | Assistant sheet, draft cards, chips, screens | No business rules; calls `executeCommand` and tools only |
| server | Upload endpoint, transcoding, quotas, consent records, usage metering | Holds the provider key; enforces shop id and role |

**One write path:** every write, manual or AI, goes through `executeCommand(command)`, which validates, checks idempotency, writes ledger rows, writes the audit entry and returns a result.

**Tool registry contract** (each tool declares):

| Field | Meaning |
| --- | --- |
| name and description | What the model sees |
| input schema | Typed parameters with enumerations where possible |
| permission | Owner or staff |
| executor | Runs on the device against the local ledger |
| result shape | Values, resolved period, as-of time, unsynced count, completeness flags |
| template ids | Answer templates per language |
| pages | Where the tool may appear as a chip |
| readiness check | Data that must exist for the tool to be offered |

### 16.5 Testing pyramid

| Level | What it covers |
| --- | --- |
| Unit | Money, units, number normalizers, validators, ledger reducers; property tests for rounding and unit conversion |
| Contract | Client and server share schemas; AI output schema; tool result shapes |
| Integration | Command path, sync queue and migrations with a mocked model that replays recorded responses |
| Evaluation | Golden voice, image and question sets scored against section 11 thresholds |
| End to end | Offline sale, reconnect and sync; draft, confirm and reverse; role restrictions; run nightly against the real model on a small set |
| Device | 2 to 3 GB phone, Android 10, 11 and 13, throttled network, sunlight, large font |

### 16.6 Definition of done for any AI feature

1. Passes the readiness gate for the data it uses.
2. Writes only through `executeCommand` after a human confirm.
3. Schema, prompt version and model are recorded on every draft.
4. Evaluation thresholds met on every language slice.
5. Failure paths tested: model off, timeout, bad JSON, quota exceeded, offline.
6. Cost per confirmed entry measured and within budget.
7. Consent text, retention and deletion tested.
8. A kill switch and a per-shop flag exist.
9. Chips and tools appear only where their readiness checks pass.

## 17. Codebase audit (run this in your coding agent)

Use this prompt in Antigravity or any agent that can read the repository. It produces the gap list I could not build without the code.

**Prompt:**

'Audit this repository against the checklist below. Do not change any code. Use targeted searches and file ranges; do not paste whole files. For each item return a table row with: status (done, partial, missing), evidence (file path and line range), the gap, risk (high, medium, low) and effort (S, M, L). Checklist: (1) catalogue with ids, base unit and unit conversions; (2) alias support for products and contacts; (3) cost records and cost stored on each sale; (4) cost-edit audit trail; (5) contacts and debts: direction, partial and over-payments, nickname field; (6) one command function for every write; (7) reversal entries instead of edit or delete; (8) idempotency keys; (9) event time separate from recorded time; (10) draft or pending state; (11) stock adjustments with reasons, negative-stock policy, stock count; (12) expenses and owner drawings; (13) roles and actor on every entry; (14) export, backup and restore; (15) storage safety and sync status in the UI; (16) shop settings (timezone, day end, week start, language); (17) money stored as integers; (18) schema versioning and migrations; (19) shared schemas between client and server; (20) a per-page list of which data each page reads and writes; (21) an inventory of every existing report with its name, data sources, metric definitions, period and filters, permission and export options, and whether the assistant and the report share one calculation function. Finish with the five highest-risk gaps and a proposed build order.'

Run this in parallel with the work in sections 18 to 20. The plan does not wait for it; its output turns the build order in section 20 into dated tasks.

## 18. Prerequisites that must be met

These are the conditions under which an AI feature is allowed to ship. They consolidate sections 3, 15 and 16. If one is unmet, build it first.

### 18.1 Tier 0: blockers for every AI feature

| # | Must be true | Why |
| --- | --- | --- |
| 1 | One write path (`executeCommand`), an append-only ledger, and reversal entries instead of edit or delete | Lets a wrong AI draft be undone without damaging records |
| 2 | Client-generated ULIDs and idempotency keys on every command | Retries, double taps and sync replays cannot double count |
| 3 | Money stored as integers; one base unit per product with a conversion table | Removes rounding and pack-size errors |
| 4 | Event time separate from recorded time; timezone, day end and week start in settings | 'Today' and late syncs are correct |
| 5 | Cost records, cost stored on each sale, cost edits audited | Profit stays true after edits; staff cannot hide shortages |
| 6 | Contacts and debts with direction, partial and over-payments, and aliases | Debt sentences and name matching work |
| 7 | Roles, actor on every entry, permissions enforced in code, audit log | Owner-only data stays owner-only |
| 8 | Export, backup and restore tested end to end | Trust and recovery |
| 9 | Shared schemas between client and server with contract tests; versioned migrations | Changes cannot silently break data |
| 10 | Draft state held outside the ledger | AI output cannot touch stock until confirmed |
| 11 | Reports and assistant tools share one calculation function, with parity tests | The assistant never disagrees with a report |
| 12 | Consent screen, paid-tier model access, data minimization, lawyer review done | Legal and trust |
| 13 | Evaluation harness and golden sets running in CI | No model change ships unmeasured |
| 14 | Kill switch, per-shop flag, quotas and a spend breaker | One bad day cannot become a large bill or an outage |

### 18.2 What each phase also needs

| Phase | Additional conditions |
| --- | --- |
| A (no AI) | Starter catalogue, quick-question chips, tool registry running on the device, daily summary, export, sync status, storage safety on iPhone |
| B (entry and typed assistant) | All Tier 0 items; audio pipeline (transcoding, upload limits, retries); consent and quotas; manual fallback as fast as voice; draft cards and Inbox; tracing and metrics; shadow-mode instrumentation |
| C | Expenses and owner drawings, stock count and variance, alias learning, cost-history data for alerts, debt ageing and promise dates |
| D | Native-speaker review of every language string; image pipeline; automated data quality checks |
| E and later | Decisions from the research items R10, R13 and R15 (section 19) |

## 19. Areas not yet covered: research tasks for the agent

These are things I did not take into account, or only touched lightly. Each needs research before building. The agent should follow this protocol.

### 19.1 Research protocol

1. State the decision to be made in one sentence.
2. Compare at least three options, including 'do nothing'.
3. Use primary sources (official documentation, regulations, papers, vendor terms) and note the date of each. Flag conflicting sources.
4. Test on the target device class: a 2 to 3 GB RAM Android phone, Android 10 or newer, throttled 3G.
5. Estimate monthly cost per shop in naira.
6. Check Nigerian legal and regulatory fit.
7. Build a proof of concept of one day or less where possible.
8. Write a decision record: context, options, criteria, evidence, decision, risks, date to revisit.
9. Never adopt a model or library without passing the evaluations in section 11.
10. State what is uncertain.

### 19.2 Research backlog

| # | Area | Why it matters | Research question | Output |
| --- | --- | --- | --- | --- |
| R1 | Data protection compliance | Customer names, debts, voices and photos are personal data | What do the NDPA and the 2025 directive require: registration, impact assessment, processor agreements, breach notice, consent records? | Compliance checklist for a lawyer to review |
| R2 | Data residency and model hosting | Paid API data may be processed in any country with no zero-retention option | Does a regional or enterprise offering, or a self-hosted speech model, give a better data position at acceptable cost? | Option comparison with cost and accuracy |
| R3 | Nigerian-language speech quality | The whole voice feature depends on it | Which model or vendor is best on our recordings per language, accent and noise level? | Benchmark report and language support matrix |
| R4 | Spoken answers (text-to-speech) | Helps low-literacy and low-vision users | Is there an affordable, good-quality voice for Pidgin, Yoruba, Hausa and Igbo, and can it work offline? | Recommendation and cost |
| R5 | Multi-device and multi-staff sync | Owner and staff may both work offline | Delta ledger versus other conflict methods; clock skew handling; library options | Design note and test plan |
| R6 | Standalone deployment operations | Each client is isolated | How to roll out updates, migrations, prompt and model versions, keys and metering across deployments, and monitor quality without moving client data | Operations playbook |
| R7 | Security hardening | The phone holds the shop's records | On-device encryption, device theft and remote wipe, PIN brute-force limits, SIM-swap recovery, session handling, staff permission model | Threat model and controls |
| R8 | Reliability and monitoring | Self-hosted backends fail | Uptime targets, backups, alerts, incident response, rate limiting, cost alerts | Runbook |
| R9 | Low-end device performance | 2 to 4 GB phones are common | How does the local database behave at about 5,000 products and 50,000 ledger rows; memory, workers, service worker updates, bundle size | Measured results against the budgets in 6.1 |
| R10 | Notifications | Daily summary and reminders depend on them | Reliability of web push on Tecno, Infinix and Itel battery management; WhatsApp Business costs, templates and policy | Channel recommendation per feature |
| R11 | Barcodes, printing, scales | Retail speed and trust | Camera barcode scanning in a PWA, Bluetooth and USB receipt printers, weighing scales | Feasibility and cost |
| R12 | Segment-specific needs | Pharmacies, phone shops, fabric and foodstuff differ | Batch and expiry (pharmacy), serial numbers (phones), length and weight units, variants, bundles, wholesale and retail price tiers, supplier returns, consignment | Requirements per segment, ranked by frequency |
| R13 | Payments and transfers | Owners confirm transfers constantly | Verifying bank transfers, POS reconciliation, payment provider integrations | Scope recommendation |
| R14 | Tax and invoicing | Some shops need compliant receipts | VAT thresholds, e-invoicing rules, receipt content | What to support and what to disclaim |
| R15 | Import and migration | Switching cost decides adoption | Excel and CSV import, notebook photo import, importing from other apps including former Kippa users where exports exist | Import specification and test files |
| R16 | Pricing and unit economics | The AI tier must pay for itself | Price versus measured cost per active shop; quota design | Pricing options with ranges |
| R17 | Analytics without personal data | You need product metrics without surveillance | Event design, offline batching, small-cohort experiments | Event specification |
| R18 | Support and onboarding | Many users need hands-on help | In-app help, WhatsApp support, field onboarding agents, training material in local languages | Onboarding playbook |
| R19 | Legal documents | Liability and consent | Terms of service, privacy policy, liability for AI errors, status of audio as evidence | Drafts for lawyer review |
| R20 | Model continuity | Models get repriced and retired | Second provider, open-weight fallback, quarterly re-evaluation of newer models | Continuity plan |
| R21 | Accessibility | Low vision, colour blindness, hearing | Screen reader support, font scaling, contrast, alternatives to voice | Checklist per screen |
| R22 | Forecasting and reorder quality | Restock suggestions can mislead | Simple methods (moving averages, seasonality flags) and how to test them | Algorithm options and evaluation |
| R23 | Training data ethics | Collected audio is valuable | When and how to use consented audio for fine-tuning, anonymization, ownership | Policy |
| R24 | Fraud and abuse beyond staff | Fake receipts, collusion, shared accounts | Controls and detection signals | Control list |

## 20. Default build order

Sequenced by dependency, not by effort, because I have not seen the code. Work packages 6 and 7 can start in parallel with 2 to 4 once work package 1 is done.

1. **WP0, decisions.** Costing method, day end, profit definition, native-speaker review of strings, lawyer engaged.
2. **WP1, foundations.** Domain module (money, units, ids), single command path, idempotency, reversal, event time, shop settings.
3. **WP2, data model upgrades.** Cost records and cost on sale, expenses and drawings, adjustments and counts, aliases, contacts and debts upgrades, roles and audit log.
4. **WP3, safety net.** Export, backup, restore, sync status, storage safety, data quality checks, migration tests.
5. **WP4, reports and tools.** Report inventory, shared calculation functions, tool registry on the device, parity tests.
6. **WP5, assistant shell without AI.** Header Ask button, Dashboard floating button, bottom sheet, chip registry, chips calling tools, templates in English and Pidgin, daily summary. This ships value with no model cost.
7. **WP6, AI backend.** Endpoint, transcoding, consent, quotas, metering, provider adapter, kill switch, tracing.
8. **WP7, evaluation harness.** Golden voice and question sets, CI gates, model benchmark, model decision.
9. **WP8, voice and typed entry.** Capture, draft cards, Inbox, validators and number grounding, direction-safe cards, shadow mode, pilot.
10. **WP9, typed assistant router** with the first 8 tools, then voice questions.
11. **WP10, Phase C features:** new-product drafts, alias learning, cost alerts, debt recovery, completeness indicator.
12. **WP11, images:** receipts, notebook pages, voice onboarding.
13. **WP12, languages:** Yoruba, Hausa and Igbo templates and voice, after native-speaker review.
14. **WP13, growth features:** WhatsApp receipts, supplier messages, close-shop, staff digest, and the offline voice inbox only if pilot data justifies it.

The research tasks in section 19 feed these packages: R1, R2 and R19 before WP6; R3 before WP7; R5 and R9 before WP2 and WP3; R6 before the pilot; R10 before WP5's daily summary goes beyond in-app.

## Sources

- Orange Group and KPMG, Nigeria Smartphone Study 2025 (arise.tv and brandspurng.com coverage); StatCounter Android version share, Nigeria, June 2026; retail and press phone listings (techcabal.com, kara.com.ng).
- Microsoft Research: Medhi and colleagues on text-free and low-literacy interfaces (ToCHI 2011, ITID 2007, CHI 2009).
- OkCredit and Khatabook: yourstory.com, kr-asia.com, thelogicalindian.com, Mixpanel case study, netcorecloud.com, an independent Khatabook redesign case study.
- Google: Gemini API audio documentation (32 tokens per second, 20 MB inline limit, supported formats); Gemini API Additional Terms and summaries (simonwillison.net, developersdigest.tech).
- MDN storage quotas and eviction; WebKit bug 237350 and ITP posts; iOS PWA limitation guides (swoff.netlify.app, magicbell.com, testmuai.com).
- Paystack AI dashboard (shore.africa); Moniepoint M (techsoma.africa, nairametrics.com, businessday.ng); Joyflow, Ava Books, Tabby Talk, AR Pro365 launch coverage.
- arXiv 2604.25149 (semantic layer benchmark); tianpan.co, omni.co, datalere.com (text-to-SQL reliability).
- Speech: arXiv 2010.11123 (Nigerian Pidgin ASR); open projects on Nigerian-accented Whisper fine-tuning; dev.to benchmark of Whisper on Nigerian speech; Orinode, Intron, Ajala vendor claims.
- Kippa coverage (techcabal.com, businessworld.africa, technext.ng); Nigerian SME pressure (nairametrics.com, primebusiness.africa, zikoko.com).
- Nigerian data protection: mondaq.com, digitalpolicyalert.org, ndpc.gov.ng GAID 2025, lawpavilion.com.
- Retail metrics: fitsmallbusiness.com, koronapos.com, lifelongpos.com, cleverence.com, rackbeat.com.
- OWASP Top 10 for LLM applications (recalled from memory; verify against the current list).
- Sections 15 to 20 also draw on general software and data engineering practice, not on a single source.

