# Put Crayon Sales Guru online — a link you can WhatsApp to your team

This turns the trainer into a normal website (e.g. `crayon-trainer.vercel.app`) that any
rep can open on their phone — no login, no app. Your Sarvam key stays hidden on the
server, so it's safe to share the link.

We'll use **Vercel** (free). One-time setup is ~15 minutes. After that, sharing is just
sending the link.

## What's in this folder
```
crayon-web/
  api/chat.js        <- the secure "brain" (holds the prompt + knowledge base, calls Sarvam)
  public/index.html  <- the chat page your team sees
  package.json
```
You don't need to edit any of these. The only thing you provide is your Sarvam key,
during setup.

---

## Step 1 — Install the Vercel tool (once)
You already have Node installed (from the transcription setup). Open **Command Prompt** and run:
```
npm install -g vercel
```

## Step 2 — Log in (once)
```
vercel login
```
Pick "Continue with Email", type your email, and click the confirmation link it sends you.

## Step 3 — Deploy
In Command Prompt, go into this folder (adjust the path to wherever you unzipped it):
```
cd C:\BharatSteelAI\crayon-web
vercel
```
Answer the prompts by pressing Enter to accept defaults:
- Set up and deploy? **Y**
- Which scope? **(your account)**
- Link to existing project? **N**
- Project name? **crayon-trainer** (or press Enter)
- Directory? **. ** (press Enter)
- Override settings? **N**

It will deploy and print a URL. (It won't fully work yet — we add the key next.)

## Step 4 — Get a FREE Gemini key and add it (once)
The trainer's chat runs on Google Gemini, which has a free tier (no credit card).
1. Go to **https://aistudio.google.com/apikey**, sign in with a Google account, click
   **Create API key**, and copy it.
2. Add it to your project:
```
vercel env add GEMINI_API_KEY
```
- Paste the Gemini key when asked.
- For "which environments", select **Production** (press space to tick, Enter).

*(Prefer clicking? Go to vercel.com → your project → Settings → Environment Variables →
add `GEMINI_API_KEY` = your key → Save.)*

> Free tier is ~250 chats/day — plenty for team testing. If you outgrow it, add billing
> in Google AI Studio, or switch the trainer back to Sarvam (see the note at the top of
> `api/chat.js`).

## Step 5 — Publish the live version
```
vercel --prod
```
This prints your final public link, e.g. **https://crayon-trainer.vercel.app**

Open it on your own phone to test. Then **WhatsApp that link to your reps** — done.

---

## Using it / keeping it running
- The link stays live. Reps just open it and chat. Works on any phone or computer.
- **Cost:** Vercel hosting is free at this scale. You only pay Sarvam per use (small).
  Watch usage on your Sarvam dashboard; if you want a cap, set a spending limit there.
- **Anyone with the link can use it** (and it draws on your Sarvam credits). Share it
  inside the company, not publicly. If a link leaks, rotate the Sarvam key and run
  `vercel env rm SARVAM_API_KEY` then add the new one and `vercel --prod` again.

## Updating the trainer later (e.g. after new calls)
When your knowledge base grows, paste the new content into the `KB` section near the top
of `api/chat.js`, save, and run `vercel --prod` again. The link stays the same.

## If something doesn't work
- Blank replies / "Server is missing GEMINI_API_KEY" → the key wasn't added, or you
  didn't redeploy after adding it; redo Step 4 then Step 5.
- "AI service error" → your Gemini key may be wrong or over the daily free limit; check
  Google AI Studio.
- Paste me the error and I'll pinpoint it.

*Prepared in Cowork for Crayon Roofing & Structures, July 2026.*
