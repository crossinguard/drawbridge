<script lang="ts">
  // Download / copy a starter template. The text is passed in as a prop (imported
  // ?raw in the page's Astro frontmatter, i.e. inlined at build time) so this
  // never hits the network — required: the Netlify CSP sets connect-src 'none',
  // so a runtime fetch() of the template would be blocked by design.
  import Button from "./Button.svelte";

  let {
    text,
    filename = "template.yaml",
    mime = "text/yaml",
  }: { text: string; filename?: string; mime?: string } = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="flex flex-wrap items-center gap-3">
  <Button variant="primary" size="sm" onclick={download}>Download template</Button>
  <Button variant="outline" size="sm" onclick={copy}>
    {copied ? "Copied ✓" : "Copy to clipboard"}
  </Button>
</div>
