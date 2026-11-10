# Writing the contract wave

A stub needs boundary facts, not implementation detail. Four kinds of input, each answering one
question a parallel writer would otherwise have to guess.

## 1. Criteria and invariants (why)

- **Preconditions:** what must hold before the call ("the job exists and is loaded").
- **Postconditions:** what holds after it ("returns the entries of one directory, directories first").
- **Invariants:** what no input may break ("a merge is recorded once").

Each becomes a contract test against the stub.

## 2. Data shapes (what)

- Wire and transport shapes for every input and output, including HTTP bodies.
- Persisted record shapes (table rows, JSON files).
- Identifier types that cannot be swapped by accident:
  `type TaskId = string & { readonly __brand: 'TaskId' }`.

## 3. Seam topology (how)

- The entry point through which control arrives: route, CLI command, stage, event consumer.
- The callees each seam may use, and the ones it may not (for example "reads the repository through
  the git helper, never spawns git itself").
- Call semantics: sync or async, stream or batch, single result or iterator.

## 4. Edge states

- Return convention: throw, or a result type. Pick one per layer.
- Named failures: `JobNotFound`, `DirectoryNotFound`.
- Nullability per field: `T | null`, `T | undefined`, or an empty collection, and what each means.

## Example contract commit (TypeScript)

```typescript
// contracts/codeTree.ts: written by the contract wave; parallel writers import it and never edit it.

export type RepositoryId = string & { readonly __brand: 'RepositoryId' };

export interface TreeEntry {
  readonly name: string;
  /** Full path from the repository root; links use it as is. */
  readonly path: string;
  readonly type: 'dir' | 'file' | 'link' | 'submodule';
  readonly bytes?: number;
}

/** Answer of GET /api/jobs/:job/code/:repositoryId/tree. Never a bare array. */
export interface TreeAnswer {
  readonly path: string;
  readonly ref: string;
  readonly sha: string;
  /** Directories first, then by name. Empty for an empty root; a missing directory is DirectoryNotFound. */
  readonly entries: readonly TreeEntry[];
}

export type TreeError =
  | { readonly code: 'JOB_NOT_FOUND'; readonly job: string }
  | { readonly code: 'DIRECTORY_NOT_FOUND'; readonly path: string };

/**
 * Precondition: the job exists and the repository is linked to it.
 * Postcondition: entries of exactly one directory at `ref`.
 */
export async function codeTree(job: string, repositoryId: RepositoryId, path: string): Promise<TreeAnswer> {
  throw new Error('FIXME[internal]: stub, written by the group that owns codeTree');
}
```

```typescript
// The contract test, written in the same wave. It compiles, and it fails on the stub.
test('the tree answer lists one directory, directories first', async () => {
  const answer = await codeTree(job, repositoryId, '');
  assert.ok(Array.isArray(answer.entries));
  assert.deepEqual(answer.entries.map(e => e.type), ['dir', 'file']);
});
```

The page side of the same seam imports `TreeAnswer` (or reads it through JSDoc with `checkJs`), and its
own contract test renders a fixture produced by running the real `codeTree`, never a hand-made array.

## Checklist before the gate

1. Every seam between two groups has a declaration, and its stub throws the internal-gap marker.
2. Every criterion has a contract test that compiles and fails on the stub.
3. Every untyped boundary has one shared shape and a contract test on each side.
4. Paths are chosen for every new declaration.
5. The type check passes on the integration branch with the contract commit merged.
