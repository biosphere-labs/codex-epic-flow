# Designing the contracts with domain-driven design

Use this when the contracts are not given: the input is requirements with acceptance criteria (given, or
derived by planning to cover the full functionality) and no design. Domain-driven design (DDD) is the
ontology: the fixed set of kinds the planner may use, and the rules for how they relate. With the same
few rules at every scope, the skeleton comes out coherent and simple, and simple is quicker to build.

## Steps

1. **Language.** A glossary drawn from the requirements: one name per concept, used in types, tests and
   briefs. Open questions are settled by researching similar apps and standards (the reference-system
   rule in the conventions), never by halting; each decision becomes a derived criterion that cites it.
2. **Strategic design.** Classify each area as a subdomain:
   - core (what makes the product worth having): full modelling;
   - supporting (needed, ordinary): plain code;
   - generic (solved problems such as login or email): a library or the plainest code.
   Forcing aggregates onto plain create-read-update-delete areas slows the build. Then draw the bounded
   contexts and a context map that names each seam's kind (table below).
3. **Tactical design,** one context at a time: aggregates, value objects, domain events, ports, and each
   invariant tied to the criteria that imply it.
4. **Skeleton.** Materialise steps 2 and 3 as the contract wave in the decompose stage: compiling types, ports, stubs
   that throw the gap marker, and a red test for every criterion and every invariant.

## Kinds

| Kind | Role in the build |
|---|---|
| Bounded context | Top scope below the project; owns its types |
| Aggregate | Objects kept consistent around an invariant; the core of one group |
| Use case | One requirement's behaviour at the boundary; joins the group of the aggregate it changes |
| Value object | Small immutable concrete type (Money, Slug, Email); the composable building block |
| Domain event | A fact one aggregate announces; the loosest seam |
| Port | The narrow interface one consumer declares it needs; the owner satisfies it |
| Adapter | Implements a port, or translates on the consumer's side |
| Shared kernel | Invariant-carrying helpers and types that must be identical everywhere (rounding, ids, tenancy); fixed in the skeleton, kept small |
| Private helper | Used in one group; not in the skeleton; the group writes it freely |
| Convenience helper | Wanted by many groups, carries no invariant; each group writes its own; deduplicated after the train |

Context-map seam kinds and what they become: shared kernel → frozen shared module; customer and supplier
→ a port the consumer declares; anticorruption layer → an adapter on the consumer's side; published
language → a shared schema at an untyped boundary; events → a frozen event type.

## Rules (checked at the gate, by machine)

- **R1 One owner.** Every exported type and piece of state has one owning context or aggregate, or is in
  the shared kernel.
- **R2 Ids across aggregates.** An aggregate refers to another by id only.
- **R3 Ports at the border.** A context imports another only through its ports, published schemas or
  events.
- **R4 One home per invariant.**
- **R5 Concrete contracts.** No `any`, `unknown` or open records in a contract signature; type parameters
  are fine. Generic does not have to mean untyped, and untyped seams are where writers guess differently.
- **R6 Additive after freeze.** An owner may add a field, variant or type; nobody renames or removes.
- **R7 Criteria owned and red.** Every criterion is owned by exactly one group and has a test that
  compiles and fails on the stubs.
- **R8 No cycles** between groups or contexts.
- **R9 Small kernel,** under a size threshold that is a tuning lever.

The same rules hold at every scope (project, context, group, task): one owner, crossing only through a
declared surface, each invariant in one place.

## Why composable rather than complete

Planning cannot see everything; detail turns up during implementation (a list needs paging, an error case
nobody wrote down). A skeleton that must be complete is a bet that loses. Freeze ownership and keep
contracts additive and concrete, so most discoveries land inside one group, where they cost nothing, and
the rest arrive as additions rather than edits.
