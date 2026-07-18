# GitHub Primer — for this project

A plain-English guide to the system that stores and publishes PCS Housing
Finder. No prior GitHub experience assumed.

---

## The big picture

There are **three copies** of this project, kept in sync:

```
Your PC                          GitHub                        The public site
C:\Users\micha\Projects\   →    github.com/Michael-W-R/   →   michael-w-r.github.io/
pcs-housing-finder              pcs-housing-finder            pcs-housing-finder/
(the working copy)              (the stored copy)             (what visitors see)
```

- **Your PC** holds the working copy — files get edited here.
- **GitHub** holds the official stored copy, plus the entire history of every
  change ever made.
- **The public site** is rebuilt automatically from GitHub every time new
  changes arrive. You never upload anything manually.

## The four words that matter

| Term | Meaning |
|------|---------|
| **Repository ("repo")** | One project's folder plus its full change history. This project is one repo. |
| **Commit** | A saved snapshot of changes, with a short description. Like a save-point in a game. Every feature added so far is a commit you can inspect. |
| **Push** | Uploading your new commits from the PC to GitHub. Pushing is what triggers the public site to update. |
| **Branch** | A named line of history. This project only uses one, called `main` — ignore branching for now. |

The rhythm of every change so far: *edit files → commit (snapshot) → push
(upload) → site rebuilds itself in ~20 seconds.*

## Touring your repo page

Open **https://github.com/Michael-W-R/pcs-housing-finder** and you'll see:

- **The file list** — the same folders as on your PC (`web/`, `tools/`,
  `docs/`, `data/`). Click any file to read it. Markdown files (like this one)
  display formatted.
- **README** — the project description shown below the file list. It's just
  the `README.md` file, rendered.
- **Commits** — click the clock-like icon (or the "NN commits" link) near the
  top right of the file list. This is the project's diary: every change,
  newest first, with my descriptions. Click any commit to see exactly which
  lines changed, old vs. new, in red and green.
- **Actions tab** (top of page) — the deploy history. Each push shows up here
  as a "Deploy to GitHub Pages" run with a green check (succeeded) or red X
  (failed). This is where to look if the site ever doesn't update.
- **Settings → Pages** — where the publishing is configured, and later, where
  a custom domain gets attached. Nothing to touch today.

## Things you can safely do yourself

- **Read anything.** Browsing files, history, and deploy runs changes nothing.
- **Edit a file on the website.** Open a file → click the pencil icon → make a
  change → "Commit changes" (green button). This creates a commit directly on
  GitHub and the site redeploys automatically. Good for fixing a typo from
  your phone.

  ⚠️ **The one gotcha:** if you edit on GitHub.com, your PC's copy is now
  behind. Before the next work session, tell Claude to run `git pull` (the
  opposite of push — it downloads GitHub's changes to the PC). Otherwise the
  next push may complain about being out of date. Nothing breaks permanently;
  it's just a sync step.

## Things to leave alone for now

- **Branches, Pull Requests, Forks, Issues** — collaboration machinery for
  teams. Useful someday if others contribute; noise today.
- **The green "Code" button / cloning** — for downloading the repo to another
  computer. Your PC already has the copy.
- **Deleting anything on GitHub** — the history is the backup; keep it.

## Your bookmarks

| What | URL |
|------|-----|
| The live site | https://michael-w-r.github.io/pcs-housing-finder/ |
| The repo (files + README) | https://github.com/Michael-W-R/pcs-housing-finder |
| Change history | https://github.com/Michael-W-R/pcs-housing-finder/commits/main |
| Deploy history | https://github.com/Michael-W-R/pcs-housing-finder/actions |
| This guide, styling guide | the `docs/` folder in the repo |

## FAQ

**If my PC dies, is the project safe?** Yes — GitHub has everything including
full history. Any computer can re-download it (`git clone` + one login).

**Is the repo public?** Yes, by design — anyone can *read* the code and data,
which suits a public tool built on public data. Only your account (and tools
you authorize, like the Claude session you approved via device code) can
*change* it.

**Does it cost anything?** No. Public repos, Actions deploys at this scale,
and GitHub Pages hosting are all free. Your only planned cost is a custom
domain (~$12/yr) if you buy one.

**How do I see what Claude did today?** The commit history — every change is
a titled, dated, inspectable snapshot.
