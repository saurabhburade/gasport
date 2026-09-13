type AccountWidget = HTMLElement & {
  updated?: (changedProperties: Map<PropertyKey, unknown>) => void;
  updateComplete?: Promise<unknown>;
};

const actionIds = [
  "w3m-account-default-fund-wallet-button",
  "w3m-account-default-send-button",
  "w3m-account-default-activity-button",
  "disconnect-button",
];

function styleActionLabels(widget: AccountWidget) {
  for (const id of actionIds) {
    const label = widget.shadowRoot?.querySelector<
      HTMLElement & { updateComplete?: Promise<unknown> }
    >(`wui-list-item[data-testid="${id}"] > wui-text`);

    void label?.updateComplete?.then(() => {
      const slot = label.shadowRoot?.querySelector("slot");
      if (!slot) return;
      slot.style.fontSize = "14px";
      slot.style.fontWeight = "600";
      slot.style.lineHeight = "20px";
    });
  }
}

function styleMountedWidgets(root: Document | ShadowRoot) {
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (element.localName === "w3m-account-default-widget") {
      const widget = element as AccountWidget;
      void widget.updateComplete?.then(() => styleActionLabels(widget));
    }
    if (element.shadowRoot) styleMountedWidgets(element.shadowRoot);
  }
}

export function installReownAccountActionTypography() {
  if (typeof customElements === "undefined") return;

  void customElements.whenDefined("w3m-account-default-widget").then(() => {
    const widgetClass = customElements.get("w3m-account-default-widget");
    if (!widgetClass) return;

    const prototype = widgetClass.prototype as AccountWidget & {
      gasportAccountTypographyInstalled?: boolean;
    };
    if (prototype.gasportAccountTypographyInstalled) return;
    prototype.gasportAccountTypographyInstalled = true;

    const previousUpdated = prototype.updated;
    prototype.updated = function (changedProperties) {
      previousUpdated?.call(this, changedProperties);
      styleActionLabels(this);
    };
    styleMountedWidgets(document);
  });
}
