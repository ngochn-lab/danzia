// Create a new custom element for product links with images for transitions to PDP
class ProductCardLink extends HTMLElement {
  connectedCallback() {
    // Use capture phase to ensure the custom element receives the click before child anchors
    this.addEventListener("click", this.#handleClick, true);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#handleClick, true);
  }

  get productTransitionEnabled() {
    return this.getAttribute("data-product-transition") === "true";
  }

  get featuredMediaUrl() {
    return this.getAttribute("data-featured-media-url");
  }

  /**
   * Handles the click event for the product link
   * @param {Event} event
   */
  #handleClick = (event) => {
    // If the click was on a child anchor, let native navigation happen and do not block
    if (event.target instanceof Element && event.target.closest("a")) {
      return;
    }
    // If the event has been prevented, don't do anything, another component is handling the click
    if (event.defaultPrevented) return;

    // If the event was on an interactive element, don't do anything, this is not a navigation
    if (event.target instanceof Element) {
      const interactiveElement = event.target.closest(
        'button, input, label, select, [tabindex="1"]'
      );
      if (interactiveElement) return;
    }

    const gallery = this.querySelector(
      "[data-view-transition-to-main-product]"
    );
    if (!this.productTransitionEnabled || !(gallery instanceof HTMLElement))
      return;

    // Check on the current active image, whether it's a product card image or a resource card image
    const activeImage =
      gallery.querySelector(
        'slideshow-slide[aria-hidden="false"] [transitionToProduct="true"]'
      ) || gallery.querySelector('[transitionToProduct="true"]:last-child');

    if (activeImage instanceof HTMLImageElement)
      this.#setImageSrcset(activeImage);

    gallery.setAttribute(
      "data-view-transition-type",
      "product-image-transition"
    );
    gallery.setAttribute("data-view-transition-triggered", "true");

    // Redirect to product page
    const anchor = this.querySelector("a.product-card__link");
    if (anchor && anchor.href) {
      window.location.href = anchor.href;
    }
  };

  /**
   * Sets the srcset for the image
   * @param {HTMLImageElement} image
   */
  #setImageSrcset(image) {
    if (!this.featuredMediaUrl) return;

    const currentImageUrl = new URL(image.currentSrc);

    // Deliberately not using origin, as it includes the protocol, which is usually skipped for featured media
    const currentImageRawUrl = currentImageUrl.host + currentImageUrl.pathname;

    if (!this.featuredMediaUrl.includes(currentImageRawUrl)) {
      const imageFade = image.animate([{ opacity: 0.8 }, { opacity: 1 }], {
        duration: 125,
        easing: "ease-in-out",
      });

      imageFade.onfinish = () => {
        image.srcset = this.featuredMediaUrl ?? "";
      };
    }
  }
}

if (!customElements.get("product-card-link")) {
  customElements.define("product-card-link", ProductCardLink);
}
