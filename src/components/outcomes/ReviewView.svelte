<script lang="ts">
  // Read-only review, relationship-first: each objective is shown under the
  // outcome(s) it maps to — nested under a specific evidence outcome when that
  // EO's scope pins it, otherwise at the course-outcome level. Objectives mapped
  // to nothing appear in their own Unassigned group. Cross-mappings ("also CO 2")
  // stay visible so nothing is hidden.
  //
  // Each level has a deliberately distinct treatment so the hierarchy scans at a
  // glance: CO = filled header strip, EO = soft badge on a teal rail, LO = a
  // muted, bulleted leaf.
  import { outcomeModel, identifiers } from "../../stores/outcomes";
  import { groupByOutcome } from "$lib/outcomes/grouping";
  import { labelFor } from "$lib/outcomes/numbering";

  const model = $derived($outcomeModel);
  const ids = $derived($identifiers);
  const grouped = $derived(model ? groupByOutcome(model) : null);
</script>

{#snippet loLine(lo: { id: string; text: string; maps_to: string[] }, coId: string)}
  {@const others = lo.maps_to.filter((c) => c !== coId)}
  <li class="flex items-start gap-2 text-sm">
    <span class="bg-primary/40 mt-1.5 size-1.5 shrink-0 rounded-full"></span>
    <span class="text-muted-foreground shrink-0 text-[0.7rem] font-semibold tracking-wide">
      {labelFor(ids, lo.id)}
    </span>
    <span class="text-muted-foreground">
      {lo.text || "(untitled)"}
      {#if others.length}
        <span class="text-xs italic"
          >· also {others.map((c) => labelFor(ids, c)).join(", ")}</span
        >
      {/if}
    </span>
  </li>
{/snippet}

{#if model && grouped}
  <section class="max-w-3xl">
    <header class="mb-5 flex flex-wrap items-baseline gap-3">
      <h2 class="text-2xl font-semibold tracking-tight">
        {model.course.title || "Untitled course"}
      </h2>
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
      <article class="border-border mb-4 overflow-hidden rounded-lg border">
        <!-- CO: header strip, filled badge, largest/boldest text -->
        <div class="bg-accent border-border flex items-baseline gap-2.5 border-b px-4 py-2.5">
          <span
            class="bg-primary text-primary-foreground shrink-0 rounded px-2 py-0.5 text-xs font-semibold tracking-wide"
          >
            {labelFor(ids, g.co.id)}
          </span>
          <h3 class="text-foreground m-0 text-base leading-snug font-semibold">
            {g.co.text || "(untitled)"}
          </h3>
        </div>

        <div class="bg-card flex flex-col gap-3.5 px-4 py-3.5">
          {#if g.evidence.length}
            <!-- EO: soft badge on a teal rail, medium text -->
            <ul class="border-primary/25 flex flex-col gap-2.5 border-l-2 pl-3">
              {#each g.evidence as ev}
                <li>
                  <div class="flex items-baseline gap-2">
                    <span
                      class="bg-accent text-accent-foreground shrink-0 rounded px-1.5 py-0.5 text-[0.7rem] font-semibold tracking-wide"
                    >
                      {labelFor(ids, ev.eo.id)}
                    </span>
                    <span class="text-foreground text-sm">{ev.eo.text || "(untitled)"}</span>
                  </div>
                  {#if ev.objectives.length}
                    <ul class="mt-1.5 flex flex-col gap-1 pl-3">
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
            <div>
              <p class="text-muted-foreground mb-1.5 text-[0.7rem] font-semibold tracking-wider uppercase">
                {model.terminology.objective}s
              </p>
              <ul class="flex flex-col gap-1">
                {#each g.objectives as lo}
                  {@render loLine(lo, g.co.id)}
                {/each}
              </ul>
            </div>
          {/if}

          {#if g.evidence.length === 0 && g.objectives.length === 0}
            <p class="text-muted-foreground text-sm italic">
              No {model.terminology.evidence.toLowerCase()} or
              {model.terminology.objective.toLowerCase()}s yet.
            </p>
          {/if}
        </div>
      </article>
    {/each}

    {#if grouped.unassigned.length}
      <article class="border-border mb-4 rounded-lg border border-dashed px-4 py-3.5">
        <p class="text-muted-foreground mb-1.5 text-[0.7rem] font-semibold tracking-wider uppercase">
          Unassigned {model.terminology.objective}s
        </p>
        <ul class="flex flex-col gap-1">
          {#each grouped.unassigned as lo}
            {@render loLine(lo, "")}
          {/each}
        </ul>
      </article>
    {/if}
  </section>
{/if}
