#!/usr/bin/env node
/**
 * slice.mjs: dependence slices, shared nodes and parallel groups for a TypeScript project.
 *
 * Why it exists: groups for parallel writers must come from what depends on what, never from files or
 * task ids. From each task's entry points this walks a static approximation of the System Dependence
 * Graph: calls (the language service's call hierarchy), functions referred to without a call (a
 * default starter, a callback passed by name), module-level values read, and the types named in
 * signatures and in those types' members. Tasks whose slices share a node the contract wave has not
 * frozen land in one group. Used by Epic Flow's decompose (to check the seam list) and build (to compute groups).
 *
 * Usage:
 *   node slice.mjs --project <dir holding tsconfig.json and node_modules/typescript>
 *     --task <name>=<file>:<function>[,<file>:<function>...]     repeat once per task
 *     [--frozen <file>:<name>]...        contract nodes: in every slice that reaches them, linking no
 *                                        tasks; the walk stops there except from the owner's own entry
 *     [--edge <file>:<fn>=><file>:<fn>]... calls the analysis cannot see (see Limits)
 *     [--depth <n>]                      depth limit, default 12
 *   <file> is relative to --project. <function> is a function, an arrow function bound to a const,
 *   or Class.method.
 *
 * Output (stdout, JSON): { tasks: { <name>: [nodeId] }, nodes: { <nodeId>: { kind: function|type|value,
 *   file, line } }, edges: [{ from, to, kind: calls|refers|reads|uses-type|manual }],
 *   sharedNodes: { <nodeId>: [task] }, groups: [[task]], unresolved: [entry] }.
 *   A node id is "<file>:<name>". sharedNodes lists what still links tasks: the candidates to freeze.
 *
 * Limits: static only, and coarser than a real SDG (whole functions, not statements). Not followed:
 * functions chosen at runtime through a variable or property, event emitters, RxJS subscriptions,
 * dependency-injection containers, dynamic import, and anything crossing HTTP, files or the database;
 * add those with --edge. Inferred return types without an annotation contribute no type nodes. Files
 * outside --project and anything under node_modules are not walked.
 */
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

const argv = process.argv.slice(2);
/** All values given for a repeated option. */
function values(name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === name && i + 1 < argv.length) out.push(argv[++i]);
  return out;
}

if (!values('--project').length || !values('--task').length) {
  process.stderr.write(
    'usage: node slice.mjs --project <dir> --task <name>=<file>:<fn>[,...] [--task ...]\n' +
      '       [--frozen <file>:<name>]... [--edge <file>:<fn>=><file>:<fn>]... [--depth <n>]\n',
  );
  process.exit(2);
}

const project = resolve(values('--project')[0]);
const maxDepth = Number(values('--depth')[0] ?? 12);
const ts = createRequire(join(project, 'package.json'))('typescript');

// Language service over the project's own tsconfig, so resolution matches its compiler.
const configPath = ts.findConfigFile(project, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error(`no tsconfig.json under ${project}`);
const config = ts.parseJsonConfigFileContent(
  ts.readConfigFile(configPath, ts.sys.readFile).config,
  ts.sys,
  dirname(configPath),
);
const service = ts.createLanguageService(
  {
    getScriptFileNames: () => config.fileNames,
    getScriptVersion: () => '1',
    getScriptSnapshot: f => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined),
    getCurrentDirectory: () => project,
    getCompilationSettings: () => config.options,
    getDefaultLibFileName: o => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  },
  ts.createDocumentRegistry(),
);
const program = service.getProgram();
const checker = program.getTypeChecker();

/** True for files this walk may enter. */
const inProject = file => file.startsWith(project + '/') && !file.includes('/node_modules/');
const rel = file => relative(project, file);
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

/** Name node of the declaration `name` (fn, const arrow, or Class.method) in `file`, or undefined. */
function findDeclarationName(file, name) {
  const sf = program.getSourceFile(resolve(project, file));
  if (!sf) return undefined;
  const [owner, member] = name.includes('.') ? name.split('.') : [undefined, name];
  let found;
  const visit = (node, className) => {
    if (found) return;
    if (ts.isClassDeclaration(node) && node.name) className = node.name.text;
    const named = node.name && ts.isIdentifier(node.name) && node.name.text === member;
    if (named && (owner ? className === owner : true)) {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) found = node.name;
      if (ts.isVariableDeclaration(node) && node.initializer &&
          (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) found = node.name;
    }
    ts.forEachChild(node, child => visit(child, className));
  };
  visit(sf, undefined);
  return found && { sf, pos: found.getStart(sf) };
}

