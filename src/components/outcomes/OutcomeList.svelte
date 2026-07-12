<script lang="ts">
  // Left pane of the Outcome Builder: the document outline. Rows are read-only
  // and selectable; selecting one opens the EditPanel. Add / delete / reorder
  // affordances sit inline. Rows show the derived display number (CO 1, EO 2.1,
  // LO 3) prominently with the stable id muted beside it. All state flows
  // through the store.
  import { outcomeModel, selection, identifiers, actions } from "../../stores/outcomes";
  import { labelFor } from "$lib/outcomes/numbering";
  import type {
    CourseOutcome,
    EvidenceOutcome,
    LearningObjective,
  } from "$lib/outcomes/types";
  import Button from "../ui/Button.svelte";

  const model = $derived($outcomeModel);
  const sel = $derived($selection);
  const ids = $derived($identifiers);

  function isSel(kind: string, id: string) {
    return sel?.kind === kind && sel.id === id;
  }

  // Confirm deletes only when there's content to lose; empty just-added rows go
  // quietly (add-then-remove is common).
  function delOutcome(co: CourseOutcome) {
    const filled = co.text.trim() !== "" || co.evidence.length > 0;
    const term = model?.terminology.evidence.toLowerCase() ?? "evidence";
    if (!filled || confirm(`Delete "${co.text || co.id}" and its ${co.evidence.length} ${term} item(s)?`))
      actions.removeOutcome(co.id);
  }
  function delEvidence(coId: string, eo: EvidenceOutcome) {
    if (eo.text.trim() === "" || confirm(`Delete "${eo.text}"?`))
      actions.removeEvidence(coId, eo.id);
  }
  function delObjective(lo: LearningObjective) {
    const filled = lo.text.trim() !== "" || lo.maps_to.length > 0;
    if (!filled || confirm(`Delete "${lo.text || lo.id}"?`))
      actions.removeObjective(lo.id);
  }
</script>

{#snippet numTag(text: string, id: string)}
  <span class="flex shrink-0 items-baseline gap-1">
    <span class="text-foreground text-xs font-semibold">{text}</span>
    <code class="text-muted-foreground font-mono text-[0.7em]">{id}</code>
  </span>
{/snippet}

{#snippet reorder(up: () => void, down: () => void, first: boolean, last: boolean)}
  <span class="flex flex-col leading-none">
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground text-[0.65rem] disabled:opacity-25"
      title="Move up"
      aria-label="Move up"
      disabled={first}
      onclick={up}>▲</button
    >
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground text-[0.65rem] disabled:opacity-25"
      title="Move down"
      aria-label="Move down"
      disabled={last}
      onclick={down}>▼</button
    >
  </span>
{/snippet}

{#if model}
  <div class="flex flex-col gap-6">
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {model.terminology.outcome}s
        </h3>
        <Button variant="outline" size="sm" onclick={() => actions.addOutcome()}>
          + Add
        </Button>
      </div>

      {#if model.outcomes.length === 0}
        <p class="text-muted-foreground text-sm">None yet.</p>
      {/if}

      <ul class="flex flex-col gap-2">
        {#each model.outcomes as co, i}
          <li class="border-border rounded-lg border">
            <div class="flex items-start gap-2 p-2.5" class:bg-accent={isSel("co", co.id)}>
              {@render reorder(
                () => actions.moveOutcome(co.id, -1),
                () => actions.moveOutcome(co.id, +1),
                i === 0,
                i === model.outcomes.length - 1,
              )}
              <button
                type="button"
                class="flex flex-1 items-baseline gap-2 text-left text-sm"
                onclick={() => actions.select({ kind: "co", id: co.id })}
              >
                {@render numTag(labelFor(ids, co.id), co.id)}
                <span>{co.text || "(untitled)"}</span>
              </button>
              <button
                type="button"
                class="text-muted-foreground hover:text-error text-xs"
                title="Delete"
                aria-label="Delete outcome"
                onclick={() => delOutcome(co)}>✕</button
              >
            </div>

            <div class="border-border border-t px-2.5 py-2">
              {#each co.evidence as eo, j}
                <div
                  class="flex items-start gap-2 rounded py-1 pl-1 text-sm"
                  class:bg-accent={isSel("eo", eo.id)}
                >
                  {@render reorder(
                    () => actions.moveEvidence(co.id, eo.id, -1),
                    () => actions.moveEvidence(co.id, eo.id, +1),
                    j === 0,
                    j === co.evidence.length - 1,
                  )}
                  <button
                    type="button"
                    class="flex flex-1 items-baseline gap-2 text-left"
                    onclick={() => actions.select({ kind: "eo", id: eo.id, coId: co.id })}
                  >
                    {@render numTag(labelFor(ids, eo.id), eo.id)}
                    <span>{eo.text || "(untitled)"}</span>
                  </button>
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-error text-xs"
                    title="Delete"
                    aria-label="Delete evidence"
                    onclick={() => delEvidence(co.id, eo)}>✕</button
                  >
                </div>
              {/each}
              <button
                type="button"
                class="text-primary mt-1 pl-1 text-xs hover:underline"
                onclick={() => actions.addEvidence(co.id)}
              >
                + Add {model.terminology.evidence.toLowerCase()}
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </section>

    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {model.terminology.objective}s
        </h3>
        <Button variant="outline" size="sm" onclick={() => actions.addObjective()}>
          + Add
        </Button>
      </div>

      {#if model.objectives.length === 0}
        <p class="text-muted-foreground text-sm">None yet.</p>
      {/if}

      <ul class="flex flex-col gap-2">
        {#each model.objectives as lo, i}
          <li
            class="border-border flex items-start gap-2 rounded-lg border p-2.5"
            class:bg-accent={isSel("lo", lo.id)}
          >
            {@render reorder(
              () => actions.moveObjective(lo.id, -1),
              () => actions.moveObjective(lo.id, +1),
              i === 0,
              i === model.objectives.length - 1,
            )}
            <button
              type="button"
              class="flex flex-1 items-baseline gap-2 text-left text-sm"
              onclick={() => actions.select({ kind: "lo", id: lo.id })}
            >
              {@render numTag(labelFor(ids, lo.id), lo.id)}
              <span>
                {lo.text || "(untitled)"}
                {#if lo.maps_to.length}
                  <span class="text-muted-foreground text-xs">
                    → {lo.maps_to.map((c) => labelFor(ids, c)).join(", ")}
                  </span>
                {/if}
              </span>
            </button>
            <button
              type="button"
              class="text-muted-foreground hover:text-error text-xs"
              title="Delete"
              aria-label="Delete objective"
              onclick={() => delObjective(lo)}>✕</button
            >
          </li>
        {/each}
      </ul>
    </section>
  </div>
{/if}
