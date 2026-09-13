type ReownElement = HTMLElement & {
  updated?: (changedProperties: Map<PropertyKey, unknown>) => void;
  updateComplete?: Promise<unknown>;
  gasportTypographyInstalled?: boolean;
};

function styleTag(tag: ReownElement) {
  tag.style.setProperty("--apkt-textSize-small", "10px");
  tag.style.setProperty("--apkt-textSize-medium", "12px");
}

function addShadowStyle(element: ReownElement, selector: string) {
  const root = element.shadowRoot;
  if (!root || root.querySelector("style[data-gasport-typography]")) return;

  const style = document.createElement("style");
  style.dataset.gasportTypography = "";
  style.textContent = `${selector} { font-weight: 600 !important; }`;
  root.append(style);
}

function styleMountedElements(
  root: Document | ShadowRoot,
  tagName: string,
  apply: (element: ReownElement) => void,
) {
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (element.localName === tagName) {
      const reownElement = element as ReownElement;
      void reownElement.updateComplete?.then(() => apply(reownElement));
    }
    if (element.shadowRoot)
      styleMountedElements(element.shadowRoot, tagName, apply);
  }
}

function installTypography(
  tagName: string,
  apply: (element: ReownElement) => void,
) {
  void customElements.whenDefined(tagName).then(() => {
    const elementClass = customElements.get(tagName);
    if (!elementClass) return;

    const prototype = elementClass.prototype as ReownElement;
    if (prototype.gasportTypographyInstalled) return;
    prototype.gasportTypographyInstalled = true;

    const previousUpdated = prototype.updated;
    prototype.updated = function (changedProperties) {
      previousUpdated?.call(this, changedProperties);
      apply(this);
    };
    styleMountedElements(document, tagName, apply);
  });
}

export function installReownTypography() {
  if (typeof customElements === "undefined") return;

  installTypography("wui-tag", styleTag);
  installTypography("w3m-legal-footer", (element) =>
    addShadowStyle(element, "a"),
  );
  installTypography("w3m-legal-checkbox", (element) =>
    addShadowStyle(element, "a"),
  );
  installTypography("wui-balance", (element) =>
    addShadowStyle(element, "span"),
  );
  installTypography("w3m-swap-input", (element) =>
    addShadowStyle(element, ".swap-input input"),
  );
}
