# Releasing Luci

Luci is released from GitHub: one button builds, tests and publishes all 9 public packages to npm with **Trusted Publishing**. No npm token or one-time code is needed, and npm shows that each package was built and signed by this repository's workflow (provenance).

- [Release a version](#release-a-version)
- [One-time setup](#one-time-setup)
- [When a release fails](#when-a-release-fails)
- [How users get the new version](#how-users-get-the-new-version)

---

## Release a version

1. Make sure everything for the release is on `main` and the **CI** check on the latest commit is green.
2. On GitHub, open **Actions → Release → Run workflow**.
3. Keep **Use workflow from** on `main`, type the **version** (for example `0.5.7`), and click **Run workflow**.
4. The **verify** job sets the version everywhere, builds, typechecks, runs every test and packs the packages (about 10 to 15 minutes).
5. GitHub then asks for your approval (**Review deployments → npm-publish → Approve and deploy**). You also get an email or notification.
6. The **publish** job publishes the 9 packages, commits `chore(release): v0.5.7` to `main`, tags it `v0.5.7`, and creates the GitHub Release with notes from the commits since the last release.

Within a few minutes, `npx @luci-dev/cli@latest` gives people the new version.

**Choosing the version:** bug fixes raise the last number (`0.5.6` → `0.5.7`); new features raise the middle one (`0.5.7` → `0.6.0`).

**Dry run:** tick **Dry run** to do step 4 only and see what would be published. Nothing is published, committed or tagged, so it is safe to try any time.

**Pre-release:** a version like `0.6.0-rc.1` is published under the npm tag `next`, so `@latest` keeps giving people the last real release. Testers install it with `npm install -g @luci-dev/cli@next`.

**What does not need a release:** changes to `README.md` (the repository's), `docs/` or the workflows reach GitHub as soon as they are pushed. Only changes to code that users run, or to a package's own `README.md` (its npm page), need a release.

---

## One-time setup

Do these once, in this order.

### 1. GitHub: the approval step

1. In the repository, open **Settings → Environments → New environment**, name it `npm-publish`, and click **Configure environment**.
2. Tick **Required reviewers**, add yourself, and click **Save protection rules**.
3. Under **Deployment branches and tags**, choose **Selected branches and tags** and add `main`.

Create the environment **before** the first real release. If it does not exist, GitHub creates it on the fly without the approval step.

### 2. npm: trust this workflow (once per package)

For each of the 9 packages, `@luci-dev/brain`, `capture`, `cli`, `feedback`, `format`, `mcp`, `skills`, `toolbar` and `ui`:

1. On npmjs.com, open the package (for example `https://www.npmjs.com/package/@luci-dev/cli`), then **Settings**.
2. Under **Trusted Publisher**, choose **GitHub Actions** and fill in:

   | Field | Value |
   | :--- | :--- |
   | Organization or user | `waidesign` |
   | Repository | `luci-by-pawprint.design` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm-publish` |

3. Under **Allowed actions**, tick **Allow `npm publish`** (the workflow publishes directly; without it npm only accepts staged publishes and the release fails). Leave **Allow `npm dist-tag`** unticked.
4. Click **Set up connection**.

Leave **Publishing access** on that page as it is until step 4 below.

### 3. Try it

Run the Release workflow with **Dry run** ticked. When it is green, the next real release can go out.

### 4. Lock it down (after the first real release through GitHub)

1. On each package's **Settings** page, under **Publishing access**, change **Require two-factor authentication or a granular access token with bypass 2fa enabled** to **Require two-factor authentication and disallow bypass 2fa tokens (recommended)**, and save. Trusted Publishing keeps working (it uses no token); from then on, only the Release workflow (with your approval) or you on npmjs.com with two-factor authentication can publish Luci. Until the first release through GitHub has worked, keep the old setting: the token on your Mac is the fallback.
2. On npmjs.com, **Access Tokens**: delete the publish tokens.
3. On your Mac, remove the token: `npm config delete //registry.npmjs.org/:_authToken`. To use npm from the terminal again later, run `npm login`.

---

## When a release fails

Open the failed run in **Actions** and look at the first red step.

| Where it stopped | What to do |
| :--- | :--- |
| **Check the version** | The version is not like `0.5.7`, the tag already exists, or the run was not started from `main`. Fix it and run again. |
| **Build, typecheck and test** | Nothing was published. Fix the problem on `main` and run the release again with the same version. |
| **Publish to npm** | Some packages may be on npm already. Run the release again with the **same version**: packages already on npm are skipped, the rest are published. If npm says the workflow is not trusted, check the four Trusted Publisher fields for that package (step 2 above). |
| **Commit the version and tag it** | npm has the release, but `main` moved while the run was waiting. Pull `main`, run `node scripts/bump-version.mjs 0.5.7`, commit `chore(release): v0.5.7`, tag `v0.5.7`, and push both. Then create the GitHub Release from the tag. |

A version can never be published twice on npm, even after deleting it. If a published release is broken, release a fixed one with the next version.

**Without GitHub (until January 2027):** the same steps work on a Mac with an npm token that may publish:

```bash
node scripts/bump-version.mjs 0.5.7
pnpm check
node scripts/release.mjs pack release
node scripts/release.mjs publish release
```

npm stops accepting tokens that bypass two-factor authentication for publishing in January 2027, and after step 4 of the setup no token can publish at all, so this is for emergencies only.

---

## How users get the new version

Luci never updates itself. See [Updating Luci](../README.md#updating-luci) for what users run; mention it in the release notes when a release changes the toolbar or the project files:

- `npx @luci-dev/cli@latest …` users get it automatically.
- Users who installed Luci run `npm install -g @luci-dev/cli@latest`, restart `luci serve` and reload their app.
- When the release changes the files Luci writes into projects, users run `luci update` (`luci doctor` tells them when).