/** Deepest node in `sf` that contains `pos`. */
function nodeAt(sf, pos) {
  let best = sf;
  const visit = node => {
    if (node.getStart(sf) <= pos && pos < node.getEnd()) {
      best = node;
      ts.forEachChild(node, visit);
    }
  };
  ts.forEachChild(sf, visit);
  return best;
}

/** The function-like declaration whose name sits at `pos`, if any. */
function functionAt(sf, pos) {
  let node = nodeAt(sf, pos);
  while (node && !ts.isSourceFile(node)) {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) return node;
    if (ts.isVariableDeclaration(node) && node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) return node.initializer;
    node = node.parent;
  }
  return undefined;
}

const nodes = {};
const edges = [];
const edgeKeys = new Set();
function addNode(id, kind, file, line) {
  if (!nodes[id]) nodes[id] = { kind, file, line };
}
function addEdge(from, to, kind) {
  const key = `${from}|${to}|${kind}`;
  if (!edgeKeys.has(key)) { edgeKeys.add(key); edges.push({ from, to, kind }); }
}

/** Node id for a call hierarchy item. */
function itemId(item) {
  const name = item.kind === 'method' && item.containerName ? `${item.containerName}.${item.name}` : item.name;
  return `${rel(item.file)}:${name}`;
}

/** Type declarations named in a function's parameter and return annotations, followed through
 *  interface and alias members (data dependence), added to `slice`. */
