<script lang="ts">
  // Read-only review, relationship-first: each objective is shown under the
  // outcome(s) it maps to — nested under a specific evidence outcome when that
  // EO's scope pins it, otherwise at the course-outcome level. Objectives mapped
  // to nothing appear in their own Unassigned group. Cross-mappings ("also CO 2")
  // stay visible so nothing is hidden.
  import { outcomeModel, numbers } from "../../stores/outcomes";
  import { groupByOutcome } from "$lib/outcomes/grouping";
  import { displayLabel } from "$lib/outcomes/numbering";

  const model = $derived($outcomeModel);
  const nums = $derived($numbers);
  const grouped = $derived(model ? groupByOutcome(model) : null);
</script>

{#snippet num(text: string)}
  <span class="text-foreground shrink-0 text-sm font-semibold">{text}</span>
{/snippet}

{#snippet loLine(lo: { id: string; text: string; maps_to: string[] }, coId: string)}
  {@const others = lo.maps_to.filter((c) => c !== coId)}
  <li class="flex items-baseline gap-2">
    {@render num("LO " + nums.objective.get(lo.id))}
    <span>
      {lo.text || "(untitled)"}
      {#if others.length}
        <span class="text-muted-foreground text-xs"
          >· also {others.map((c) => displayLabel(nums, c)).join(", ")}</span
        >
      {/if}
    </span>
  </li>
{/snippet}

{#if model && grouped}
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

    {#each grouped.outcomes as g}
      <article class="border-border bg-card mb-3 rounded-lg border px-4 py-3">
        <div class="flex items-baseline gap-2.5">
          {@render num("CO " + nums.outcome.get(g.co.id))}
          <p class="m-0 font-medium">{g.co.text || "(untitled)"}</p>
        </div>

        {#if g.evidence.length}
          <ul class="border-border mt-2 flex flex-col gap-2 border-l pl-3">
            {#each g.evidence as ev}
              <li>
                <div class="flex items-baseline gap-2 text-[0.95rem]">
                  {@render num("EO " + nums.evidence.get(ev.eo.id))}
                  <span>{ev.eo.text || "(untitled)"}</span>
                </div>
                {#if ev.objectives.length}
                  <ul class="mt-1 flex flex-col gap-0.5 pl-4 text-sm">
                    {#each ev.objectives as lo}
                      {@render loLine(lo, g.co.id)}
                    {/each}
                  </ul>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}

        {#if g.objectives.length}
          <div class="mt-3">
            <p class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
              {model.terminology.objective}s
            </p>
            <ul class="flex flex-col gap-0.5 pl-1 text-sm">
              {#each g.objectives as lo}
                {@render loLine(lo, g.co.id)}
              {/each}
            </ul>
          </div>
        {/if}
      </article>
    {/each}

    {#if grouped.unassigned.length}
      <article class="border-border mb-3 rounded-lg border border-dashed px-4 py-3">
        <p class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
          Unassigned {model.terminology.objective}s
        </p>
        <ul class="flex flex-col gap-0.5 pl-1 text-sm">
          {#each grouped.unassigned as lo}
            {@render loLine(lo, "")}
          {/each}
        </ul>
      </article>
    {/if}
  </section>
{/if}
