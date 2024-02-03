class TypingText extends HTMLElement {
  constructor() {
    super();
    this.current = 0;
    this.charIndex = 0;
    this.isDeleting = false;
    this.typingDelay = 200;
  }

  connectedCallback() {
    this.texts = JSON.parse(this.getAttribute("texts")) || [];
    this.delays = JSON.parse(this.getAttribute("delays")) || [200, 50, 1000];
    this.typeWriter();
  }

  typeWriter() {
    const phrase = this.texts[this.current];

    this.charIndex = this.isDeleting ? this.charIndex - 1 : this.charIndex + 1;
    this.typingDelay = this.isDeleting ? this.delays[1] : this.delays[0];

    this.innerHTML =
      `${phrase.slice(0, this.charIndex)}<span class='cursor'></span>`;

    if (this.charIndex === phrase.length) {
      this.isDeleting = true;
      this.typingDelay = this.delays[2];
    } else if (this.charIndex === 0) {
      this.isDeleting = false;
      this.current = (this.current + 1) % this.texts.length;
      this.typingDelay = this.delays[2];
    }

    setTimeout(() => this.typeWriter(), this.typingDelay);
  }
}

customElements.define("typing-text", TypingText);
