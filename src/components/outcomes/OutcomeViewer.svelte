<script lang="ts">
  // Slice 1 of the Outcome Builder: read-only. Import a drawbridge-outcomes/1
  // file, render it, and export it back — proving byte-level round-trip fidelity
  // in the live UI, not just in tests. Editing, the nanostores store, and the
  // IndexedDB snapshot/divergence indicator are later slices.
  //
  // This component touches files ONLY through the domain layer ($lib/outcomes);
  // it never calls the yaml parser directly (architecture rule).
  //
  // Styling comes from the shared kit ($components/ui) + Starwind design tokens,
  // so the island matches the Astro-rendered shell. No bespoke CSS.
  import { readDoc, toModel, writeDoc } from "$lib/outcomes/parse";
  import { validate, losForOutcome } from "$lib/outcomes/validate";
  import type { OutcomeDoc, ValidationFlag } from "$lib/outcomes/types";
  import type { Document } from "yaml";
  import Button from "../ui/Button.svelte";
  import Badge from "../ui/Badge.svelte";
  import Card from "../ui/Card.svelte";
  import { button } from "../starwind/button/variants";

  let fileName = $state<string | null>(null);
  // Fidelity layer: the eemeli Document is the source of truth for export.
  let doc = $state<Document | null>(null);
  // Lossy typed view, for rendering only. Never serialized.
  let model = $state<OutcomeDoc | null>(null);
  let flags = $state<ValidationFlag[]>([]);
  let loadError = $state<string | null>(null);

  async function onFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    loadError = null;
    try {
      const text = await file.text();
      const parsed = readDoc(text); // preserves comments + unknown keys
      doc = parsed;
      model = toModel(parsed);
      flags = validate(model);
      fileName = file.name;
    } catch (err) {
      // Loose by design: we never crash the UI. Surface the problem and let the
      // user pick another file.
      loadError = err instanceof Error ? err.message : String(err);
      doc = null;
      model = null;
      flags = [];
      fileName = null;
    }
    input.value = ""; // allow re-selecting the same file name
  }

  function onExport() {
    if (!doc) return;
    // Serialize through the Document (never the lossy model) so comments and
    // unknown keys survive. This is the release-gate guarantee, exercised live.
    const text = writeDoc(doc);
    const url = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName ?? "outcomes.yaml";
    a.click();
    URL.revokeObjectURL(url);
  }

  const flagCounts = $derived.by(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const f of flags) c[f.severity]++;
    return c;
  });

  // Validation severity → Badge variant.
  const sevVariant = { error: "error", warn: "warning", info: "info" } as const;
</script>

{#snippet chip(text: string)}
  <code
    class="bg-accent text-accent-foreground rounded px-1.5 py-0.5 font-mono text-[0.8em]"
    >{text}</code
  >
{/snippet}

<div class="my-6 flex flex-wrap items-center gap-3">
  <label class={button({ variant: "outline", size: "sm" })}>
    <input
      class="sr-only"
      type="file"
      accept=".yaml,.yml,application/yaml,text/yaml"
      onchange={onFile}
    />
    Import outcomes file…
  </label>
  <Button variant="primary" size="sm" onclick={onExport} disabled={!doc}>
    Export
  </Button>
  {#if fileName}
    <span class="text-muted-foreground truncate font-mono text-xs" title={fileName}>
      {fileName}
    </span>
  {/if}
</div>

{#if loadError}
  <p
    class="border-error/40 bg-error/5 text-error rounded-md border px-3 py-2 text-sm"
    role="alert"
  >
    Couldn't read that file: {loadError}
  </p>
{/if}

{#if model}
  <section>
    <header
      class="border-border flex flex-wrap items-baseline gap-3 border-b pb-2"
    >
      <h2 class="text-xl font-semibold">
        {model.course.title ?? "Untitled course"}
      </h2>
      {#if model.course.code}{@render chip(model.course.code)}{/if}
      <span class="text-muted-foreground text-sm">
        {model.outcomes.length}
        {model.terminology.outcome}s ·
        {model.objectives.length}
        {model.terminology.objective}s
      </span>
    </header>

    {#if flags.length}
      <ul class="mt-4 mb-1 flex list-none flex-col gap-1.5 p-0">
        {#each flags as flag}
          <li class="flex items-center gap-2 text-sm">
            <Badge variant={sevVariant[flag.severity]} size="sm">
              {flag.severity}
            </Badge>
            {#if flag.targetId}{@render chip(flag.targetId)}{/if}
            <span>{flag.message}</span>
          </li>
        {/each}
      </ul>
      <p class="text-muted-foreground text-xs">
        {flagCounts.error} error · {flagCounts.warn} warn · {flagCounts.info} info
        — flags never block; the draft is always usable.
      </p>
    {/if}

    <h3
      class="text-muted-foreground mt-7 mb-2 text-xs font-medium tracking-wide uppercase"
    >
      {model.terminology.outcome}s
    </h3>
    {#each model.outcomes as co}
      <Card class="my-2.5">
        <div class="flex items-baseline gap-2.5">
          {@render chip(co.id)}
          <p class="m-0">{co.text}</p>
        </div>
        {#if co.evidence.length}
          <ul class="mt-2 list-disc pl-5 text-[0.95rem]">
            {#each co.evidence as eo}
              <li class="my-1">
                {@render chip(eo.id)}
                {eo.text}
                {#if eo.scope?.length}
                  <span class="text-muted-foreground text-xs">
                    scope:
                    {#each eo.scope as s}{@render chip(s)}{/each}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if losForOutcome(model, co.id).length}
          <p class="text-muted-foreground mt-2 text-xs">
            Mapped {model.terminology.objective}s:
            {#each losForOutcome(model, co.id) as lo}{@render chip(lo)}{/each}
          </p>
        {/if}
      </Card>
    {/each}

    <h3
      class="text-muted-foreground mt-7 mb-2 text-xs font-medium tracking-wide uppercase"
    >
      {model.terminology.objective}s
    </h3>
    {#each model.objectives as lo}
      <Card class="my-2.5">
        <div class="flex items-baseline gap-2.5">
          {@render chip(lo.id)}
          <p class="m-0">{lo.text}</p>
        </div>
        {#if lo.maps_to.length}
          <p class="text-muted-foreground mt-2 text-xs">
            maps to:
            {#each lo.maps_to as co}{@render chip(co)}{/each}
          </p>
        {/if}
      </Card>
    {/each}
  </section>
{:else if !loadError}
  <p class="text-muted-foreground max-w-2xl">
    Import a {@render chip("drawbridge-outcomes/1")} YAML file to view it. Nothing
    leaves your browser. Try {@render chip("fixtures/bio101-outcomes.yaml")}.
  </p>
{/if}
