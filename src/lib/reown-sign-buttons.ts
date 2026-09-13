type SignMessageView = HTMLElement & {
  updated?: (changedProperties: Map<PropertyKey, unknown>) => void;
};

function compactButtons(view: SignMessageView) {
  const instruction = view.shadowRoot?.querySelector<HTMLElement>(
    'wui-text[variant="md-regular"]',
  );
  if (instruction) {
    instruction.textContent = "Sign this message to accept terms of use.";
    instruction.parentElement?.setAttribute("justifycontent", "center");
  }

  const buttons = view.shadowRoot?.querySelectorAll<HTMLElement>(
    'wui-button[data-testid="w3m-connecting-siwe-cancel"], wui-button[data-testid="w3m-connecting-siwe-sign"]',
  );
  if (buttons?.length !== 2) return;

  for (const button of buttons) {
    button.setAttribute("size", "md");
    button.removeAttribute("fullwidth");
    const reownButton = button as HTMLElement & {
      updateComplete?: Promise<unknown>;
    };
    void reownButton.updateComplete?.then(() => {
      const nativeButton = button.shadowRoot?.querySelector("button");
      if (nativeButton) {
        nativeButton.style.minWidth =
          button.getAttribute("data-testid") === "w3m-connecting-siwe-sign"
            ? "160px"
            : "128px";
      }
    });
  }
  buttons[0]?.parentElement?.setAttribute("justifycontent", "center");
}

function compactMountedViews(root: Document | ShadowRoot) {
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (element.localName === "w3m-siwx-sign-message-view") {
      const view = element as SignMessageView & {
        updateComplete?: Promise<unknown>;
      };
      void view.updateComplete?.then(() => compactButtons(view));
    }
    if (element.shadowRoot) compactMountedViews(element.shadowRoot);
  }
}

export function installCompactReownSignButtons() {
  if (typeof customElements === "undefined") return;

  void customElements.whenDefined("w3m-siwx-sign-message-view").then(() => {
    const viewClass = customElements.get("w3m-siwx-sign-message-view");
    if (!viewClass) return;

    const prototype = viewClass.prototype as SignMessageView & {
      gasportCompactButtonsInstalled?: boolean;
    };
    if (prototype.gasportCompactButtonsInstalled) return;
    prototype.gasportCompactButtonsInstalled = true;

    const previousUpdated = prototype.updated;
    prototype.updated = function (changedProperties) {
      previousUpdated?.call(this, changedProperties);
      compactButtons(this);
    };
    compactMountedViews(document);
  });
}
