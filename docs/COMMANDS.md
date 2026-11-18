# Luci command reference

Everything you can run or press in Luci, in one place.

- [Terminal: the `luci` command](#terminal-the-luci-command)
- [Dev toolbar: in your own app](#dev-toolbar-in-your-own-app)
- [Chrome extension: on any site](#chrome-extension-on-any-site)
- [Agent tools: `luci-mcp`](#agent-tools-luci-mcp)

New to Luci? Start with the [Quick Start](../README.md#quick-start). To update Luci, see [Updating Luci](../README.md#updating-luci).

---

## Terminal: the `luci` command

Run these in your project folder. With Luci installed (`npm install -g @luci-dev/cli`), type `luci …`; without installing, type `npx @luci-dev/cli@latest …` instead. `luci-dev` works as another name for `luci`.

### Set up and resume

| Command | What it does |
| :--- | :--- |
| `luci init` | Set up this project: `.luci/`, your Global Brain, starter skills and the Luci section of each agent's file. In a terminal it asks for the goal, matching skills, packs and rules, and offers to add the dev toolbar to your app. |
| `luci init --toolbar` | Also add the dev toolbar without asking. |
| `luci init --yes` | Take the defaults without asking, and never edit your app's files (`--non-interactive` is the same). `-i` (`--interactive`) asks the questions even outside a terminal. |
| `luci init --agents codex,gemini,copilot,generic` | Write agent files for these agents too (`all` for every one). Claude Code and Cursor are always set up, and any agent whose file the project already has. |
| `luci init --dry-run` | Show what it would create, without writing anything. |
| `luci init --force` | Overwrite Luci's starter files that already exist, **including ones you edited**. Try `--dry-run` first. |
| `luci start` | Resume this project: the active task and the context an agent needs. |
| `luci task` | Show the active task. |
| `luci task done` | Archive the active task when it is finished. |
| `luci intake <file...>` | Fit a PRD and supporting docs into project memory. `--dry-run` shows the plan first. |

### Dev toolbar

| Command | What it does |
| :--- | :--- |
| `luci serve` | Connect the dev toolbar to this project, so notes and captures go into `.luci/`. Leave it running while you work. `--port <n>` picks the port (default 4545). |
| `luci toolbar` | Add the dev toolbar to your app's root HTML or layout. It only loads on this machine, while `luci serve` runs. |
| `luci toolbar remove` | Take it out again. |
| `luci toolbar --dry-run` | Show what it would add. `--port <n>` for a port other than 4545. |

### Skills

| Command | What it does |
| :--- | :--- |
| `luci skills [category]` | List the skill library (Luci's and your personal one). `luci skills list [category]` is the same. |
| `luci skills search <query>` | Find skills by keyword. |
| `luci skills recommend <task>` | The skills for a task, each with the reason. |
| `luci skills use <task>` | Load the skills that closely match a task (nothing when nothing fits). `--project`: only this project's skills. `--budget <tokens>`: a size limit. `--full`: print their instructions. `--inject`: write the task and the skill files to open into `.luci/local/active-task.md`. |
| `luci skills select <name...>` | Use library skills in this project. `--reason <text>` records why. |
| `luci skills deselect <name...>` | Stop using skills in this project. |
| `luci skills selected` | The skills this project uses. |
| `luci skills add <github-link\|folder\|file>` | Add a skill to your personal library (`--project`: to this project), converted to the Luci Skill Standard. `--category <c>`, `--name <n>`, `--yes`. A GitHub link is fetched from GitHub. |
| `luci skills mine` | Your personal library. |
| `luci skills share <name>` | Copy a personal skill into this project for teammates. |
| `luci skills lint [folder]` | Check skills against the standard. `--levels` shows ranking levels. |
| `luci skills pin\|unpin <name...>` | Prefer a skill, or stop preferring it. |
| `luci skills block\|unblock <name...>` | Never suggest a skill, or allow it again. |
| `luci skills prefs` | Show pinned and blocked skills. |
| `luci skills review [name]` | Review AI-drafted ranking fields. `--approve` or `--reject`, optionally for named fields. |
| `luci skills licenses` | Check personal skills' licences at their source (goes online). `--apply` records the results in the skills. |
| `luci skills index` | Rebuild the index of your personal library. |

### Skill packs

Curated skill sets: `ui`, `motion`, `marketing`, `design-system`, `design-system-build`. `luci pack` works too.

| Command | What it does |
| :--- | :--- |
| `luci packs` | Which packs fit this project and why, and the skills each would add. `luci packs show` is the same. |
| `luci packs add <name...>` | Add packs to this project. |
| `luci packs remove <name...>` | Remove packs. Skills another pack or a person chose stay. |

### Design captures

The captures saved in `.luci/design/` (from the dev toolbar or the extension). `luci captures` works too.

| Command | What it does |
| :--- | :--- |
| `luci capture` | List the design captures saved in the project. |
| `luci capture checks` | Recent design check runs. |
| `luci capture rule <file>` | Propose a project rule from a component capture (into `.luci/memory/proposed/`). |
| `luci capture baseline` | Rebuild the project's own typography, colors and spacing from its stylesheets. `--stitch` also writes `DESIGN.md`, `--tailwind` writes `theme.css`, `--tailwind-v3` writes `tailwind.config.js`, `--css-vars` writes `tokens.css`. |
| `luci capture compare <a> <b>` | The differences between two component captures. |
| `luci capture crawl <urls...>` | Visit a list of routes or URLs in one pass and merge them into site-level systems in `.luci/design/`. `--base <url>` for routes, `--stitch` also writes `DESIGN.md`. |
| `luci capture layout <file>` | Print the computed layout tree of a component or section capture. |

### Maintenance

| Command | What it does |
| :--- | :--- |
| `luci doctor` | Check the install and this project's setup, and say how to fix what is wrong. `--json` for scripts. |
| `luci update` | Refresh the files Luci wrote into this project: auto-detected sections, `brain.json`, agent files and the skill catalog. Your own rules, decisions and notes stay as they are. It does not update Luci itself. |
| `luci map` | The code map's status. `--update` builds or refreshes it; `--install` installs Graphify. |
| `luci benchmark` | Show saved local evaluation reports from `eval/`. `--json` for scripts. `luci eval` works too. |
| `luci version` | Show the installed version. Also `luci --version` or `luci -v`. |
| `luci help` | Show every command. Also `luci --help` or `luci -h`. |

---

## Dev toolbar: in your own app

Luci inside the app you are building, while `luci serve` runs (see [Dev toolbar](#dev-toolbar) above). Luci's button sits in the bottom corner of the page; click it to open the bar, and **×** closes it back to the button. Drag the bar, or the closed button, by its background or Luci's head to move it; **Menu → Dock** puts it back in the right or left corner.

The bar has three modes, switched with **Feedback · Layout · Capture** next to Luci. Each mode's keys work only while that mode is open, never while you type, and never with Ctrl, Alt, Cmd or Shift, so your app's own shortcuts keep working.

### Feedback: notes for your agent

| Tool | Key | What it does |
| :--- | :--- | :--- |
| Menu (Luci's head) | `M` | Settings: marker color, prompt detail, webhook, each tool's preferences, theme, dock, and the list of keys. |
| Annotate | `A` | Click an element, write what should change, choose its intent (fix, change, question, approve) and priority (high, medium, low), then **Save**. |
| Copy prompt | | Copy your notes as one prompt for your agent, grouped by page, with an ID for each note (`P2-A3`). **▾** chooses: only new notes, or every note not done yet. |
| Notes | `N` | Every note, page by page: **Not done · Done · All**. Mark done, reopen, edit or delete. |
| Pause | `P` | Freeze the page's animations, transitions and videos on the current frame. |
| Project / This browser | | Where notes are saved. **This browser** means `luci serve` is not connected: start it, then click the badge. |

More:

- **Text:** select words on the page (outside Annotate) and press **Add feedback**.
- **Markers:** click a numbered marker on the page to open its note.
- **In the note form:** `Ctrl+Enter` (`Cmd+Enter` on a Mac) saves.
- **`Esc`** closes the menu or the note form, then leaves Annotate.

### Layout: try layout changes on the live page

| Tool | Key | What it does |
| :--- | :--- | :--- |
| Select | `S` | Click an element, then drag its handles to resize it or **⠿** to move it. Values snap to the page's spacing scale. |
| Insert | `I` | Add a new part (your component, a saved capture or a block), then click where it goes. |
| New page | `N` | Sketch a page that does not exist yet, on a canvas over your app. |
| Undo | `Ctrl+Z` | Undo the last change. |
| Redo | `Ctrl+Shift+Z` | Redo it. |
| Reset | | Back to what your code has. |
| Copy prompt | | Every planned change as one prompt for your agent. The page then goes back as it was: your code has not changed until your agent edits it. |

More:

- **`Delete`** or **`Backspace`** removes the selected new part (in New page: the selected block).
- **`Esc`** closes the menu, cancels placing a part, clears the selection, then stops selecting. In New page, it goes back to the page.

### Capture: take parts of the page as design files

| Tool | Key | What it does |
| :--- | :--- | :--- |
| Menu (Luci's head) | `M` | Settings: file format, units, colors, each tool's preferences, theme, dock, and the list of keys. |
| Component | `V` | A button, card, link or field: its parts, styles and states. |
| Text | `T` | A piece of text, or the page's whole typography. |
| Color | `C` | An element's colors, a pixel anywhere on the page, or a screenshot's palette (**Element · Pixel · Image**). |
| Spacing | `S` | Padding, margin and gaps. Drag from one element to another to measure the distance between them. |
| Whole page | `P` | One file for the page: typography, colors, spacing and every kind of component on it. |
| Check | `K` | Compare a component you built with its design file. |
| Basket | `B` | Everything you collected, on any page. Export it as one file, or save it to the project. |

While picking:

- **`↑`** selects the element around the current one, **`↓`** the one inside it.
- **`Enter`** takes the current element.
- **`Esc`** stops picking; in Pixel or Image, it goes back to Element.

### On a phone or touch screen

- The bar spans the screen in two rows; cards open above it.
- A finger has no hover, so picking takes two taps: the first outlines and names the element, the second (on the same element) acts on it. In Annotate, the card above the bar also offers **Add note** and **Parent**.
- The page still scrolls while you pick.
- Tooltips show for keyboard focus only.

---

## Chrome extension: on any site

The extension brings Capture to any site, not only your own app. To install it, see [the extension's README](../packages/extension/README.md).

| Action | How |
| :--- | :--- |
| Open or close Luci | Click Luci's icon in Chrome's toolbar. The bar opens at the top right of the page. |
| Open with a keyboard shortcut | Chrome lets you choose one: open `chrome://extensions/shortcuts` and set **Activate the extension** for Luci. Luci has no shortcut of its own, so it never takes one a site uses. |
| Move the bar | Drag it by its background, a separator or Luci's head. Luci remembers the place for each site. **Menu → Dock** puts it back in the right or left corner. |
| Save into your project | Run `luci serve` in the project. The extension finds it on this machine, and **Save to project** writes into `.luci/design/`. |

The tools and keys are those of the dev toolbar's [Capture mode](#capture-take-parts-of-the-page-as-design-files): `V` Component, `T` Text, `C` Color, `S` Spacing, `P` Whole page, `K` Check, `B` Basket, `M` Menu, with `↑` `↓` `Enter` `Esc` while picking. Feedback and Layout are only in the dev toolbar.

---

## Agent tools: `luci-mcp`

Your agent calls these itself once it is connected to `luci-mcp`. For Claude Code, from the project folder:

```bash
claude mcp add luci -- npx -y @luci-dev/mcp@latest
```

For other agents, add a stdio MCP server that runs `npx -y @luci-dev/mcp@latest` in the project folder. "Reads only" tools never change a file. Tools that write only do so when you ask for it, and never edit `rules.md`, `context.md` or `playbook.md`: rules and lessons come in as proposals for you to accept.

### Project

| Tool | What it does | Writes |
| :--- | :--- | :--- |
| `get_project_context` | Everything Luci knows about the project: stack, goal, rules, commands, the active task, chosen skills and packs, code map. | Reads only |
| `get_active_task` | The current task, which skill files to open and why, and its acceptance criteria. For resuming work. | Reads only |
| `get_project_status` | Resume a project, like `luci start`: the checks, the active task, goal, rules and skills. | Refreshes the generated Global Brain summary |
| `analyze_project` | Detect the project from its files: framework, languages, package manager, UI libraries, tests, commands, agents. | Reads only |
| `get_project_graph` | The code map (Graphify): where it is and whether it is out of date. `update: true` refreshes it, when you agree. | `graphify-out/` |
| `initialize_project` | Set the project up with Luci, like `luci init`. Only when you agree. | `.luci/` and agent files |
| `get_global_brain` | Your preferences, design principles and coding standards across all projects. | Creates it the first time |

### Memory

| Tool | What it does | Writes |
| :--- | :--- | :--- |
| `update_project_memory` | Record a decision you confirmed in `.luci/decisions/`. | A decision record |
| `propose_memory` | Propose a rule, convention or lesson for you to accept or delete. | `.luci/memory/proposed/` |
| `intake_docs` | Fit a PRD and supporting docs into project memory, like `luci intake`. Only when you agree. | Empty sections of `context.md`, and proposals |

### Skills

| Tool | What it does | Writes |
| :--- | :--- | :--- |
| `list_skills` | The skill library, with trust levels. | Reads only |
| `search_skills` | Search the library by relevance to a query. | Reads only |
| `get_skill` | One skill's details and full instructions. | Reads only |
| `recommend_skills` | The skills that fit a task, each with the reason, and the order to use them in. | Reads only |
| `load_skills` | Full instructions of the library skills that closely match a task, within a size limit. | Reads only |
| `get_project_skills` | The skills chosen for this project, without their full text. | Reads only |
| `load_project_skills` | Full instructions of only the project skills that fit the current task. | Reads only |
| `select_project_skills` | Add library skills to the project. Only when you agree. | The project's skill list |
| `list_skill_packs` | Which packs fit this project and the skills each would add. | Reads only |
| `add_skill_packs` | Add packs to the project, like `luci packs add`. Only when you agree. | The project's skill list |
| `remove_skill_packs` | Remove packs, like `luci packs remove`. Skills another pack or a person chose stay. Only when you agree. | The project's skill list |

### Feedback

| Tool | What it does | Writes |
| :--- | :--- | :--- |
| `list_feedback` | The notes you left with the dev toolbar, each with its ID, comment, intent, priority and element. | Reads only |
| `get_feedback_prompt` | Your notes not done yet as one prompt grouped by page. The agent reports every ID; you decide what is done. | Reads only |
| `watch_feedback` | Wait while you leave new notes, then return them as soon as there are any. The agent applies them and watches again. | Reads only |

### Design

| Tool | What it does | Writes |
| :--- | :--- | :--- |
| `list_captures` | The design captures saved in the project, and the project's own design baseline. | Reads only |
| `get_capture` | One saved capture, as written: values, tokens, states and your instructions. | Reads only |
| `get_design_checks` | The latest design checks from the dev toolbar: each built component against its design file, with every difference. | Reads only |
| `compare_captures` | Compare two component captures part by part. | Reads only |
| `get_layout_tree` | The flex and grid layout tree of a component or section capture. | Reads only |
| `propose_capture_rule` | Propose a rule from a component capture ("Build every primary button like …"). | `.luci/memory/proposed/` |
| `crawl_site_design` | Visit several pages of a site and merge their typography, colors and spacing into site-level systems. | `.luci/design/` |
