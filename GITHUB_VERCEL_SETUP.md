# One-time GitHub + Vercel setup, then `push.bat` forever

After this ~10-minute setup, updating your live site is a single double-click of
`push.bat` (commit → push to GitHub → deploy to Vercel).

## One-time setup

### 1. Install Git (if you don't have it)
Download from https://git-scm.com/download/win and install with the defaults.
Check it works: open Command Prompt and run `git --version`.

### 2. Create an empty repo on GitHub
1. Go to https://github.com/new
2. Repository name: `crayon-bsc-trainers` (or anything)
3. Choose **Private** (recommended — it contains your call knowledge).
4. Do NOT add a README/.gitignore/license (keep it empty).
5. Click **Create repository** and copy the URL it shows, e.g.
   `https://github.com/yourname/crayon-bsc-trainers.git`

### 3. Connect your folder and do the first push
In Command Prompt, inside your project folder:
```
cd C:\BSC Apps\crayon-web
git init
git add -A
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/yourname/crayon-bsc-trainers.git
git push -u origin main
```
The first `git push` opens a GitHub sign-in window — log in once and Windows
remembers it.

### 4. (Vercel is already linked)
You already deployed this folder with `vercel` earlier, so the Vercel link exists.
Nothing to do here.

## From now on — just run push.bat

Whenever you change anything (e.g. updated knowledge base, tweaked a trainer):
- Double-click **`push.bat`**, or
- Run `push.bat "what I changed"` to add your own message.

It commits, pushes to GitHub, and redeploys the live site automatically.

## Optional: let GitHub auto-deploy (skip the Vercel CLI step)
If you'd rather Vercel deploy automatically every time you push to GitHub:
1. On vercel.com, open your project → **Settings → Git** → **Connect** your GitHub repo.
2. After that, every `git push` triggers a deploy on its own. You can then delete the
   last section of `push.bat` (the `vercel --prod` block) if you like — but leaving it
   in does no harm.

## Troubleshooting
- **push.bat says "Push failed" on first run** → you haven't done Step 3 yet; do it once.
- **"git is not recognized"** → Git isn't installed or you didn't reopen Command Prompt
  after installing.
- **Vercel asks you to log in** → run `vercel login` once.
