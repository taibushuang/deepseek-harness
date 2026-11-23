/**
 * Sandbox escalation for the transfer tools: the same advertised targets,
 * approval sequence, denial marker, and hint the `write`, `edit`, and `apply_patch`
 * tools use. The shared class lives inside `tool-fs`; this module binds the
 * public sandbox vocabulary for the two transfer tools.
 * @module @deepseek-ai/dsh-tool-fs-transfer/sandbox
 */

import { ToolArgsError } from '@deepseek-ai/dsh-tools'
import type { EscalationApprover, SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import {
  ESCALATION_TARGETS, approveEscalation, escalationHintMarker, sandboxDenialMarker,
  sandboxPermissionsDescription, validateEscalationArgs,
} from '@deepseek-ai/dsh-sandbox'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { FsError } from '@deepseek-ai/dsh-fs'

/** The escalation arguments a transfer tool may carry. */
export interface TransferEscalationArgs {
  sandbox_permissions?: string
  justification?: string
}

/** The schema fields for the escalation arguments. */
export interface TransferEscalationSchema {
  sandbox_permissions: { type: 'string'; enum: string[]; description: string }
  justification: { type: 'string'; description: string }
}

/** The calling fields policy resolution and approval read from one tool execution. */
export interface TransferCall {
  readonly agent?: Agent
  readonly callId: ToolCallId
  readonly signal?: AbortSignal
}

/** The approval operation escalation asks when it widens access. */
type TransferApprover = EscalationApprover<Agent, ToolCallId>

/** Resolve and audit the per-call policy for one transfer. */
export class TransferSandbox {
  /** Escalation targets this composition advertises; empty without a confining backend. */
  readonly escalationModes: readonly SandboxMode[]

  /**
   * @param filesystemMode - the mounted filesystem's deployment mode; undefined when it does not confine.
   * @param policy - the policy service the confining filesystem requires.
   * @param approver - the approval service escalation asks when it widens access.
   */
  constructor(
    filesystemMode: SandboxMode | undefined,
    private readonly policy: SandboxPolicyService | undefined,
    private readonly approver: TransferApprover | undefined,
  ) {
    this.escalationModes = filesystemMode === undefined ? [] : ESCALATION_TARGETS
    if (filesystemMode !== undefined && policy === undefined) {
      throw new Error('tool-fs-transfer: the mounted filesystem confines but ctx.sandboxPolicy is missing')
    }
  }

  /**
   * The escalation fields advertised only under a confining backend.
   * @returns the two parameter specs.
   */
  schemaFields(): TransferEscalationSchema {
    return {
      sandbox_permissions: {
        type: 'string',
        enum: [...this.escalationModes],
        description: sandboxPermissionsDescription('operation'),
      },
      justification: {
        type: 'string',
        description: 'Required with sandbox_permissions: one sentence for the user explaining '
          + 'why this exact transfer needs the wider access. Use the language of the user’s current request.',
      },
    }
  }

  /**
   * Resolve the policy stamped onto one transfer, approving a strictly wider retry.
   * @param toolName - posting tool name for the approval audit trail.
   * @param args - escalation arguments from the call.
   * @param exec - tool execution context.
   * @returns the policy to pass to the provider, or undefined without a confining backend.
   */
  async resolvePolicy(toolName: string, args: TransferEscalationArgs, exec: TransferCall): Promise<SandboxExecutionPolicy | undefined> {
    if (this.escalationModes.length === 0 && (args.sandbox_permissions !== undefined || (args.justification ?? '').trim() !== '')) {
      throw new ToolArgsError(['sandbox_permissions and justification are not available in this composition (no sandboxing filesystem to escalate)'])
    }
    const standing = this.policy?.resolve({ ...exec.agent ? { session: exec.agent.session } : {} })
    if (args.sandbox_permissions !== undefined && args.sandbox_permissions === standing?.mode) return standing
    const justification = args.sandbox_permissions === undefined && args.justification?.trim() === '' ? undefined : args.justification
    validateEscalationArgs(args.sandbox_permissions, justification)
    if (args.sandbox_permissions === undefined || args.justification === undefined) return standing
    const approvedMode = await approveEscalation(
      { requestedMode: args.sandbox_permissions, justification: args.justification, effectiveMode: (standing as SandboxExecutionPolicy).mode, subject: 'operation' },
      {
        approver: this.approver,
        agent: exec.agent,
        callId: exec.callId,
        toolName,
        ...exec.signal === undefined ? {} : { signal: exec.signal },
      },
    )
    return { ...(standing as SandboxExecutionPolicy), mode: approvedMode }
  }

  /**
   * Rewrite a sandbox denial into the shared marker plus the escalation hint.
   * @param error - value thrown by the provider.
   * @param policy - policy stamped onto the call.
   * @returns the denial marker error, or the unchanged value.
   */
  mapError(error: unknown, policy: SandboxExecutionPolicy | undefined): unknown {
    if (!(error instanceof FsError) || error.code !== 'FS_SANDBOX_DENIED') return error
    const mode = (policy as SandboxExecutionPolicy).mode
    return new FsError(`${sandboxDenialMarker(mode)}\n${escalationHintMarker('operation')}`, 'FS_SANDBOX_DENIED', { cause: error })
  }
}
