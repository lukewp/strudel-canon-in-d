// Node module hook: @strudel/core imports @kabelsalat/web (a browser-only audio graph) for its
// REPL, which these offline checks never use. Hand Node an empty stand-in instead.
export async function resolve(specifier, context, next) {
  if (specifier === '@kabelsalat/web') return { url: 'data:text/javascript,export class SalatRepl {}', shortCircuit: true }
  return next(specifier, context)
}
