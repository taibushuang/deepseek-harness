# Use the Web UI

English | [中文](index.zh.md)

Start the Web UI through the [root README](../../../README.md#run); the command prints its URL. This guide begins after that server is running. The `dsh` process uses its invoking directory as the default filesystem location, but a fresh Web UI has no selected workspace until you add one.

## Configure a model

On first launch without a usable provider, dsh prompts you to configure a model and opens **Settings → Models**. Add a provider there — a [DeepSeek API key](https://platform.deepseek.com/), a third-party provider, or a custom OpenAI-compatible endpoint — with its base URL, models, and key. The model route becomes usable immediately without restarting the server.

The [model configuration guide](./providers.md) covers other providers and custom OpenAI-compatible endpoints.

## Choose a workspace

Click **Choose workspace**, add the project directory where you started `dsh`, and select it. The session composer remains unavailable until a workspace is selected.

## Run a task

Start a session and send:

> Summarize this repository and identify its main packages.

The agent can read and edit workspace files, run commands, delegate work, and maintain a plan. The Web UI asks before operations that require approval under the active permission policy.

## Continue

- [File tags, organization, and tasks](./office-assistant.md)
- [Configure models](./providers.md)
- [Use the Python SDK](./python-sdk.md)
- [Publish the Web UI behind a reverse proxy](./public-deployments.md)
- [Uninstall DSH Desktop](./desktop-uninstall-cleanup.md)
- [Use other CLI modes](../../../apps/cli/README.md)
- [Develop a plugin](../develop/basic/index.md)
