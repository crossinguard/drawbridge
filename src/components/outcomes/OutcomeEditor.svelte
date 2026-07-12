<script lang="ts">
  // Outcome Builder shell: toolbar (import / new / export / mode), validation
  // detail, and either the editing layout (list + panel) or the read-only review
  // view. All document state lives in the store; this island wires the DOM to it.
  // Files remain canonical — the dirty indicator warns when edits haven't been
  // exported yet (hard rule #6).
  import { onMount } from "svelte";
  import { session, outcomeModel, recoveredAt, actions } from "../../stores/outcomes";
  import OutcomeList from "./OutcomeList.svelte";
  import EditPanel from "./EditPanel.svelte";
  import ReviewView from "./ReviewView.svelte";
  import FlagList from "./FlagList.svelte";
  import Button from "../ui/Button.svelte";
  import { button } from "../starwind/button/variants";

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
  <Button variant="primary" size="sm" onclick={onExport} disabled={!model}>Export</Button>

  {#if model}
    <div class="border-border ml-1 inline-flex rounded-md border p-0.5 text-sm">
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
  {/if}

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
      <summary class="text-muted-foreground cursor-pointer text-xs select-none">
        Terminology
      </summary>
      <div class="mt-2 flex flex-wrap gap-3">
        {#each [["outcome", "Outcome"], ["evidence", "Evidence"], ["objective", "Objective"]] as const as [key, name]}
          <div>
            <label class="text-muted-foreground mb-1 block text-xs font-medium" for={"term-" + key}
              >{name} label</label
            >
            <input
              id={"term-" + key}
              class="border-border bg-background focus-visible:border-outline w-40 rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-[var(--outline)]/30"
              value={model.terminology[key]}
              onchange={(e) => actions.setTerminology(key, e.currentTarget.value)}
            />
          </div>
        {/each}
      </div>
    </details>

    <div class="grid grid-cols-1 gap-5 md:grid-cols-[1fr_20rem]">
      <OutcomeList />
      <EditPanel />
    </div>
  {/if}
{/if}
