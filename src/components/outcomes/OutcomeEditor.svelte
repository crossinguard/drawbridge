<script lang="ts">
  // Outcome Builder shell: toolbar (import / new / export), course fields, and the
  // list + edit-panel layout. All document state lives in the store; this island
  // only wires the DOM to it. Files remain canonical — the dirty indicator warns
  // when edits haven't been exported yet (hard rule #6).
  import { session, outcomeModel, flags, actions } from "../../stores/outcomes";
  import OutcomeList from "./OutcomeList.svelte";
  import EditPanel from "./EditPanel.svelte";
  import Button from "../ui/Button.svelte";
  import Badge from "../ui/Badge.svelte";
  import { button } from "../starwind/button/variants";

  const s = $derived($session);
  const model = $derived($outcomeModel);
  const allFlags = $derived($flags);

  let loadError = $state<string | null>(null);

  const flagCounts = $derived.by(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const f of allFlags) c[f.severity]++;
    return c;
  });

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

<div class="my-6 flex flex-wrap items-center gap-3">
  <label class={button({ variant: "outline", size: "sm" })}>
    <input
      class="sr-only"
      type="file"
      accept=".yaml,.yml,application/yaml,text/yaml"
      onchange={onFile}
    />
    Import…
  </label>
  <Button variant="outline" size="sm" onclick={onNew}>New</Button>
  <Button variant="primary" size="sm" onclick={onExport} disabled={!model}>
    Export
  </Button>
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
</div>

{#if loadError}
  <p
    class="border-error/40 bg-error/5 text-error rounded-md border px-3 py-2 text-sm"
    role="alert"
  >
    Couldn't read that file: {loadError}
  </p>
{/if}

{#if !model}
  <p class="text-muted-foreground max-w-2xl">
    <button type="button" class="text-primary underline" onclick={onNew}>Start a new file</button>
    or Import an existing <code
      class="bg-accent text-accent-foreground rounded px-1.5 py-0.5 font-mono text-[0.8em]"
      >drawbridge-outcomes/1</code
    > YAML. Nothing leaves your browser.
  </p>
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
    {#if allFlags.length}
      <div class="flex items-center gap-1.5 text-xs">
        {#if flagCounts.error}<Badge variant="error" size="sm">{flagCounts.error} error</Badge>{/if}
        {#if flagCounts.warn}<Badge variant="warning" size="sm">{flagCounts.warn} warn</Badge>{/if}
        {#if flagCounts.info}<Badge variant="info" size="sm">{flagCounts.info} info</Badge>{/if}
        <span class="text-muted-foreground">flags never block</span>
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-1 gap-5 md:grid-cols-[1fr_20rem]">
    <OutcomeList />
    <EditPanel />
  </div>
{/if}
