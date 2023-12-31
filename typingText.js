class TypingText extends HTMLElement {
  constructor() {
    super();
    this.current = 0;
    this.charIndex = 0;
    this.isDeleting = false;
    this.typingDelay = 200;
  }

  connectedCallback() {
    this.greetings = JSON.parse(this.getAttribute("greetings")) || [];
    this.typeWriter();
  }

  typeWriter() {
    const phrase = this.greetings[this.current];

    this.charIndex = this.isDeleting ? this.charIndex - 1 : this.charIndex + 1;
    this.typingDelay = this.isDeleting ? 50 : 200;

    this.innerHTML =
      `${phrase.slice(0, this.charIndex)}<span class='cursor'></span>`;

    if (this.charIndex === phrase.length) {
      this.isDeleting = true;
      this.typingDelay = 1000;
    } else if (this.charIndex === 0) {
      this.isDeleting = false;
      this.current = (this.current + 1) % this.greetings.length;
      this.typingDelay = 1000;
    }

    setTimeout(() => this.typeWriter(), this.typingDelay);
  }
}

customElements.define("typing-text", TypingText);
