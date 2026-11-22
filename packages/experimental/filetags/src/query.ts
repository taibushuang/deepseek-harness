/**
 * Tag expression parser. Grammar, lowest precedence first: `or`, `and`, `not`,
 * then a tag name or a parenthesized group. Tag names are whitespace-free
 * tokens other than the keywords and parentheses. The compiled SQL is a
 * boolean over `entries`, with every tag name passed as a bound parameter.
 * @module @deepseek-ai/dsh-experimental-filetags/query
 */

/** Keywords that cannot be tag names. */
const KEYWORDS = new Set(['and', 'or', 'not'])

/** A compiled expression: SQL over `entries.id` plus its bound parameters. */
export interface CompiledQuery {
  sql: string
  params: string[]
}

/** Thrown for a malformed expression; the message names the offending token. */
export class TagExpressionError extends Error {}

/**
 * Split an expression into parentheses, keywords, and tag names.
 * @param expression - raw user expression.
 * @returns the token list.
 */
function tokenize(expression: string): string[] {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? []
  return tokens
}

/**
 * Compile a tag expression into a boolean SQL fragment over `entries`.
 * @param expression - for example `project and not archive`.
 * @returns the SQL condition and its parameters.
 * @throws {TagExpressionError} when the expression is empty or malformed.
 */
export function compileTagExpression(expression: string): CompiledQuery {
  const tokens = tokenize(expression)
  if (tokens.length === 0) throw new TagExpressionError('tag expression is empty')
  const params: string[] = []
  let position = 0

  const peek = (): string | undefined => tokens[position]
  const next = (): string => {
    const token = tokens[position]
    if (token === undefined) throw new TagExpressionError('tag expression ends unexpectedly')
    position += 1
    return token
  }

  const tagCondition = (name: string): string => {
    params.push(name)
    return 'EXISTS (SELECT 1 FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = entries.id AND t.name = ?)'
  }

  const primary = (): string => {
    const token = next()
    if (token === '(') {
      const inner = orExpr()
      if (next() !== ')') throw new TagExpressionError('missing closing parenthesis')
      return `(${inner})`
    }
    if (token === ')') throw new TagExpressionError('unexpected closing parenthesis')
    if (token === 'not') return `NOT (${primary()})`
    if (KEYWORDS.has(token)) throw new TagExpressionError(`unexpected keyword "${token}"`)
    return tagCondition(token)
  }

  const andExpr = (): string => {
    const parts = [primary()]
    while (peek() === 'and') {
      next()
      parts.push(primary())
    }
    return parts.join(' AND ')
  }

  const orExpr = (): string => {
    const parts = [andExpr()]
    while (peek() === 'or') {
      next()
      parts.push(andExpr())
    }
    return parts.length === 1 ? parts.join('') : parts.map(part => `(${part})`).join(' OR ')
  }

  const sql = orExpr()
  if (position !== tokens.length) throw new TagExpressionError(`unexpected token "${tokens[position]}"`)
  return { sql, params }
}
