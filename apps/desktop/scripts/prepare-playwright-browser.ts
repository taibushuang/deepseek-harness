/** Install the pinned Playwright Chromium into the Linux Desktop runtime resources. */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'

/**
 * Resolve the Playwright CLI that the bundled Playwright MCP package depends on.
 * @returns Absolute path to the pinned Playwright CLI entry point.
 */
function playwrightCli(): string {
  const providerManifest = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/package.json'))
  const require = createRequire(providerManifest)
  return join(dirname(require.resolve('playwright/package.json')), 'cli.js')
}

/**
 * Install the Chromium revision that the packaged Playwright dependency expects.
 * @param destination - Directory that receives the browser cache.
 * @returns Absolute browser cache directory.
 */
export function installPlaywrightChromium(destination: string): string {
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  execFileSync(process.execPath, [playwrightCli(), 'install', 'chromium', '--no-shell'], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: destination },
    stdio: 'inherit',
  })
  const installed = readdirSync(destination).some(entry => entry.startsWith('chromium-'))
  if (!installed) throw new Error(`desktop Playwright browser: ${destination} contains no Chromium installation`)
  return destination
}

/**
 * Install the browser only for the Linux target that ships it; other targets keep Playwright's default discovery.
 * @returns The installed directory, or undefined when this target does not carry a browser.
 */
export function preparePlaywrightBrowser(): string | undefined {
  const target = resolveDesktopBuildTarget()
  if (target !== 'linux-x64') return undefined
  if (process.env.DSH_DESKTOP_SKIP_PLAYWRIGHT_BROWSER === '1') return undefined
  const destination = resolveDesktopTargetBuildPaths().playwrightBrowsers
  process.stdout.write(`desktop Playwright browser: installing Chromium into ${destination}\n`)
  installPlaywrightChromium(destination)
  return destination
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const installed = preparePlaywrightBrowser()
  if (installed !== undefined) process.stdout.write(`desktop Playwright browser: ${installed}\n`)
}
