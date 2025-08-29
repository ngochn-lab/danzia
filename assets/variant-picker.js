import { Component } from '@theme/component';
import { VariantSelectedEvent, VariantUpdateEvent } from '@theme/events';
import { morph } from '@theme/morph';

/**
 * A custom element that manages a variant picker.
 *
 * @template {import('@theme/component').Refs} [Refs = {}]
 *
 * @extends Component<Refs>
 */
export default class VariantPicker extends Component {
  /** @type {string | undefined} */
  #pendingRequestUrl;

  /** @type {AbortController | undefined} */
  #abortController;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('change', this.variantChanged.bind(this));
  }

  /**
   * Handles the variant change event.
   * @param {Event} event - The variant change event.
   */
  variantChanged(event) {
    if (!(event.target instanceof HTMLElement)) return;

    this.updateSelectedOption(event.target);
    this.dispatchEvent(new VariantSelectedEvent({ id: event.target.dataset.optionValueId ?? '' }));

    const isOnProductPage =
      this.dataset.templateProductMatch === 'true' &&
      !event.target.closest('product-card') &&
      !event.target.closest('quick-add-dialog');

    const currentUrl = this.dataset.productUrl?.split('?')[0];
    const newUrl = event.target.dataset.connectedProductUrl;
    const loadsNewProduct = isOnProductPage && !!newUrl && newUrl !== currentUrl;

    this.fetchUpdatedSection(this.buildRequestUrl(event.target), loadsNewProduct);

    const url = new URL(window.location.href);
    let variantId;

    if (event.target instanceof HTMLInputElement && event.target.type === 'radio') {
      variantId = event.target.dataset.variantId || null;
    } else if (event.target instanceof HTMLSelectElement) {
      const selectedOption = event.target.options[event.target.selectedIndex];
      variantId = selectedOption?.dataset.variantId || null;
    }

    if (isOnProductPage) {
      if (variantId) {
        url.searchParams.set('variant', variantId);
      } else {
        url.searchParams.delete('variant');
      }
    }

    if (loadsNewProduct) {
      url.pathname = newUrl;
    }
    if (url.href !== window.location.href) {
      history.replaceState({}, '', url.toString());
    }
  }

  /**
   * Updates the selected option.
   * @param {string | Element} target - The target element.
   */
  updateSelectedOption(target) {
    if (typeof target === 'string') {
      const targetElement = this.querySelector(`[data-option-value-id="${target}"]`);
      if (!targetElement) throw new Error('Target element not found');
      target = targetElement;
    }

    if (target instanceof HTMLInputElement) {
      target.checked = true;
    }

    if (target instanceof HTMLSelectElement) {
      const newValue = target.value;
      const newSelectedOption = Array.from(target.options).find((option) => option.value === newValue);
      if (!newSelectedOption) throw new Error('Option not found');
      for (const option of target.options) {
        option.removeAttribute('selected');
      }
      newSelectedOption.setAttribute('selected', 'selected');
    }
  }

  /**
   * Builds the request URL.
   * @param {HTMLElement} selectedOption - The selected option.
   * @param {string | null} [source] - The source.
   * @param {string[]} [sourceSelectedOptionsValues] - The source selected options values.
   * @returns {string} The request URL.
   */
  buildRequestUrl(selectedOption, source = null, sourceSelectedOptionsValues = []) {
    let productUrl = selectedOption.dataset.connectedProductUrl || this.#pendingRequestUrl || this.dataset.productUrl;
    this.#pendingRequestUrl = productUrl;
    const params = [];
    if (this.selectedOptionsValues.length && !source) {
      params.push(`option_values=${this.selectedOptionsValues.join(',')}`);
    } else if (source === 'product-card') {
      if (this.selectedOptionsValues.length) {
        params.push(`option_values=${sourceSelectedOptionsValues.join(',')}`);
      } else {
        params.push(`option_values=${selectedOption.dataset.optionValueId}`);
      }
    }
    if (this.closest('quick-add-component') || this.closest('swatches-variant-picker-component')) {
      if (productUrl?.includes('?')) {
        productUrl = productUrl.split('?')[0];
      }
      return `${productUrl}?section_id=section-rendering-product-card&${params.join('&')}`;
    }
    return `${productUrl}?${params.join('&')}`;
  }

  /**
   * Fetches the updated section.
   * @param {string} requestUrl - The request URL.
   * @param {boolean} shouldMorphMain - If the entire main content should be morphed.
   */
  fetchUpdatedSection(requestUrl, shouldMorphMain = false) {
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    fetch(requestUrl, { signal: this.#abortController.signal })
      .then((response) => response.text())
      .then((responseText) => {
        this.#pendingRequestUrl = undefined;
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        html.querySelector('overflow-list[defer]')?.removeAttribute('defer');

        const textContent = html.querySelector(`variant-picker script[type="application/json"]`)?.textContent;
        if (!textContent) return;

        let variantData;
        try {
          variantData = JSON.parse(textContent);
        } catch (e) {
          console.error('[VariantPicker] Could not parse variant JSON', textContent);
          return;
        }

        if (shouldMorphMain) {
          this.updateMain(html);
        } else {
          const newProduct = this.updateVariantPicker(html, variantData);
          if (this.selectedOptionId) {
            this.dispatchEvent(
              new VariantUpdateEvent(variantData, this.selectedOptionId, {
                html,
                productId: this.dataset.productId ?? '',
                newProduct,
              })
            );
          }
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          console.log('Fetch aborted by user');
        } else {
          console.error(error);
        }
      });
  }

  /**
   * Re-renders the variant picker and updates gallery image.
   * @param {Document} newHtml - The new HTML.
   * @param {object} variantData - The new variant data.
   * @returns {object|undefined} Information about the new product if it has changed.
   */
  updateVariantPicker(newHtml, variantData) {
    let newProduct;
    const newVariantPickerSource = newHtml.querySelector(this.tagName.toLowerCase());
    if (!newVariantPickerSource) {
      throw new Error('No new variant picker source found');
    }

    // Update card data attributes (for combined listings)
    if (newVariantPickerSource instanceof HTMLElement) {
      const newProductId = newVariantPickerSource.dataset.productId;
      const newProductUrl = newVariantPickerSource.dataset.productUrl;
      if (newProductId && newProductUrl && this.dataset.productId !== newProductId) {
        newProduct = { id: newProductId, url: newProductUrl };
      }
      this.dataset.productId = newProductId;
      this.dataset.productUrl = newProductUrl;
    }

    // Morph the picker
    morph(this, newVariantPickerSource);

    // LOGGING: All gallery images after morph
    const productCard = this.closest('product-card, .product-card__content, .product-card-link');
    if (productCard) {
      const galleryImgs = productCard.querySelectorAll('.product-media__image');
      galleryImgs.forEach(img => {
        console.log('[VariantPicker] Gallery image after morph:', img, 'src:', img.src, 'alt:', img.alt);
      });

      // Update first gallery image in card with new variant image
      if (galleryImgs.length > 0 && variantData && variantData.featured_image && variantData.featured_image.src) {
        galleryImgs[0].src = variantData.featured_image.src;
        galleryImgs[0].alt = variantData.featured_image.alt || '';
        console.log('[VariantPicker] Updated gallery image:', galleryImgs[0]);
      } else {
        console.warn('[VariantPicker] No gallery image or no variant image data to update');
      }
    } else {
      console.warn('[VariantPicker] No product card found for image update');
    }

    return newProduct;
  }

  /**
   * Re-renders the entire main content.
   * @param {Document} newHtml - The new HTML.
   */
  updateMain(newHtml) {
    const main = document.querySelector('main');
    const newMain = newHtml.querySelector('main');
    if (!main || !newMain) {
      throw new Error('No new main source found');
    }
    morph(main, newMain);
  }

  /**
   * Gets the selected option.
   * @returns {HTMLInputElement | HTMLOptionElement | undefined} The selected option.
   */
  get selectedOption() {
    const selectedOption = this.querySelector('select option[selected], fieldset input:checked');
    if (!(selectedOption instanceof HTMLInputElement || selectedOption instanceof HTMLOptionElement)) {
      return undefined;
    }
    return selectedOption;
  }

  /**
   * Gets the selected option ID.
   * @returns {string | undefined} The selected option ID.
   */
  get selectedOptionId() {
    const { selectedOption } = this;
    if (!selectedOption) return undefined;
    const { optionValueId } = selectedOption.dataset;
    if (!optionValueId) {
      throw new Error('No option value ID found');
    }
    return optionValueId;
  }

  /**
   * Gets the selected options values.
   * @returns {string[]} The selected options values.
   */
  get selectedOptionsValues() {
    const selectedOptions = Array.from(this.querySelectorAll('select option[selected], fieldset input:checked'));
    return selectedOptions.map((option) => {
      const { optionValueId } = option.dataset;
      if (!optionValueId) throw new Error('No option value ID found');
      return optionValueId;
    });
  }
}

if (!customElements.get('variant-picker')) {
  customElements.define('variant-picker', VariantPicker);
}