// Test fixture for ops/chatbot/ops/tests/test_east_widget.py, NOT the real widget (that is
// ops/chatbot/ops/east/chatwoot-widget.tsx, fetched by east_widget.py at a pinned commit + sha256).
// It carries only what east_widget.py builds and checks with: the prnm-chatwoot-v1 marker, the
// two build-time env names and the prnm-chat-launcher id.
const MARK = "prnm-chatwoot-v1";
const TOKEN: unknown = import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN;
const SRI: unknown = import.meta.env.VITE_CHATWOOT_SDK_SRI;

export function ChatwootWidget() {
  if (typeof TOKEN !== "string" || typeof SRI !== "string") return null;
  return (
    <button id="prnm-chat-launcher" data-mark={MARK} data-sri={SRI} aria-label="Chat with Pool Rental Near Me">
      Chat
    </button>
  );
}
