<script lang="ts">
  // Right pane of the Outcome Builder. The list stays read-only; selecting an
  // item opens this panel with labelled fields and Save/Cancel. Edits are
  // buffered locally and applied to the Document only on Save, so typing never
  // triggers a re-parse.
  //   CO / EO / LO → Text
  //   EO           → advisory Scope (which objectives this evidence supports)
  //   LO           → Maps to (which course outcomes this objective supports)
  import { selection, outcomeModel, identifiers, numbers, actions } from "../../stores/outcomes";
  import { labelFor } from "$lib/outcomes/numbering";
  import Button from "../ui/Button.svelte";

  const sel = $derived($selection);
  const model = $derived($outcomeModel);
  const ids = $derived($identifiers);

  // Scope may only reference objectives mapped to the EO's parent CO (plus any
  // already selected, so stragglers from an import can be unchecked).
  const scopeOptions = $derived.by(() => {
    if (!model || sel?.kind !== "eo") return [];
    return model.objectives.filter(
      (lo) => lo.maps_to.includes(sel.coId) || draftScope.includes(lo.id),
    );
  });

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
  let draftCode = $state(""); // optional custom identifier
  let draftMaps = $state<string[]>([]); // LO → CO ids
  let draftScope = $state<string[]>([]); // EO → LO ids
  let loadedKey = $state<string | null>(null);

  $effect(() => {
    const s = $selection; // reactive trigger
    const key = s ? `${s.kind}:${s.id}` : null;
    if (key === loadedKey) return;
    loadedKey = key;
    const m = outcomeModel.get(); // untracked snapshot
    let text = "";
    let code = "";
    let maps: string[] = [];
    let scope: string[] = [];
    if (s && m) {
      if (s.kind === "co") {
        const co = m.outcomes.find((c) => c.id === s.id);
        text = co?.text ?? "";
        code = co?.code ?? "";
      } else if (s.kind === "eo") {
        const eo = m.outcomes
          .find((c) => c.id === s.coId)
          ?.evidence.find((e) => e.id === s.id);
        text = eo?.text ?? "";
        code = eo?.code ?? "";
        scope = [...(eo?.scope ?? [])];
      } else {
        const lo = m.objectives.find((l) => l.id === s.id);
        text = lo?.text ?? "";
        code = lo?.code ?? "";
        maps = [...(lo?.maps_to ?? [])];
      }
    }
    draftText = text;
    draftCode = code;
    draftMaps = maps;
    draftScope = scope;
  });

  // The identifier this item would show if no custom code were set.
  const autoId = $derived.by(() => {
    if (!sel || !model) return "";
    const n = $numbers;
    if (sel.kind === "co") return `${model.prefixes.outcome} ${n.outcome.get(sel.id) ?? ""}`.trim();
    if (sel.kind === "eo") return `${model.prefixes.evidence} ${n.evidence.get(sel.id) ?? ""}`.trim();
    return `${model.prefixes.objective} ${n.objective.get(sel.id) ?? ""}`.trim();
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

  function differs(draft: string[], current: string[] | undefined): boolean {
    const cur = current ?? [];
    if (draft.length !== cur.length) return true;
    const set = new Set(cur);
    return draft.some((id) => !set.has(id));
  }

  const dirty = $derived.by(() => {
    if (!entity || !sel) return false;
    if (draftText !== entity.text) return true;
    if (draftCode !== (entity.code ?? "")) return true;
    if (sel.kind === "lo") return differs(draftMaps, (entity as { maps_to?: string[] }).maps_to);
    if (sel.kind === "eo") return differs(draftScope, (entity as { scope?: string[] }).scope);
    return false;
  });

  function toggle(list: string[], id: string, on: boolean): string[] {
    return on ? [...list, id] : list.filter((x) => x !== id);
  }

  function save() {
    if (!sel) return;
    if (sel.kind === "co") {
      actions.setOutcomeText(sel.id, draftText);
    } else if (sel.kind === "eo") {
      actions.setEvidenceText(sel.coId, sel.id, draftText);
      actions.setEvidenceScope(sel.coId, sel.id, draftScope);
    } else {
      actions.setObjectiveText(sel.id, draftText);
      actions.setObjectiveMapping(sel.id, draftMaps);
    }
    actions.setCode(sel, draftCode); // custom identifier (empty clears it)
    loadedKey = null; // force re-sync from the freshly saved model
  }

  function cancel() {
    const s = sel;
    loadedKey = null; // re-sync draft from the store, discarding edits
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
      <h3 class="text-sm font-medium">Edit {label} {labelFor(ids, sel.id)}</h3>
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

    <label class="mb-1 block text-xs font-medium" for="edit-code">
      Identifier <span class="text-muted-foreground font-normal">(optional)</span>
    </label>
    <input
      id="edit-code"
      class="border-border bg-background focus-visible:border-outline mb-1 w-full rounded-md border px-2.5 py-1.5 font-mono text-sm outline-none focus-visible:ring-3 focus-visible:ring-[var(--outline)]/30"
      placeholder={autoId}
      bind:value={draftCode}
    />
    <p class="text-muted-foreground mb-3 text-xs">
      Blank auto-numbers as <span class="font-mono">{autoId}</span>.
    </p>

    {#if sel.kind === "eo" && model}
      <p class="mb-1 text-xs font-medium">
        Scope <span class="text-muted-foreground font-normal">(advisory {model.terminology.objective.toLowerCase()}s)</span>
      </p>
      {#if scopeOptions.length === 0}
        <p class="text-muted-foreground mb-3 text-xs">
          Map a {model.terminology.objective.toLowerCase()} to this {model.terminology.outcome.toLowerCase()}
          first — only then can it scope this {model.terminology.evidence.toLowerCase()}.
        </p>
      {:else}
        <ul class="mb-3 flex flex-col gap-1">
          {#each scopeOptions as lo}
            <li class="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                id={"scope-" + lo.id}
                class="mt-1"
                checked={draftScope.includes(lo.id)}
                onchange={(e) => (draftScope = toggle(draftScope, lo.id, e.currentTarget.checked))}
              />
              <label for={"scope-" + lo.id} class="cursor-pointer">
                <span class="text-foreground font-medium">{labelFor(ids, lo.id)}</span>
                <span class="text-muted-foreground">{lo.text || "(untitled)"}</span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

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
                onchange={(e) => (draftMaps = toggle(draftMaps, co.id, e.currentTarget.checked))}
              />
              <label for={"map-" + co.id} class="cursor-pointer">
                <span class="text-foreground font-medium">{labelFor(ids, co.id)}</span>
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
