<script lang="ts">
  // The document outline. Each row shows only its display identifier (CD 1 /
  // AO 2.1 / LO 3, or a custom code) and text — the internal stable id stays
  // hidden. Selecting a row opens its editor inline directly beneath it; clicking
  // it again collapses. Reorder by dragging the ⠿ handle or with the ▲▼ buttons
  // (kept as the keyboard-accessible path). All state flows through the store.
  import {
    outcomeModel,
    selection,
    identifiers,
    actions,
    type Selection,
  } from "../../stores/outcomes";
  import { labelFor } from "$lib/outcomes/numbering";
  import type {
    CourseOutcome,
    EvidenceOutcome,
    LearningObjective,
  } from "$lib/outcomes/types";
  import Button from "../ui/Button.svelte";
  import EditPanel from "./EditPanel.svelte";

  const model = $derived($outcomeModel);
  const sel = $derived($selection);
  const ids = $derived($identifiers);

  function isSel(kind: string, id: string) {
    return sel?.kind === kind && sel.id === id;
  }
  // Clicking a selected row again deselects it (collapses the inline editor).
  function toggle(next: NonNullable<Selection>) {
    actions.select(isSel(next.kind, next.id) ? null : next);
  }

  // — Drag and drop (native, no library) —
  type Kind = "co" | "eo" | "lo";
  let dragKind = $state<Kind | null>(null);
  let dragId = $state<string | null>(null);
  let dragCo = $state<string | null>(null); // parent CO when dragging an EO
  let overId = $state<string | null>(null);

  function dragStart(e: DragEvent, kind: Kind, id: string, coId?: string) {
    dragKind = kind;
    dragId = id;
    dragCo = coId ?? null;
    e.dataTransfer?.setData("text/plain", id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }
  function dragOver(e: DragEvent, kind: Kind, id: string, coId?: string) {
    if (dragKind !== kind) return; // only within the same list
    if (kind === "eo" && dragCo !== (coId ?? null)) return; // EOs stay under their CO
    e.preventDefault();
    overId = id;
  }
  function drop(kind: Kind, index: number, coId?: string) {
    if (dragKind === kind && dragId) {
      if (kind === "co") actions.moveOutcomeTo(dragId, index);
      else if (kind === "eo" && coId) actions.moveEvidenceTo(coId, dragId, index);
      else if (kind === "lo") actions.moveObjectiveTo(dragId, index);
    }
    reset();
  }
  function reset() {
    dragKind = null;
    dragId = null;
    dragCo = null;
    overId = null;
  }

  // Confirm deletes only when there's content to lose.
  function delOutcome(co: CourseOutcome) {
    const filled = co.text.trim() !== "" || co.evidence.length > 0;
    const term = model?.terminology.evidence.toLowerCase() ?? "outcome";
    if (!filled || confirm(`Delete "${co.text || labelFor(ids, co.id)}" and its ${co.evidence.length} ${term} item(s)?`))
      actions.removeOutcome(co.id);
  }
  function delEvidence(coId: string, eo: EvidenceOutcome) {
    if (eo.text.trim() === "" || confirm(`Delete "${eo.text}"?`))
      actions.removeEvidence(coId, eo.id);
  }
  function delObjective(lo: LearningObjective) {
    const filled = lo.text.trim() !== "" || lo.maps_to.length > 0;
    if (!filled || confirm(`Delete "${lo.text || labelFor(ids, lo.id)}"?`))
      actions.removeObjective(lo.id);
  }
</script>

{#snippet idTag(text: string)}
  <span class="text-foreground shrink-0 text-xs font-semibold">{text}</span>
{/snippet}

{#snippet grip(kind: Kind, id: string, coId?: string)}
  <span
    class="text-muted-foreground hover:text-foreground shrink-0 cursor-grab leading-none select-none"
    draggable="true"
    role="button"
    tabindex="-1"
    aria-label="Drag to reorder"
    title="Drag to reorder"
    ondragstart={(e) => dragStart(e, kind, id, coId)}
    ondragend={reset}>⠿</span
  >
{/snippet}

{#snippet reorder(up: () => void, down: () => void, first: boolean, last: boolean)}
  <span class="flex flex-col leading-none">
    <button type="button" class="text-muted-foreground hover:text-foreground text-[0.65rem] disabled:opacity-25" title="Move up" aria-label="Move up" disabled={first} onclick={up}>▲</button>
    <button type="button" class="text-muted-foreground hover:text-foreground text-[0.65rem] disabled:opacity-25" title="Move down" aria-label="Move down" disabled={last} onclick={down}>▼</button>
  </span>
{/snippet}

{#if model}
  <div class="flex flex-col gap-6">
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {model.terminology.outcome}s
        </h3>
        <Button variant="outline" size="sm" onclick={() => actions.addOutcome()}>+ Add</Button>
      </div>

      {#if model.outcomes.length === 0}
        <p class="text-muted-foreground text-sm">None yet.</p>
      {/if}

      <ul class="flex flex-col gap-2">
        {#each model.outcomes as co, i}
          <li class="border-border rounded-lg border" class:ring-2={overId === co.id} class:ring-primary={overId === co.id}>
            <div
              class="flex items-start gap-2 p-2.5"
              class:bg-accent={isSel("co", co.id)}
              ondragover={(e) => dragOver(e, "co", co.id)}
              ondrop={() => drop("co", i)}
            >
              {@render grip("co", co.id)}
              {@render reorder(() => actions.moveOutcome(co.id, -1), () => actions.moveOutcome(co.id, +1), i === 0, i === model.outcomes.length - 1)}
              <button type="button" class="flex flex-1 items-baseline gap-2 text-left text-sm" onclick={() => toggle({ kind: "co", id: co.id })}>
                {@render idTag(labelFor(ids, co.id))}
                <span>{co.text || "(untitled)"}</span>
              </button>
              <button type="button" class="text-muted-foreground hover:text-error text-xs" title="Delete" aria-label="Delete outcome" onclick={() => delOutcome(co)}>✕</button>
            </div>

            {#if isSel("co", co.id)}
              <div class="border-border border-t px-2.5 py-3"><EditPanel /></div>
            {/if}

            <div class="border-border border-t px-2.5 py-2">
              {#each co.evidence as eo, j}
                <div
                  class="rounded"
                  class:ring-2={overId === eo.id}
                  class:ring-primary={overId === eo.id}
                  ondragover={(e) => dragOver(e, "eo", eo.id, co.id)}
                  ondrop={() => drop("eo", j, co.id)}
                >
                  <div class="flex items-start gap-2 py-1 pl-1 text-sm" class:bg-accent={isSel("eo", eo.id)}>
                    {@render grip("eo", eo.id, co.id)}
                    {@render reorder(() => actions.moveEvidence(co.id, eo.id, -1), () => actions.moveEvidence(co.id, eo.id, +1), j === 0, j === co.evidence.length - 1)}
                    <button type="button" class="flex flex-1 items-baseline gap-2 text-left" onclick={() => toggle({ kind: "eo", id: eo.id, coId: co.id })}>
                      {@render idTag(labelFor(ids, eo.id))}
                      <span>{eo.text || "(untitled)"}</span>
                    </button>
                    <button type="button" class="text-muted-foreground hover:text-error text-xs" title="Delete" aria-label="Delete evidence" onclick={() => delEvidence(co.id, eo)}>✕</button>
                  </div>
                  {#if isSel("eo", eo.id)}
                    <div class="border-border mt-1 ml-1 border-l-2 py-2 pl-3"><EditPanel /></div>
                  {/if}
                </div>
              {/each}
              <button type="button" class="text-primary mt-1 pl-1 text-xs hover:underline" onclick={() => actions.addEvidence(co.id)}>
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
        <Button variant="outline" size="sm" onclick={() => actions.addObjective()}>+ Add</Button>
      </div>

      {#if model.objectives.length === 0}
        <p class="text-muted-foreground text-sm">None yet.</p>
      {/if}

      <ul class="flex flex-col gap-2">
        {#each model.objectives as lo, i}
          <li
            class="border-border rounded-lg border"
            class:ring-2={overId === lo.id}
            class:ring-primary={overId === lo.id}
            ondragover={(e) => dragOver(e, "lo", lo.id)}
            ondrop={() => drop("lo", i)}
          >
            <div class="flex items-start gap-2 p-2.5" class:bg-accent={isSel("lo", lo.id)}>
              {@render grip("lo", lo.id)}
              {@render reorder(() => actions.moveObjective(lo.id, -1), () => actions.moveObjective(lo.id, +1), i === 0, i === model.objectives.length - 1)}
              <button type="button" class="flex flex-1 items-baseline gap-2 text-left text-sm" onclick={() => toggle({ kind: "lo", id: lo.id })}>
                {@render idTag(labelFor(ids, lo.id))}
                <span>
                  {lo.text || "(untitled)"}
                  {#if lo.maps_to.length}
                    <span class="text-muted-foreground text-xs">→ {lo.maps_to.map((c) => labelFor(ids, c)).join(", ")}</span>
                  {/if}
                </span>
              </button>
              <button type="button" class="text-muted-foreground hover:text-error text-xs" title="Delete" aria-label="Delete objective" onclick={() => delObjective(lo)}>✕</button>
            </div>
            {#if isSel("lo", lo.id)}
              <div class="border-border border-t px-2.5 py-3"><EditPanel /></div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  </div>
{/if}
