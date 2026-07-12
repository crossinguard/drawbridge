<script lang="ts">
  // Right pane of the Outcome Builder. The list stays read-only; selecting an
  // item opens this panel with labelled fields and Save/Cancel. Edits are
  // buffered locally and applied to the Document only on Save, so typing never
  // triggers a re-parse.
  import {
    selection,
    outcomeModel,
    actions,
    type Selection,
  } from "../../stores/outcomes";
  import Button from "../ui/Button.svelte";

  const sel = $derived($selection);
  const model = $derived($outcomeModel);

  // The selected entity, resolved from the current model (null if it was deleted).
  const entity = $derived.by(() => {
    if (!sel || !model) return null;
    if (sel.kind === "co") return model.outcomes.find((c) => c.id === sel.id) ?? null;
    if (sel.kind === "eo") {
      const co = model.outcomes.find((c) => c.id === sel.coId);
      return co?.evidence.find((e) => e.id === sel.id) ?? null;
    }
    return model.objectives.find((l) => l.id === sel.id) ?? null;
  });

  // Buffered draft. Re-initialised only when the selection key changes (an
  // untracked read of the store, so unrelated edits don't clobber in-progress
  // typing).
  let draftText = $state("");
  let draftMaps = $state<string[]>([]);
  let loadedKey = $state<string | null>(null);

  $effect(() => {
    const s = $selection; // reactive trigger
    const key = s ? `${s.kind}:${s.id}` : null;
    if (key === loadedKey) return;
    loadedKey = key;
    const m = outcomeModel.get(); // untracked snapshot
    let text = "";
    let maps: string[] = [];
    if (s && m) {
      if (s.kind === "co") text = m.outcomes.find((c) => c.id === s.id)?.text ?? "";
      else if (s.kind === "eo")
        text =
          m.outcomes
            .find((c) => c.id === s.coId)
            ?.evidence.find((e) => e.id === s.id)?.text ?? "";
      else {
        const lo = m.objectives.find((l) => l.id === s.id);
        text = lo?.text ?? "";
        maps = [...(lo?.maps_to ?? [])];
      }
    }
    draftText = text;
    draftMaps = maps;
  });

  const label = $derived(
    !model
      ? ""
      : sel?.kind === "co"
        ? model.terminology.outcome
        : sel?.kind === "eo"
          ? model.terminology.evidence
          : model.terminology.objective,
  );

  const dirty = $derived.by(() => {
    if (!entity) return false;
    if (draftText !== entity.text) return true;
    if (sel?.kind === "lo") {
      const cur = ("maps_to" in entity ? entity.maps_to : []) as string[];
      if (draftMaps.length !== cur.length) return true;
      const set = new Set(cur);
      return draftMaps.some((id) => !set.has(id));
    }
    return false;
  });

  function toggleMap(coId: string, on: boolean) {
    draftMaps = on
      ? [...draftMaps, coId]
      : draftMaps.filter((id) => id !== coId);
  }

  function save() {
    if (!sel) return;
    if (sel.kind === "co") actions.setOutcomeText(sel.id, draftText);
    else if (sel.kind === "eo") actions.setEvidenceText(sel.coId, sel.id, draftText);
    else {
      actions.setObjectiveText(sel.id, draftText);
      actions.setObjectiveMapping(sel.id, draftMaps);
    }
    loadedKey = null; // force re-sync from the freshly saved model
  }

  function cancel() {
    loadedKey = null; // re-sync draft from the store, discarding edits
    // re-trigger the effect by nudging selection to itself
    const s = sel as Selection;
    actions.select(null);
    actions.select(s);
  }
</script>

<aside
  class="border-border bg-card sticky top-4 h-fit rounded-lg border p-4"
  aria-label="Editor"
>
  {#if !entity || !sel}
    <p class="text-muted-foreground text-sm">
      Select an item on the left to edit it, or add a new one.
    </p>
  {:else}
    <div class="mb-3 flex items-baseline justify-between gap-2">
      <h3 class="text-sm font-medium">Edit {label}</h3>
      <code
        class="bg-accent text-accent-foreground rounded px-1.5 py-0.5 font-mono text-[0.75em]"
        >{sel.id}</code
      >
    </div>

    <label class="mb-1 block text-xs font-medium" for="edit-text">Text</label>
    <textarea
      id="edit-text"
      class="border-border bg-background focus-visible:border-outline mb-3 w-full resize-y rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-[var(--outline)]/30"
      rows="3"
      bind:value={draftText}
    ></textarea>

    {#if sel.kind === "lo" && model}
      <p class="mb-1 text-xs font-medium">Maps to</p>
      {#if model.outcomes.length === 0}
        <p class="text-muted-foreground mb-3 text-xs">
          No {model.terminology.outcome}s yet to map to.
        </p>
      {:else}
        <ul class="mb-3 flex flex-col gap-1">
          {#each model.outcomes as co}
            <li class="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                id={"map-" + co.id}
                class="mt-1"
                checked={draftMaps.includes(co.id)}
                onchange={(e) => toggleMap(co.id, e.currentTarget.checked)}
              />
              <label for={"map-" + co.id} class="cursor-pointer">
                <code class="font-mono text-xs">{co.id}</code>
                <span class="text-muted-foreground">{co.text || "(untitled)"}</span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

    <div class="flex gap-2">
      <Button variant="primary" size="sm" onclick={save} disabled={!dirty}>Save</Button>
      <Button variant="ghost" size="sm" onclick={cancel} disabled={!dirty}>Cancel</Button>
    </div>
  {/if}
</aside>