function collectTypes(fnNode, sf, fromId, slice, seen = new Set()) {
  const typeNodes = [];
  for (const p of fnNode.parameters ?? []) if (p.type) typeNodes.push(p.type);
  if (fnNode.type) typeNodes.push(fnNode.type);
  const walkType = (typeNode, ownerId) => {
    const visit = n => {
      if (ts.isTypeReferenceNode(n)) {
        let symbol = checker.getSymbolAtLocation(n.typeName);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        const decl = symbol?.declarations?.[0];
        const file = decl?.getSourceFile().fileName;
        // A generic parameter (`T`) is a placeholder, not a data shape anyone owns.
        if (decl && file && inProject(file) && !ts.isTypeParameterDeclaration(decl)) {
          const id = `${rel(file)}:${symbol.name}`;
          addNode(id, 'type', rel(file), lineOf(decl.getSourceFile(), decl.getStart()));
          addEdge(ownerId, id, 'uses-type');
          slice.add(id);
          if (!seen.has(id) && !frozen.has(id)) {
            seen.add(id);
            if (ts.isInterfaceDeclaration(decl)) decl.members.forEach(m => m.type && walkType(m.type, id));
            if (ts.isTypeAliasDeclaration(decl)) walkType(decl.type, id);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(typeNode);
  };
  typeNodes.forEach(t => walkType(t, fromId));
}

// Frozen contract nodes: part of every slice that reaches them, but the walk stops there, because a
// writer depends on the contract's signature, never on the implementation behind it.
const frozen = new Set(values('--frozen'));

const manual = new Map();
for (const spec of values('--edge')) {
  const [from, to] = spec.split('=>');
  if (!from || !to) throw new Error(`bad --edge ${spec}`);
  if (!manual.has(from)) manual.set(from, []);
  manual.get(from).push(to);
}

/** True when a variable declaration sits at module level (const x = ... in the file's top scope). */
const moduleLevel = decl =>
  ts.isVariableDeclaration(decl) && ts.isVariableStatement(decl.parent?.parent) && ts.isSourceFile(decl.parent.parent.parent);
const isFunctionValue = init => init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));

/**
 * Data and reference dependence inside `root` (a function body or a value's initializer): module-level
 * values it reads (edge 'reads', node kind 'value', followed through their initializers) and project
 * functions it refers to without calling them, such as a default starter or a callback passed by name
 * (edge 'refers', walked like a call). Direct calls are left to the call hierarchy.
 */
function scanRefs(root, ownerId, depth, slice, visited) {
  const visit = n => {
    if (ts.isIdentifier(n) && !(ts.isCallExpression(n.parent) && n.parent.expression === n)) {
      let symbol = checker.getSymbolAtLocation(n);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      const decl = symbol?.declarations?.[0];
      const file = decl?.getSourceFile().fileName;
      if (decl && file && inProject(file) && decl !== n.parent) {
        const declSf = decl.getSourceFile();
        const isFn = ts.isFunctionDeclaration(decl) || (moduleLevel(decl) && isFunctionValue(decl.initializer));
        if (isFn && decl.name) {
          addEdge(ownerId, `${rel(file)}:${decl.name.text}`, 'refers');
          walk(declSf, decl.name.getStart(declSf), depth + 1, slice, visited);
        } else if (moduleLevel(decl) && ts.isIdentifier(decl.name)) {
          const id = `${rel(file)}:${decl.name.text}`;
          addNode(id, 'value', rel(file), lineOf(declSf, decl.getStart(declSf)));
          addEdge(ownerId, id, 'reads');
          slice.add(id);
          if (!visited.has(id) && !frozen.has(id)) {
            visited.add(id);
            if (decl.type) collectTypes({ parameters: [], type: decl.type }, declSf, id, slice);
            if (decl.initializer) scanRefs(decl.initializer, id, depth + 1, slice, visited);
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(root);
}

/** Walk outgoing calls from the declaration named at (sf, pos), adding to `slice`. */
function walk(sf, pos, depth, slice, visited) {
  const prepared = service.prepareCallHierarchy(sf.fileName, pos);
  const item = Array.isArray(prepared) ? prepared[0] : prepared;
  if (!item || !inProject(item.file)) return;
  const id = itemId(item);
  addNode(id, 'function', rel(item.file), lineOf(program.getSourceFile(item.file), item.selectionSpan.start));
  slice.add(id);
  // A task walks its own entry points even when they are frozen: it owns what sits behind them.
  if (visited.has(id) || (frozen.has(id) && depth > 0)) return;
  visited.add(id);
  const itemSf = program.getSourceFile(item.file);
  const fn = functionAt(itemSf, item.selectionSpan.start);
  if (fn) collectTypes(fn, itemSf, id, slice);
  if (depth >= maxDepth) return;
  if (fn?.body) scanRefs(fn.body, id, depth, slice, visited);
  // Default parameter values are references too (a default starter, a default clock).
  for (const p of fn?.parameters ?? []) if (p.initializer) scanRefs(p.initializer, id, depth, slice, visited);
  for (const call of service.provideCallHierarchyOutgoingCalls(item.file, item.selectionSpan.start)) {
    if (!inProject(call.to.file)) continue;
    addEdge(id, itemId(call.to), 'calls');
    walk(program.getSourceFile(call.to.file), call.to.selectionSpan.start, depth + 1, slice, visited);
  }
  for (const target of manual.get(id) ?? []) {
    const cut = target.lastIndexOf(':');
    const decl = findDeclarationName(target.slice(0, cut), target.slice(cut + 1));
    if (!decl) continue;
    addEdge(id, target, 'manual');
    walk(decl.sf, decl.pos, depth + 1, slice, visited);
  }
}

const tasks = {};
const unresolved = [];
for (const spec of values('--task')) {
  const eq = spec.indexOf('=');
  const name = spec.slice(0, eq);
  const slice = new Set();
  const visited = new Set();
  for (const entry of spec.slice(eq + 1).split(',')) {
    const cut = entry.lastIndexOf(':');
    const decl = findDeclarationName(entry.slice(0, cut), entry.slice(cut + 1));
    if (!decl) { unresolved.push(entry); continue; }
    walk(decl.sf, decl.pos, 0, slice, visited);
  }
  tasks[name] = [...slice].sort();
}

// Group: tasks that share any node the contract wave has not frozen end up together (union-find).
const parent = Object.fromEntries(Object.keys(tasks).map(t => [t, t]));
const root = t => (parent[t] === t ? t : (parent[t] = root(parent[t])));
const holders = {};
for (const [task, slice] of Object.entries(tasks)) for (const id of slice) (holders[id] ??= []).push(task);
const sharedNodes = {};
for (const [id, owners] of Object.entries(holders)) {
  if (owners.length < 2 || frozen.has(id)) continue;
  sharedNodes[id] = owners;
  owners.slice(1).forEach(t => (parent[root(t)] = root(owners[0])));
}
const byRoot = {};
for (const t of Object.keys(tasks)) (byRoot[root(t)] ??= []).push(t);

process.stdout.write(JSON.stringify({
  tasks,
  nodes,
  edges,
  sharedNodes,
  groups: Object.values(byRoot),
  unresolved,
}, null, 1) + '\n');
