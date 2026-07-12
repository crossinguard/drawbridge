<script lang="ts">
  // Read-only review rendering of the current document: display numbers, nested
  // evidence with scope, and computed reverse mappings. No editing affordances —
  // this is the "read it end to end" mode.
  import { outcomeModel, numbers } from "../../stores/outcomes";
  import { losForOutcome } from "$lib/outcomes/validate";
  import { displayLabel } from "$lib/outcomes/numbering";

  const model = $derived($outcomeModel);
  const nums = $derived($numbers);
</script>

{#snippet num(text: string)}
  <span class="text-foreground shrink-0 text-sm font-semibold">{text}</span>
{/snippet}

{#if model}
  <section class="max-w-3xl">
    <header class="border-border mb-4 flex flex-wrap items-baseline gap-3 border-b pb-2">
      <h2 class="text-xl font-semibold">{model.course.title || "Untitled course"}</h2>
      {#if model.course.code}
        <code class="bg-accent text-accent-foreground rounded px-1.5 py-0.5 font-mono text-xs"
          >{model.course.code}</code
        >
      {/if}
      <span class="text-muted-foreground text-sm">
        {model.outcomes.length}
        {model.terminology.outcome}s · {model.objectives.length}
        {model.terminology.objective}s
      </span>
    </header>

    <h3 class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
      {model.terminology.outcome}s
    </h3>
    {#each model.outcomes as co}
      {@const mapped = losForOutcome(model, co.id)}
      <article class="border-border bg-card mb-2.5 rounded-lg border px-4 py-3">
        <div class="flex items-baseline gap-2.5">
          {@render num("CO " + nums.outcome.get(co.id))}
          <p class="m-0">{co.text || "(untitled)"}</p>
        </div>
        {#if co.evidence.length}
          <ul class="mt-2 flex flex-col gap-1 pl-4 text-[0.95rem]">
            {#each co.evidence as eo}
              <li class="flex items-baseline gap-2">
                {@render num("EO " + nums.evidence.get(eo.id))}
                <span>
                  {eo.text || "(untitled)"}
                  {#if eo.scope?.length}
                    <span class="text-muted-foreground text-xs">
                      · scope: {eo.scope.map((s) => displayLabel(nums, s)).join(", ")}
                    </span>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if mapped.length}
          <p class="text-muted-foreground mt-2 text-xs">
            Mapped {model.terminology.objective}s: {mapped
              .map((l) => displayLabel(nums, l))
              .join(", ")}
          </p>
        {/if}
      </article>
    {/each}

    <h3 class="text-muted-foreground mt-6 mb-2 text-xs font-medium tracking-wide uppercase">
      {model.terminology.objective}s
    </h3>
    {#each model.objectives as lo}
      <article class="border-border bg-card mb-2.5 rounded-lg border px-4 py-3">
        <div class="flex items-baseline gap-2.5">
          {@render num("LO " + nums.objective.get(lo.id))}
          <p class="m-0">
            {lo.text || "(untitled)"}
            {#if lo.maps_to.length}
              <span class="text-muted-foreground text-xs">
                → {lo.maps_to.map((c) => displayLabel(nums, c)).join(", ")}
              </span>
            {/if}
          </p>
        </div>
      </article>
    {/each}
  </section>
{/if}
