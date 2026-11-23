# File tags: user guide

File tags give files and folders anywhere on this machine a set of labels you can search later. Tags live in one database under the Harness home; nothing is written next to the files you tag. You can tag from the chat with the model, or browse and search from the right Sidebar.

## Turn it on

1. Open **Plugins** in the left sidebar.
2. Find **File tags** and enable it.
3. The bundle loads two parts: the tag store and its model tools, and the **Tags** page in the right Sidebar.

The bundle is disabled by default, so a fresh profile does not tag anything until you enable it. Disabling it removes the tools and the panel but keeps the database, so your tags come back when you enable it again.

## Tag from the chat

Ask the model in plain language. It calls the file-tag tools, which accept absolute paths:

- "Tag `~/notes` and `~/notes/today.md` with work."
- "Add draft to `~/notes/today.md`."
- "Remove draft from `~/notes/today.md`."
- "Find everything tagged work that is not archived."

Tags must be one word: no spaces or parentheses. `and`, `or`, and `not` are reserved for expressions. A tag is created the first time it is used and deleted when its last file or folder loses it.

## Use the Tags page

Open the right Sidebar and pick **Tags** from the guide page.

- The top row lists every tag and how many paths carry it. Type in the filter box to narrow the chips.
- Click a chip to add it to the tag expression. Clicking several chips combines them with `and`. Click a selected chip again to remove it.
- You can also type an expression directly, for example `work and not archive`. Typing replaces the chip selection so the two never disagree.
- Results show each path with its tags. The path filter under the expression narrows the list without asking the Host again.
- Each result has an **Add** field; type a tag name and submit to attach it. The `×` on a tag removes it from that path.
- On Desktop, each result also has **Open**, which opens the path in its default application. Web shows no Open button.

A write is applied on the Host before the row refreshes. If the Host rejects it, the previous state stays and the panel reports the error.

## Sort files after tagging

The same bundle also provides `fs_copy` and `fs_move`, so the model can sort tagged files without decoding them:

- "Move `~/Downloads/report.docx` to `~/Work/CRM/`, creating the folder."
- "Copy this PDF into `~/Archive/2026/`."

A destination must not exist. If the name is taken, the tool fails instead of overwriting; the model will choose another name. Parent folders are created. A move writes the destination first and then removes the source, and reports when the source was kept.

## Expression syntax

Expressions combine tag names with `and`, `or`, `not`, and parentheses:

- `not` binds tightest, then `and`, then `or`.
- `work and not archive` finds paths tagged work but not archive.
- `(draft or review) and work` requires work plus at least one of draft or review.
- Tag names are case-sensitive: `Work` and `work` are different tags.
- An empty expression shows nothing; select a chip or type an expression.

Search returns at most 200 paths, sorted by path.

## Where the data lives

The database is `$DSH_HOME/data/filetags.db` by default (`~/.dsh/data/filetags.db` unless `DSH_HOME` says otherwise). It is created owner-only on first use. The file-tag bundle passes that path explicitly, so the panel and the model tools always read the same store.

To back up or move your tags, stop the Harness, copy `filetags.db` (and any `filetags.db-wal` beside it), and put it back at the same path. Do not edit the database while the Harness is running.

## Known limits

- **Moves are not followed.** If you rename or delete a tagged path, its tags stay in the database and search can show a path that no longer exists. Untag the path, or wait for a later version that follows moves.
- **One database per Host.** The bundle uses one fixed path, so two Hosts share tags only when both point at the same file.
- **Absolute paths only.** Tags are stored for the path as typed. A relative path is rejected.
- **No tag values, colors, or groups.** Tags are plain names in this version.
- **Web cannot open paths.** Opening a file or folder in its native application needs a Desktop Host.
- **No missing-path state.** The page does not mark rows whose file was removed yet.
