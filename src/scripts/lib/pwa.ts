import { registerSW } from "virtual:pwa-register";

let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;

function notice(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-pwa-update]");
}

updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    const element = notice();
    if (element) element.style.display = "block";
  },
});

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("[data-pwa-reload]")) {
    void updateServiceWorker?.(true);
  }
  if (target.closest("[data-pwa-dismiss]")) {
    const element = notice();
    if (element) element.style.display = "none";
  }
});
