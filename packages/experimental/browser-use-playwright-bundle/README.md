---
description: "Enable Chromium page automation, screenshots, and interaction recording from the Plugins page."
kind: "package-bundle"
---

# @deepseek-ai/dsh-browser-use-playwright-bundle

English | [中文](README.zh.md)

## Summary

Enable Playwright browser use on the Web or Desktop Plugins page. The bundle mounts the [browser-use provider registry](../../browser-use/browser-use/README.md) and the [Playwright MCP provider](../browser-use-playwright-mcp/README.md), which gives each live Session a Chromium browser with upstream tools for navigation, clicking, typing, screenshots, tracing, and interaction recording. Linux Desktop packages carry a pinned Chromium build; other installations use Playwright's browser cache or a configured executable. Shipped profiles leave the bundle disabled except the Linux Desktop profile, which mounts it on first launch.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open Plugins and enable Playwright browser in the Official group. Ask the model to open a page, for example "open the company wiki and summarize the release checklist", or "record how to submit an expense report". Upstream recording tools keep a Playwright trace; stopping the recording reports the trace file so the model can describe or replay the steps.

The browser launches with a visible window so a person can watch and take over. When no Chromium is available, install it with `pnpm exec playwright install chromium` in the installation that owns the MCP server, or set the provider's `executablePath` to an existing Chromium binary.

<a id="understand-the-implementation"></a>
## Understand the implementation

The bundle patch inserts `@deepseek-ai/dsh-browser-use` and `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`. The provider starts the pinned `@playwright/mcp` server under the Host's Node executable, keeps one connection per live Session, and exposes its tools under the `mcp__playwright-mcp__` namespace. Browser state belongs to the Session and is not persisted after unload or resume. Linux Desktop packaging installs the matching Chromium revision into `resources/playwright-browsers` and points `PLAYWRIGHT_BROWSERS_PATH` at it before the Host starts.

<a id="model-experience"></a>
## Model Experience

### Browser tools and recordings

#### What the model sees

The upstream Playwright MCP tool catalog, including `browser_navigate`, `browser_click`, `browser_snapshot`, `browser_take_screenshot`, `browser_start_recording`, and `browser_stop_recording`. Tool names and JSON schemas are the pinned upstream versions. A stopped recording returns the trace path; screenshots use the normal image pipeline and require an image-capable model route.

#### Token effect

The complete MCP tool catalog and server instructions join every request in a Session that owns a browser connection. Page snapshots and screenshots add their text or admitted images to Session history; recording itself adds no per-turn text.

#### KV Cache effect

An unchanged catalog preserves its tool-definition prefix. Page content and tool results append to history; provider or catalog changes can reduce prefix reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Disabled by default outside Linux Desktop** — enable it per profile, or use the Linux Desktop package, which mounts it on first launch.
- **Chromium only** — Firefox and WebKit are not selectable through this bundle.
- **Browser state is Session-local** — resume after reload starts a fresh browser; cookies and open pages are not restored.
- **Recording is a Playwright trace** — it is not a video; inspect it with a Playwright trace viewer.
- **Experimental upstream contract** — `@playwright/mcp` is pinned and carries no DSH stability promise.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The bundle adds no code beyond the composition. Desktop's Linux package runs `apps/desktop/scripts/prepare-playwright-browser.ts` after runtime preparation; set `DSH_DESKTOP_SKIP_PLAYWRIGHT_BROWSER=1` only for an offline build that provides Chromium separately.

</details>
