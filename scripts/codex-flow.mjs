// A tool-neutral queue around the original scheduler. Codex drives the queue
// with its native agent tools; no SDK, API key, or nested CLI is needed.
import { runFlow } from './flow.mjs';

function validate(schema, value, path = 'result') {
  if (!schema) return;
  const type = schema.type;
  const valid = type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : type === 'array' ? Array.isArray(value)
    : type === 'integer' ? Number.isInteger(value) : typeof value === type;
  if (!valid) throw new Error(`${path}: expected ${type}`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: invalid enum value`);
  if (type === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) throw new Error(`${path}.${key}: required`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (key in value) validate(child, value[key], `${path}.${key}`);
    }
  }
  if (type === 'array') value.forEach((item, i) => validate(schema.items, item, `${path}[${i}]`));
}

export function startFlow(args) {
  if (!args || !['develop', 'flow'].includes(args.mode)) throw new Error('mode must be develop or flow');
  if (!Array.isArray(args.features) || !args.features.length) throw new Error('features must be nonempty');
  const slugs = args.features.map(f => f.slug);
  if (slugs.some(s => typeof s !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) || new Set(slugs).size !== slugs.length) {
    throw new Error('feature slugs must be unique kebab-case names');
  }
  if (args.verifyRounds !== undefined && (!Number.isInteger(args.verifyRounds) || args.verifyRounds < 0)) {
    throw new Error('verifyRounds must be a nonnegative integer');
  }
  const jobs = new Map();
  const events = [];
  let seq = 0, state = 'running', result = null, error = null;
  const agent = (prompt, options) => new Promise(resolve => {
    const id = `job-${++seq}`;
    jobs.set(id, { id, prompt, options, state: 'queued', resolve });
  });
  const completion = runFlow(args, agent, thunks => Promise.all(thunks.map(t => t().catch(() => null))),
    name => events.push({ phase: name }), message => events.push({ message }))
    .then(value => { state = 'done'; result = value; }, failure => { state = 'error'; error = String(failure); });
  return {
    // Wait only for JS continuations, never for agent work.
    async snapshot() {
      await new Promise(resolve => setImmediate(resolve));
      return { state, result, error, events: events.slice(), jobs: [...jobs.values()].map(({ resolve, ...job }) => job) };
    },
    claim(id) {
      const job = jobs.get(id);
      if (!job || job.state !== 'queued') throw new Error(`job ${id} is not queued`);
      job.state = 'running';
      return { id, prompt: job.prompt, options: job.options };
    },
    complete(id, value) {
      const job = jobs.get(id);
      if (!job || job.state !== 'running') throw new Error(`job ${id} is not running`);
      validate(job.options.schema, value);
      jobs.delete(id);
      job.resolve(value);
    },
    fail(id) {
      const job = jobs.get(id);
      if (!job || job.state !== 'running') throw new Error(`job ${id} is not running`);
      jobs.delete(id);
      job.resolve(null); // The scheduler's existing missing-agent failure path.
    },
    completion,
  };
}
