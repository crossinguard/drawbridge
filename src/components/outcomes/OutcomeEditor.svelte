<script lang="ts">
  // Outcome Builder shell: toolbar (import / new / export / mode), validation
  // detail, and either the editing layout (list + panel) or the read-only review
  // view. All document state lives in the store; this island wires the DOM to it.
  // Files remain canonical — the dirty indicator warns when edits haven't been
  // exported yet (hard rule #6).
  import { onMount } from "svelte";
  import { session, outcomeModel, recoveredAt, actions } from "../../stores/outcomes";
  import OutcomeList from "./OutcomeList.svelte";
  import ReviewView from "./ReviewView.svelte";
  import FlagList from "./FlagList.svelte";
  import Button from "../ui/Button.svelte";
  import TemplateActions from "../ui/TemplateActions.svelte";
  import { button } from "../starwind/button/variants";
  // Inlined at build time (?raw) — no runtime network, CSP-safe.
  import templateText from "../../templates/drawbridge-outcomes-v1.yaml?raw";
  import exampleText from "../../../fixtures/algebra-1-outcomes.yaml?raw";

  const s = $derived($session);
  const model = $derived($outcomeModel);
  const recovered = $derived($recoveredAt);

  let mode = $state<"edit" | "review">("edit");
  let loadError = $state<string | null>(null);

  // On mount, recover any unsaved session left in IndexedDB (crash/reload safety).
  onMount(() => {
    void actions.restore();
  });

  const recoveredTime = $derived(
    recovered
      ? new Date(recovered).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "",
  );

  function confirmDiscard(): boolean {
    return !s.dirty || confirm("Discard unsaved changes since your last export?");
  }

  async function onFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!confirmDiscard()) {
      input.value = "";
      return;
    }
    loadError = null;
    try {
      actions.loadText(await file.text(), file.name);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
    input.value = "";
  }

  function onNew() {
    if (confirmDiscard()) {
      loadError = null;
      actions.newBlank();
    }
  }

  function onClose() {
    if (confirmDiscard()) {
      loadError = null;
      void actions.close();
    }
  }

  function onLoadExample() {
    if (confirmDiscard()) {
      loadError = null;
      actions.loadText(exampleText, "algebra-1-outcomes.yaml");
    }
  }

  function onExport() {
    const text = actions.exportText();
    if (text == null) return;
    const name = s.fileName ?? "outcomes.drawbridge.yaml";
    const url = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<!-- Toolbar appears once a file is loaded; the focus is edit / review / export.
     New / Import are demoted to secondary controls for switching files. -->
{#if model}
  <div class="my-6 flex flex-wrap items-center gap-3">
    <div class="border-border inline-flex rounded-md border p-0.5 text-sm">
      {#each ["edit", "review"] as const as m}
        <button
          type="button"
          class="rounded px-2.5 py-0.5 capitalize"
          class:bg-primary={mode === m}
          class:text-primary-foreground={mode === m}
          class:text-muted-foreground={mode !== m}
          onclick={() => (mode = m)}
        >
          {m}
        </button>
      {/each}
    </div>
    <Button variant="primary" size="sm" onclick={onExport}>Export</Button>

    <span class="text-border" aria-hidden="true">|</span>
    <Button variant="ghost" size="sm" onclick={onClose}>← Start over</Button>

    {#if s.fileName}
      <span class="text-muted-foreground truncate font-mono text-xs" title={s.fileName}>
        {s.fileName}
      </span>
    {/if}
    {#if s.dirty}
      <span class="text-warning-foreground flex items-center gap-1 text-xs" title="Edits not yet exported">
        <span class="bg-warning inline-block size-2 rounded-full"></span>
        unsaved since export
      </span>
    {/if}
    {#if recovered}
      <span
        class="text-muted-foreground flex items-center gap-1.5 text-xs"
        title="This session was recovered from your browser's local storage; it was never uploaded"
      >
        ↻ restored from {recoveredTime}
        <button type="button" class="hover:text-error underline" onclick={() => actions.discardRecovered()}>
          discard
        </button>
      </span>
    {/if}
  </div>
{/if}

{#if loadError}
  <p
    class="border-error/40 bg-error/5 text-error rounded-md border px-3 py-2 text-sm"
    role="alert"
  >
    Couldn't read that file: {loadError}
  </p>
{/if}

{#if !model}
  <section class="border-border bg-card mt-6 max-w-2xl rounded-lg border p-6">
    <h2 class="text-lg font-semibold">Getting started</h2>
    <p class="text-muted-foreground mt-1 mb-4 text-sm">
      Build a course's outcomes in one portable YAML file. Pick a starting point —
      nothing leaves your browser.
    </p>
    <div class="border-border text-muted-foreground mb-5 rounded-md border border-dashed p-3 text-sm">
      <p class="mb-1">Three tiers, top to bottom:</p>
      <ul class="ml-4 list-disc space-y-0.5">
        <li><span class="text-foreground font-medium">Content Domain</span> — the broad areas of the course.</li>
        <li><span class="text-foreground font-medium">Assessed Outcome</span> — what you'd assess to see a domain is met.</li>
        <li><span class="text-foreground font-medium">Learning Objective</span> — the granular, teachable steps that map up to a domain.</li>
      </ul>
      <p class="mt-1.5 text-xs">Every tier's label and prefix is editable per file.</p>
    </div>
    <div class="divide-border flex flex-col divide-y">
      <div class="flex items-start justify-between gap-4 pb-4">
        <div>
          <p class="text-sm font-medium">Create a new file</p>
          <p class="text-muted-foreground text-sm">
            Start from an empty course and add outcomes as you go.
          </p>
        </div>
        <Button variant="primary" size="sm" onclick={onNew}>New file</Button>
      </div>

      <div class="flex items-start justify-between gap-4 py-4">
        <div>
          <p class="text-sm font-medium">Import a file</p>
          <p class="text-muted-foreground text-sm">
            Open an existing <code
              class="bg-accent text-accent-foreground rounded px-1 py-0.5 font-mono text-[0.8em]"
              >drawbridge-outcomes/1</code
            > YAML from your machine.
          </p>
        </div>
        <label class={button({ variant: "outline", size: "sm" }) + " shrink-0"}>
          <input
            class="sr-only"
            type="file"
            accept=".yaml,.yml,application/yaml,text/yaml"
            onchange={onFile}
          />
          Import…
        </label>
      </div>

      <div class="flex items-start justify-between gap-4 pt-4">
        <div>
          <p class="text-sm font-medium">Start from a template</p>
          <p class="text-muted-foreground text-sm">
            Download or copy a commented starter file.
            <a class="text-primary underline" href="/conventions/outcomes">Read the format →</a>
          </p>
        </div>
        <div class="shrink-0">
          <TemplateActions text={templateText} filename="outcomes.drawbridge.yaml" />
        </div>
      </div>

      <div class="flex items-start justify-between gap-4 pt-4">
        <div>
          <p class="text-sm font-medium">Load an example</p>
          <p class="text-muted-foreground text-sm">
            Explore a full Common Core math course (Algebra I).
          </p>
        </div>
        <Button variant="outline" size="sm" onclick={onLoadExample}>Load Algebra I</Button>
      </div>
    </div>
  </section>
{:else}
  <div class="mb-4">
    <FlagList selectable={mode === "edit"} />
  </div>

  {#if mode === "review"}
    <ReviewView />
  {:else}
    <div class="mb-4 flex flex-wrap items-end gap-4">
      <div>
        <label class="text-muted-foreground mb-1 block text-xs font-medium" for="course-title"
          >Course title</label
        >
        <input
          id="course-title"
          class="border-border bg-background focus-visible:border-outline rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-[var(--outline)]/30"
          value={model.course.title ?? ""}
          onchange={(e) => actions.setCourse("title", e.currentTarget.value)}
        />
      </div>
      <div>
        <label class="text-muted-foreground mb-1 block text-xs font-medium" for="course-code"
          >Code</label
        >
        <input
          id="course-code"
          class="border-border bg-background focus-visible:border-outline w-32 rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-[var(--outline)]/30"
          value={model.course.code ?? ""}
          onchange={(e) => actions.setCourse("code", e.currentTarget.value)}
        />
      </div>
    </div>

    <details class="mb-4">
      <summary class="text-muted-foreground cursor-pointer text-xs select-none">Schema</summary>
      <div class="border-border mt-2 max-w-xl overflow-hidden rounded-md border">
        <div
          class="bg-accent text-muted-foreground grid grid-cols-[5rem_1fr_5rem] gap-2 px-3 py-1.5 text-[0.7rem] font-medium tracking-wide uppercase"
        >
          <span>Tier</span><span>Label</span><span>Prefix</span>
        </div>
        {#each [["outcome", "Outcome"], ["evidence", "Evidence"], ["objective", "Objective"]] as const as [key, name]}
          <div class="border-border grid grid-cols-[5rem_1fr_5rem] items-center gap-2 border-t px-3 py-2">
            <span class="text-muted-foreground text-sm">{name}</span>
            <input
              aria-label={name + " label"}
              class="border-border bg-background focus-visible:border-outline rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-[var(--outline)]/30"
              value={model.terminology[key]}
              onchange={(e) => actions.setTerminology(key, e.currentTarget.value)}
            />
            <input
              aria-label={name + " prefix"}
              class="border-border bg-background focus-visible:border-outline rounded-md border px-2 py-1.5 font-mono text-sm outline-none focus-visible:ring-3 focus-visible:ring-[var(--outline)]/30"
              value={model.prefixes[key]}
              onchange={(e) => actions.setPrefix(key, e.currentTarget.value)}
            />
          </div>
        {/each}
      </div>
      <p class="text-muted-foreground mt-1.5 max-w-xl text-xs">
        Labels name each tier; the prefix is the short code shown with the auto-number
        (e.g. <span class="font-mono">CO 1</span>). Adding more tiers is coming later.
      </p>
    </details>

    <OutcomeList />
  {/if}
{/if}
